/** @doc Drives autonomous Operator/Megsy OS agents over multiple steps. */
import { corsHeaders } from "../_shared/cors.ts";
// Megsy Operator: orchestrator backed by Manus API v2.
// Each `operator_runs` row maps to a Manus task. Each tick polls Manus for new
// events and persists them as `operator_steps` and `operator_agent_messages`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createTask,
  sendMessage,
  listMessages,
  getMessageEvents,
  autoConfirmWaiting,
  websiteStatus,
  resolveAgentProfile,
  type ManusMessageEvent,
} from "../_shared/manus.ts";
import { getAuthUser, isInternalCaller } from "../_shared/auth.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });



const TICK_BUDGET_MS = 45_000;
const POLL_INTERVAL_MS = 1500;

async function logMsg(run_id: string, agent: string, content: string, metadata: Record<string, unknown> = {}) {
  await admin.from("operator_agent_messages").insert({
    run_id, agent, role: "assistant", content, metadata,
  });
}

async function setRun(run_id: string, patch: Record<string, unknown>) {
  await admin.from("operator_runs")
    .update({ ...patch, last_tick_at: new Date().toISOString() })
    .eq("id", run_id);
}

async function persistStep(run_id: string, stepNo: number, evt: ManusMessageEvent) {
  const tc = evt.tool_call ?? evt.tool_used;
  const title = tc?.title ?? tc?.name ?? evt.type;
  const description = tc?.description ?? (evt.assistant_message?.content ?? evt.assistant_message?.text ?? "");
  const tool = tc?.name ?? null;
  const status =
    tc?.status === "running" ? "running" :
    tc?.status === "failed" || tc?.status === "error" ? "failed" :
    tc?.status === "done" || tc?.status === "succeeded" ? "done" :
    evt.type === "assistant_message" ? "done" : "running";

  await admin.from("operator_steps").insert({
    run_id, step_no: stepNo, agent: "manus", title, description,
    tool, tool_input: null, tool_output: null,
    status, started_at: new Date().toISOString(),
    finished_at: status === "done" || status === "failed" ? new Date().toISOString() : null,
  });
}

async function nextStepNo(run_id: string): Promise<number> {
  const { data } = await admin.from("operator_steps")
    .select("step_no").eq("run_id", run_id)
    .order("step_no", { ascending: false }).limit(1).maybeSingle();
  return ((data?.step_no as number) ?? 0) + 1;
}

async function startManusTask(run_id: string, goal: string, user_id: string): Promise<string> {
  // Load dynamic agents + memory so the Manus prompt has the user's context.
  const { data: dyn } = await admin.from("operator_dynamic_agents")
    .select("key,label,description,system_prompt").eq("user_id", user_id);
  const agents = (dyn || []).map((a: any) => `- @${a.key} (${a.label}): ${a.description ?? ""}`).join("\n");

  const sys = `You are Megsy Operator, a multi-skill autonomous agent powered by Manus.
Plan, browse, code, build apps, deploy and publish — all using Manus' built-in capabilities.
Be concise in status updates. Always reply to the user in the SAME language and dialect they used.
${agents ? `\nVirtual specialist agents the user has installed:\n${agents}` : ""}`;

  const created = await createTask({
    prompt: `${sys}\n\n---\n\nGoal: ${goal}`,
    agent_profile: resolveAgentProfile("max"),
    title: String(goal).slice(0, 80),
  });
  await setRun(run_id, {
    manus_task_id: created.task_id,
    status: "running",
    current_phase: "manus",
    mode: "task",
  });
  await admin.from("operator_audit_log").insert({
    user_id, run_id, agent: "system", action: "manus_task_created",
    payload: { task_id: created.task_id, task_url: created.task_url },
  });
  return created.task_id;
}

interface TickResult {
  agent_status: "running" | "waiting" | "stopped" | "error" | "unknown";
  saved: number;
  error?: string;
  deploy_url?: string;
}

