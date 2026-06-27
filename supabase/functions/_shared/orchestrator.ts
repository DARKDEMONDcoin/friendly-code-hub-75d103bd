// Silent Orchestrator — multi-agent workspace flow.
// Inspired by CrewAI hierarchical mode, LangGraph supervisor and OpenAI Swarm.
//
//   user msg
//      │
//      ▼
//  [Lead — Kimi K2]
//      ├── plan  → JSON {tasks:[{agent_slug, instruction}]}
//      ├── dispatch (parallel) → each specialist replies
//      └── synthesize → single unified reply to the user
//
// Specialist replies are saved with metadata.internal=true so the UI can
// hide them while preserving the full trace for audit.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { kimiChat, kimiJson, type KimiMessage } from "./kimi.ts";
import {
  buildToolsPrompt,
  loadEnabledTools,
  parseToolLoopStep,
  runToolCalls,
  type ToolResult,
} from "./agent-tools.ts";

type Admin = ReturnType<typeof createClient>;

export type WorkspaceAgent = {
  slug: string;
  name: string;
  description?: string | null;
  system_prompt?: string | null;
  color?: string | null;
  image_url?: string | null;
  model?: string | null;
};

const HISTORY_LIMIT = 20;

async function loadVisibleHistory(admin: Admin, sessionId: string): Promise<KimiMessage[]> {
  const { data } = await admin
    .from("agent_messages")
    .select("role, content, metadata, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const rows = (data || [])
    .reverse()
    .filter(
      (r: any) =>
        (r.role === "user" || r.role === "assistant") &&
        typeof r.content === "string" &&
        r.content.trim().length > 0 &&
        !(r.metadata && r.metadata.internal === true),
    );
  return rows.map((r: any) => ({
    role: r.role,
    content: r.content,
  })) as KimiMessage[];
}

type PlanTask = { agent_slug: string; instruction: string };

async function plan(
  history: KimiMessage[],
  userMessage: string,
  agents: WorkspaceAgent[],
): Promise<PlanTask[]> {
  const roster = agents
    .map((a) => `- slug: "${a.slug}" | name: ${a.name} | role: ${a.description || "specialist"}`)
    .join("\n");

  const sys = `You are the Lead Coordinator of a multi-agent team.
Your job: read the user's request and split it into clear sub-tasks, one per relevant specialist.

Team:
${roster}

Rules:
- Pick ONLY the agents whose expertise is needed for THIS specific request. Do not assign every agent every time.
- If only one specialist is needed, return one task.
- Each instruction must be self-contained, in the user's language, and laser-focused on what that specialist must produce.
- Output STRICT JSON of shape: {"tasks":[{"agent_slug":"...","instruction":"..."}]}
- agent_slug MUST be one of the listed slugs.
- Do not include any prose outside the JSON.`;

  const messages: KimiMessage[] = [
    { role: "system", content: sys },
    ...history,
    { role: "user", content: userMessage },
  ];

  try {
    const out = await kimiJson<{ tasks: PlanTask[] }>({
      messages,
      tier: "pro",
      temperature: 0.3,
      max_tokens: 800,
    });
    const valid = (out?.tasks || []).filter(
      (t) =>
        t &&
        typeof t.agent_slug === "string" &&
        typeof t.instruction === "string" &&
        agents.some((a) => a.slug === t.agent_slug),
    );
    if (valid.length === 0) {
      // Fallback: assign to the first agent
      return [
        {
          agent_slug: agents[0].slug,
          instruction: userMessage,
        },
      ];
    }
    return valid;
  } catch (_e) {
    return [{ agent_slug: agents[0].slug, instruction: userMessage }];
  }
}

async function runSpecialist(
  admin: Admin,
  userId: string,
  sessionId: string,
  agent: WorkspaceAgent,
  instruction: string,
  history: KimiMessage[],
): Promise<{ reply: string; toolResults: ToolResult[] }> {
  const baseSys =
    (
      (agent.system_prompt as string) || `You are ${agent.name}. ${agent.description ?? ""}`
    ).trim() +
    `\n\nYou are part of a coordinated team. Focus only on YOUR specialty. Be concrete and concise.`;

  const tools = await loadEnabledTools(admin, userId, agent.slug);
  const toolsPrompt = buildToolsPrompt(tools);
  const sys = toolsPrompt ? `${baseSys}\n\n${toolsPrompt}` : baseSys;

  const convo: KimiMessage[] = [
    { role: "system", content: sys },
    ...history,
    { role: "user", content: instruction },
  ];

  const allToolResults: ToolResult[] = [];
  const MAX_STEPS = tools.length > 0 ? 6 : 1;

  for (let step = 0; step < MAX_STEPS; step++) {
    const raw = await kimiChat({
      messages: convo,
      tier: agent.model || "smart",
      temperature: 0.6,
      max_tokens: 1800,
    });

    // No tools enabled → return text directly.
    if (tools.length === 0) {
      return { reply: raw, toolResults: [] };
    }

    const parsed = parseToolLoopStep(raw);
    const calls = (parsed.tool_calls || []).filter((c) => c && c.tool_key);

    if (calls.length === 0 || parsed.final) {
      const final = (parsed.final || raw || "").toString().trim();
      return { reply: final, toolResults: allToolResults };
    }

    convo.push({ role: "assistant", content: raw });

    const { results } = await runToolCalls(admin, {
      userId,
      sessionId,
      agentSlug: agent.slug,
      calls,
      confirmed: true, // specialist-driven calls within an active session
    });
    allToolResults.push(...results);

    const resultMsg = results
      .map((r) => {
        const out =
          r.status === "ok"
            ? typeof r.output === "string"
              ? r.output
              : JSON.stringify(r.output)
            : `ERROR: ${r.error || r.status}`;
        return `Tool result [${r.tool_key}] (${r.credits_charged} credits, ${r.latency_ms}ms):\n${out}`;
      })
      .join("\n\n---\n\n");

    convo.push({
      role: "user",
      content: `${resultMsg}\n\nContinue: either call more tools or return your final JSON with "final" set.`,
    });
  }

  // Step budget exhausted — return last assistant text as best-effort
  const last = convo
    .slice()
    .reverse()
    .find((m) => m.role === "assistant");
  return { reply: (last?.content as string) || "(no response)", toolResults: allToolResults };
}

async function synthesize(
  userMessage: string,
  history: KimiMessage[],
  pieces: Array<{ agent: WorkspaceAgent; reply: string }>,
): Promise<string> {
  if (pieces.length === 1) return pieces[0].reply;

  const sys = `You are the Lead Coordinator. You delegated sub-tasks to specialists and now must produce ONE unified, polished reply to the user.

Rules:
- Reply in the user's language.
- Integrate all specialists' outputs into a single coherent response. Do NOT list "Agent X said".
- Remove redundancy, resolve conflicts, keep concrete details (code, numbers, names).
- Use clean markdown. Be helpful and direct.`;

  const bundle = pieces
    .map((p) => `### ${p.agent.name} (${p.agent.slug})\n${p.reply}`)
    .join("\n\n---\n\n");

  const messages: KimiMessage[] = [
    { role: "system", content: sys },
    ...history,
    { role: "user", content: userMessage },
    {
      role: "assistant",
      content: `[Internal specialist outputs — not visible to user]\n\n${bundle}`,
    },
    {
      role: "user",
      content:
        "Now write the final unified reply to me. One message, in my language, integrating everything above.",
    },
  ];

  return await kimiChat({
    messages,
    tier: "pro",
    temperature: 0.5,
    max_tokens: 2400,
  });
}

export async function runOrchestrator(
  admin: Admin,
  opts: {
    sessionId: string;
    userId: string;
    agents: WorkspaceAgent[];
    userMessage: string;
  },
): Promise<{ ok: boolean; reply: string; error?: string }> {
  const { sessionId, userId, agents, userMessage } = opts;

  // Persist user message
  await admin.from("agent_messages").insert({
    session_id: sessionId,
    user_id: userId,
    role: "user",
    content: userMessage,
  });

  const history = await loadVisibleHistory(admin, sessionId);
  // Drop the just-inserted user msg from history (we'll pass userMessage separately)
  const ctxHistory = history.slice(0, -1);

  try {
    // 1) Plan
    const tasks = await plan(ctxHistory, userMessage, agents);

    // 2) Dispatch in parallel
    const bySlug = new Map(agents.map((a) => [a.slug, a]));
    const pieces = await Promise.all(
      tasks.map(async (t) => {
        const agent = bySlug.get(t.agent_slug)!;
        try {
          const { reply, toolResults } = await runSpecialist(
            admin,
            userId,
            sessionId,
            agent,
            t.instruction,
            ctxHistory,
          );
          // Save specialist reply as INTERNAL (hidden from UI)
          await admin.from("agent_messages").insert({
            session_id: sessionId,
            user_id: userId,
            role: "assistant",
            content: reply,
            tool_results: toolResults as any,
            metadata: {
              internal: true,
              agent_slug: agent.slug,
              agent_name: agent.name,
              agent_color: agent.color,
              agent_image_url: agent.image_url,
              instruction: t.instruction,
              tools_used: toolResults.map((r) => r.tool_key),
              credits_used: toolResults.reduce((s, r) => s + r.credits_charged, 0),
            },
          });
          return { agent, reply, toolResults };
        } catch (e) {
          const msg = (e as Error).message;
          await admin.from("agent_messages").insert({
            session_id: sessionId,
            user_id: userId,
            role: "assistant",
            content: `⚠️ ${msg}`,
            metadata: {
              internal: true,
              agent_slug: agent.slug,
              agent_name: agent.name,
              error: true,
            },
          });
          return { agent, reply: `(failed: ${msg})`, toolResults: [] as ToolResult[] };
        }
      }),
    );

    // 3) Synthesize
    const finalReply = await synthesize(userMessage, ctxHistory, pieces);

    // Save the Lead's unified reply (visible)
    await admin.from("agent_messages").insert({
      session_id: sessionId,
      user_id: userId,
      role: "assistant",
      content: finalReply,
      metadata: {
        agent_slug: "lead",
        agent_name: "Lead",
        agent_color: "#facc15",
        lead: true,
        members: agents.map((a) => a.slug),
        delegated_to: pieces.map((p) => p.agent.slug),
      },
    });

    await admin
      .from("agent_sessions")
      .update({
        status: "completed",
        last_message_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    return { ok: true, reply: finalReply };
  } catch (e) {
    const msg = (e as Error).message;
    await admin.from("agent_messages").insert({
      session_id: sessionId,
      user_id: userId,
      role: "assistant",
      content: `⚠️ ${msg}`,
      metadata: { agent_slug: "lead", agent_name: "Lead", error: true },
    });
    await admin
      .from("agent_sessions")
      .update({ status: "failed", last_message_at: new Date().toISOString() })
      .eq("id", sessionId);
    return { ok: false, reply: "", error: msg };
  }
}
