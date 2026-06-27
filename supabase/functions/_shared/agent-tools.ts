// Shared agent-tools runtime: loads enabled tools for an agent,
// executes them in parallel, debits credits, and writes audit rows.
//
// Used by `_shared/orchestrator.ts` (in-process) and by the
// `agent-tool-broker` Edge Function (UI/test entry point).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Admin = ReturnType<typeof createClient>;

export type AgentTool = {
  id: string;
  tool_key: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  description_ar: string | null;
  category: string;
  icon: string | null;
  edge_function: string;
  input_schema: Record<string, unknown>;
  output_kind: string;
  base_credits: number;
};

export type ToolCall = {
  call_id?: string;
  tool_key: string;
  input: Record<string, unknown>;
};

export type ToolResult = {
  call_id?: string;
  tool_key: string;
  status: "ok" | "error" | "insufficient_credits" | "not_enabled" | "needs_confirmation";
  output?: unknown;
  error?: string;
  credits_charged: number;
  latency_ms: number;
};

const FN_URL = (name: string) => {
  const base =
    Deno.env.get("SUPABASE_URL") ||
    `https://${Deno.env.get("SUPABASE_PROJECT_REF") ?? "ltgampdtawuefwwayncx"}.supabase.co`;
  return `${base}/functions/v1/${name}`;
};

export async function loadEnabledTools(
  admin: Admin,
  userId: string,
  agentSlug: string,
): Promise<AgentTool[]> {
  const { data: bindings } = await admin
    .from("agent_tool_bindings")
    .select("tool_id, enabled")
    .eq("user_id", userId)
    .eq("agent_slug", agentSlug)
    .eq("enabled", true);

  const ids = (bindings || []).map((b: any) => b.tool_id);
  if (ids.length === 0) return [];

  const { data: tools } = await admin
    .from("agent_tools_registry")
    .select(
      "id, tool_key, name, name_ar, description, description_ar, category, icon, edge_function, input_schema, output_kind, base_credits",
    )
    .in("id", ids)
    .eq("is_active", true);

  return (tools || []) as AgentTool[];
}

export function buildToolsPrompt(tools: AgentTool[]): string {
  if (tools.length === 0) return "";
  const lines = tools.map((t) => {
    const schema = JSON.stringify(t.input_schema || {});
    return `- ${t.tool_key} (${t.base_credits} credits) — ${t.description_ar || t.description || t.name}\n  input: ${schema}`;
  });

  return `
You have access to internal site tools below. YOU decide autonomously when, which, and how many tools to invoke based on the user's request. Do not ask the user for permission unless a tool's cost is unusually high.

Available tools:
${lines.join("\n")}

Decision policy (you):
- If the user asks for media (image/video/audio), code/project, research, web data, or a document → call the matching tool. Don't just describe — produce.
- You MAY chain tools across multiple steps. Example: generate image → analyze image → generate video → build a project, all in one autonomous run.
- You MAY call multiple tools in the same step; they execute in parallel.
- Pick the cheapest tool that satisfies the task.

Response protocol (STRICT JSON only, no prose outside JSON):
- To call tools:   {"thought":"why these tools","tool_calls":[{"tool_key":"...","input":{...}}, ...],"final":null}
- To finish:       {"thought":"...","tool_calls":[],"final":"<final markdown reply in the user's language>"}
- After each tool batch you'll be re-invoked with the results — continue the loop until you have a real final answer.
- Every tool use auto-deducts credits from the user's balance at site rates. Be efficient.
`.trim();
}

async function debitCredits(
  admin: Admin,
  userId: string,
  amount: number,
  description: string,
): Promise<{ ok: boolean; credits?: number; error?: string }> {
  if (amount <= 0) return { ok: true };
  const { data, error } = await admin.rpc("deduct_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_action_type: "agent_tool",
    p_description: description,
  });
  if (error) return { ok: false, error: error.message };
  const res = (data || {}) as { success?: boolean; error?: string; credits?: number };
  if (!res.success) return { ok: false, error: res.error || "credit_error", credits: res.credits };
  return { ok: true, credits: res.credits };
}