async function pollTick(run: any): Promise<TickResult> {
  const deadline = Date.now() + TICK_BUDGET_MS;
  let cursor: string | null = run.manus_cursor ?? null;
  let stepNo = await nextStepNo(run.id);
  let saved = 0;
  let agent_status: TickResult["agent_status"] = "running";
  let error: string | undefined;
  let deploy_url: string | undefined;

  while (Date.now() < deadline) {
    let page;
    try {
      page = await listMessages({ task_id: run.manus_task_id, after: cursor ?? undefined, limit: 50, order: "asc" });
    } catch (e) {
      error = (e as Error).message;
      agent_status = "error";
      break;
    }
    const events = getMessageEvents(page);

    for (const evt of events) {
      // Save tool/status as step; assistant_message also as operator_agent_messages
      if (evt.tool_call || evt.tool_used || evt.assistant_message) {
        await persistStep(run.id, stepNo++, evt);
        saved += 1;
      }
      const text = (evt.assistant_message?.content ?? evt.assistant_message?.text ?? "").trim();
      if (text) {
        await logMsg(run.id, "manus", text, { manus_event_id: evt.event_id });
      }
      cursor = evt.event_id;

      if (evt.type === "status_update" && evt.status_update) {
        const su = evt.status_update;
        agent_status = su.agent_status ?? agent_status;
        if (su.agent_status === "waiting" && su.status_detail) {
          const confirmed = await autoConfirmWaiting(run.manus_task_id, su.status_detail);
          if (!confirmed) {
            await logMsg(run.id, "manus", su.status_detail.waiting_description || "Waiting for user input", {
              waiting_for_event_id: su.status_detail.waiting_for_event_id,
              waiting_for_event_type: su.status_detail.waiting_for_event_type,
            });
            agent_status = "waiting";
            break;
          }
          agent_status = "running";
        }
        if (su.agent_status === "error") {
          error = su.error_message ?? "manus_error";
          break;
        }
      }
    }

    await setRun(run.id, { manus_cursor: cursor });

    if (agent_status === "stopped" || agent_status === "error" || agent_status === "waiting") break;

    try {
      const ws = await websiteStatus({ task_id: run.manus_task_id });
      if (ws?.publish_status === "published" && ws.site_urls?.length) {
        deploy_url = ws.site_urls[0];
      }
    } catch { /* not every task publishes a site */ }

    if (events.length === 0) await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  return { agent_status, saved, error, deploy_url };
}

async function tick(run_id: string) {
  const { data: run } = await admin.from("operator_runs").select("*").eq("id", run_id).single();
  if (!run) return;
  if (run.status === "done" || run.status === "failed") return;

  await setRun(run_id, { status: "running" });

  // Make sure a Manus task exists for this run
  if (!run.manus_task_id) {
    run.manus_task_id = await startManusTask(run_id, run.goal, run.user_id);
    run.manus_cursor = null;
  }

  const r = await pollTick(run);

  const patch: Record<string, unknown> = {};
  if (r.deploy_url) patch.published_url = r.deploy_url;

  if (r.agent_status === "stopped") {
    patch.status = "done";
    patch.current_phase = "done";
    patch.chat_response = null;
    await admin.from("operator_runs").update(patch).eq("id", run_id);
    await logMsg(run_id, "manus", "✅ Mission complete.", { final: true });
    return;
  }
  if (r.agent_status === "error") {
    patch.status = "failed";
    patch.current_phase = "done";
    patch.error = r.error ?? "manus error";
    await admin.from("operator_runs").update(patch).eq("id", run_id);
    return;
  }
  if (r.agent_status === "waiting") {
    patch.status = "running";
    patch.current_phase = "waiting";
    await setRun(run_id, patch);
    return; // wait for user input via /sendMessage path
  }

  // Still running — re-enter the function so polling continues until done.
  if (Object.keys(patch).length) await setRun(run_id, patch);
  fetch(`${SB_URL}/functions/v1/operator-orchestrator`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SB_SRK}` },
    body: JSON.stringify({ run_id }),
  }).catch(() => null);
}

async function sendToRun(run_id: string, user_id: string, message: string) {
  const { data: run } = await admin.from("operator_runs").select("manus_task_id").eq("id", run_id).single();
  if (!run?.manus_task_id) throw new Error("run has no manus_task_id");
  await sendMessage(run.manus_task_id as string, message);
  await admin.from("operator_agent_messages").insert({
    run_id, agent: "user", role: "user", content: message, metadata: { user_id },
  });
  await setRun(run_id, { status: "running", current_phase: "manus" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { run_id, goal, user_id, sync, message } = body ?? {};

    // Create a new run
    if (!run_id && goal) {
      const authUser = await getAuthUser(req);
      if (!authUser) return new Response(JSON.stringify({ error: "auth_required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (user_id && user_id !== authUser.id) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const { data: newRun, error } = await admin
        .from("operator_runs")
        .insert({ user_id: authUser.id, goal, status: "pending", mode: "task" })
        .select().single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      EdgeRuntime.waitUntil(tick(newRun.id));
      return new Response(JSON.stringify({ run_id: newRun.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!run_id) return new Response(JSON.stringify({ error: "run_id or goal required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Owner / internal check for run_id re-entry, follow-up message, etc.
    if (!isInternalCaller(req)) {
      const authUser = await getAuthUser(req);
      if (!authUser) return new Response(JSON.stringify({ error: "auth_required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: runOwner } = await admin.from("operator_runs").select("user_id").eq("id", run_id).single();
      if (!runOwner || runOwner.user_id !== authUser.id) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Follow-up user message (e.g. after a waiting state)
    if (message) {
      await sendToRun(run_id, user_id ?? "", String(message));
      EdgeRuntime.waitUntil(tick(run_id));
      return new Response(JSON.stringify({ ok: true, run_id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (sync) await tick(run_id);
    else EdgeRuntime.waitUntil(tick(run_id));
    return new Response(JSON.stringify({ ok: true, run_id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