async function callEdgeFunction(
  name: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const sr = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  try {
    const res = await fetch(FN_URL(name), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sr}`,
        apikey: sr,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* keep text */
    }
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: (e as Error).message };
  }
}

export async function runToolCalls(
  admin: Admin,
  opts: {
    userId: string;
    sessionId?: string;
    agentSlug: string;
    calls: ToolCall[];
    confirmThreshold?: number;
    confirmed?: boolean;
  },
): Promise<{
  results: ToolResult[];
  totalCharged: number;
  needsConfirmation?: { estimated_total: number; threshold: number };
}> {
  const tools = await loadEnabledTools(admin, opts.userId, opts.agentSlug);
  const byKey = new Map(tools.map((t) => [t.tool_key, t]));

  // Cost estimate + threshold check
  const estimated = opts.calls.reduce((sum, c) => {
    const t = byKey.get(c.tool_key);
    return sum + (t ? Number(t.base_credits) : 0);
  }, 0);
  const threshold = opts.confirmThreshold ?? 20;
  if (!opts.confirmed && estimated > threshold) {
    return {
      results: [],
      totalCharged: 0,
      needsConfirmation: { estimated_total: estimated, threshold },
    };
  }

  const results: ToolResult[] = await Promise.all(
    opts.calls.map(async (call): Promise<ToolResult> => {
      const started = Date.now();
      const tool = byKey.get(call.tool_key);
      if (!tool) {
        return {
          call_id: call.call_id,
          tool_key: call.tool_key,
          status: "not_enabled",
          error: "tool not enabled for this agent",
          credits_charged: 0,
          latency_ms: 0,
        };
      }

      const cost = Number(tool.base_credits);
      const debit = await debitCredits(
        admin,
        opts.userId,
        cost,
        `${tool.tool_key} via agent ${opts.agentSlug}`,
      );
      if (!debit.ok) {
        await admin.from("agent_tool_invocations").insert({
          user_id: opts.userId,
          session_id: opts.sessionId,
          agent_slug: opts.agentSlug,
          tool_key: tool.tool_key,
          input: call.input,
          status: "insufficient_credits",
          error: debit.error,
          credits_charged: 0,
          latency_ms: Date.now() - started,
        });
        return {
          call_id: call.call_id,
          tool_key: tool.tool_key,
          status: "insufficient_credits",
          error: debit.error,
          credits_charged: 0,
          latency_ms: Date.now() - started,
        };
      }

      const payload = {
        ...call.input,
        _agent_context: {
          user_id: opts.userId,
          session_id: opts.sessionId,
          agent_slug: opts.agentSlug,
          source: "agent_tool_broker",
        },
      };
      const res = await callEdgeFunction(tool.edge_function, payload);
      const latency = Date.now() - started;

      const status: ToolResult["status"] = res.ok ? "ok" : "error";
      await admin.from("agent_tool_invocations").insert({
        user_id: opts.userId,
        session_id: opts.sessionId,
        agent_slug: opts.agentSlug,
        tool_key: tool.tool_key,
        input: call.input,
        output: res.ok ? (res.data as any) : null,
        status,
        error: res.error,
        credits_charged: cost,
        latency_ms: latency,
      });

      return {
        call_id: call.call_id,
        tool_key: tool.tool_key,
        status,
        output: res.data,
        error: res.error,
        credits_charged: cost,
        latency_ms: latency,
      };
    }),
  );

  const totalCharged = results.reduce((s, r) => s + r.credits_charged, 0);
  return { results, totalCharged };
}

// Shape returned by the model inside the tool loop.
export type ToolLoopStep = {
  thought?: string;
  tool_calls?: ToolCall[];
  final?: string | null;
};

export function parseToolLoopStep(raw: string): ToolLoopStep {
  // Best-effort JSON extraction
  const trimmed = raw.trim();
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as ToolLoopStep;
    } catch {
      return null;
    }
  };
  let parsed = tryParse(trimmed);
  if (!parsed) {
    const m = trimmed.match(/\{[\s\S]*\}$/);
    if (m) parsed = tryParse(m[0]);
  }
  if (!parsed) {
    // Treat plain text as final answer
    return { final: trimmed, tool_calls: [] };
  }
  if (!Array.isArray(parsed.tool_calls)) parsed.tool_calls = [];
  return parsed;
}
