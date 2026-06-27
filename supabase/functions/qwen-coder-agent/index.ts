/** @doc Autonomous coding agent powered by Qwen3-Coder-Plus with E2B sandbox + Storage + Supabase tools. */
import { corsHeaders } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { withKeyRotation } from "../_shared/key-pool.ts";
import { pickE2BKey, reportE2BFailure } from "../_shared/e2b-keys.ts";

const DASHSCOPE_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
const MODEL = "qwen3-coder-plus";
const WORKSPACE_BUCKET = "coder-workspace";

// ─── Tool schemas (OpenAI-compatible) ────────────────────────────────
const TOOLS = [
  {
    type: "function",
    function: {
      name: "run_python",
      description:
        "Execute arbitrary Python code in an isolated E2B sandbox with network + pip. Returns stdout/stderr. Use for real computation, scraping, API calls, data processing.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "Python source to run." },
          timeout_s: { type: "number", description: "Max seconds (default 60).", default: 60 },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Persist a UTF-8 text file into the user's coder-workspace Storage bucket. Path is scoped to the user automatically.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a UTF-8 text file from the user's coder-workspace.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files under a prefix in the user's coder-workspace.",
      parameters: {
        type: "object",
        properties: { prefix: { type: "string", default: "" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "supabase_query",
      description:
        "Run a read-only PostgREST query against a public table (SELECT only). Respects RLS via the caller's JWT.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string" },
          select: { type: "string", default: "*" },
          eq: {
            type: "object",
            description: "Equality filters: { column: value }",
          },
          limit: { type: "number", default: 50 },
        },
        required: ["table"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deploy_project",
      description:
        "POST a deploy payload to the configured DEPLOY_WEBHOOK_URL. Returns webhook status + body.",
      parameters: {
        type: "object",
        properties: {
          payload: { type: "object" },
        },
        required: ["payload"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are Megsy Coder — an autonomous senior software engineer.

Operating rules:
- Think step-by-step, then act using tools. NEVER fabricate results — execute real code in the sandbox.
- Prefer run_python for any computation, scraping, API call, data transformation, file generation.
- Persist any artifact the user may want later with write_file (scoped to their workspace).
- When asked about data in the user's Supabase project, use supabase_query (read-only).
- When the user asks to deploy/publish, call deploy_project with a clear payload.
- After tools finish, summarize concisely in the user's language. Show key outputs, not raw dumps.
- If a tool fails, explain why and try a different approach (install missing pip packages, switch endpoint).`;

// ─── Sandbox helpers ─────────────────────────────────────────────────
async function runPython(code: string, timeoutS = 60): Promise<{ stdout: string; stderr: string; error?: string }> {
  const pick = await pickE2BKey();
  if (!pick) return { stdout: "", stderr: "", error: "No active E2B key configured." };

  // E2B v2 HTTP: create sandbox, run code, kill.
  try {
    const createRes = await fetch("https://api.e2b.dev/sandboxes", {
      method: "POST",
      headers: {
        "X-API-Key": pick.api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ templateID: "base", metadata: { source: "megsy-coder" } }),
    });
    if (!createRes.ok) {
      const t = await createRes.text();
      await reportE2BFailure(pick.id, createRes.status, t.slice(0, 200));
      return { stdout: "", stderr: "", error: `sandbox create failed: ${createRes.status} ${t.slice(0, 200)}` };
    }
    const sb = await createRes.json();
    const sandboxId = sb.sandboxID || sb.sandboxId || sb.id;

    try {
      const runRes = await fetch(`https://api.e2b.dev/sandboxes/${sandboxId}/processes`, {
        method: "POST",
        headers: { "X-API-Key": pick.api_key, "Content-Type": "application/json" },
        body: JSON.stringify({
          cmd: "python3",
          args: ["-c", code],
          timeout: timeoutS * 1000,
        }),
      });
      const body = await runRes.text();
      // Best-effort parse for stdout/stderr
      let stdout = "", stderr = "";
      try {
        const j = JSON.parse(body);
        stdout = j.stdout || j.output || "";
        stderr = j.stderr || j.error || "";
      } catch {
        stdout = body;
      }
      return { stdout: stdout.slice(0, 20_000), stderr: stderr.slice(0, 4_000) };
    } finally {
      fetch(`https://api.e2b.dev/sandboxes/${sandboxId}`, {
        method: "DELETE",
        headers: { "X-API-Key": pick.api_key },
      }).catch(() => {});
    }
  } catch (e: any) {
    return { stdout: "", stderr: "", error: `sandbox error: ${e?.message || String(e)}` };
  }
}

// ─── Storage helpers (service-role, user-scoped) ─────────────────────
function storageClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function userPath(userId: string, p: string): string {
  const clean = p.replace(/^\/+/, "").replace(/\.\.+/g, "");
  return `${userId}/${clean}`;
}

async function ensureBucket() {
  const sb = storageClient();
  const { data } = await sb.storage.getBucket(WORKSPACE_BUCKET);
  if (!data) {
    await sb.storage.createBucket(WORKSPACE_BUCKET, { public: false });
  }
}

async function writeFile(userId: string, path: string, content: string) {
  await ensureBucket();
  const sb = storageClient();
  const { error } = await sb.storage
    .from(WORKSPACE_BUCKET)
    .upload(userPath(userId, path), new Blob([content], { type: "text/plain" }), { upsert: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}

async function readFile(userId: string, path: string) {
  const sb = storageClient();
  const { data, error } = await sb.storage.from(WORKSPACE_BUCKET).download(userPath(userId, path));
  if (error || !data) return { ok: false, error: error?.message || "not_found" };
  const text = await data.text();
  return { ok: true, content: text.slice(0, 50_000) };
}

async function listFiles(userId: string, prefix = "") {
  const sb = storageClient();
  const { data, error } = await sb.storage
    .from(WORKSPACE_BUCKET)
    .list(userPath(userId, prefix), { limit: 100 });
  if (error) return { ok: false, error: error.message };
  return { ok: true, files: data?.map((f) => f.name) ?? [] };
}

// ─── Supabase query (RLS-respecting via user JWT) ────────────────────
async function supabaseQuery(
  userJwt: string | null,
  table: string,
  select: string,
  eq: Record<string, unknown> | undefined,
  limit: number,
) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb = createClient(url, anon, {
    global: userJwt ? { headers: { Authorization: `Bearer ${userJwt}` } } : {},
    auth: { persistSession: false },
  });
  let q: any = sb.from(table).select(select).limit(Math.min(limit || 50, 200));
  for (const [k, v] of Object.entries(eq || {})) q = q.eq(k, v);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: data };
}

async function deployProject(payload: unknown) {
  const url = Deno.env.get("DEPLOY_WEBHOOK_URL");
  if (!url) return { ok: false, error: "DEPLOY_WEBHOOK_URL not configured" };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body: body.slice(0, 4000) };
}

// ─── Streaming Qwen call ─────────────────────────────────────────────
async function callQwen(messages: any[], stream: boolean): Promise<Response> {
  const result = await withKeyRotation("alibaba", async (apiKey) => {
    const res = await fetch(DASHSCOPE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        stream,
        temperature: 0.2,
      }),
    });
    return { ok: res.ok, status: res.status, data: res as any, errorText: res.ok ? undefined : await res.clone().text() };
  });
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.errorText || "qwen_call_failed" }), {
      status: result.status || 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return result.data as unknown as Response;
}

// ─── Tool dispatcher ─────────────────────────────────────────────────
async function execTool(name: string, args: any, ctx: { userId: string; jwt: string | null }) {
  try {
    switch (name) {
      case "run_python":
        return await runPython(String(args?.code || ""), Number(args?.timeout_s || 60));
      case "write_file":
        return await writeFile(ctx.userId, String(args?.path || ""), String(args?.content || ""));
      case "read_file":
        return await readFile(ctx.userId, String(args?.path || ""));
      case "list_files":
        return await listFiles(ctx.userId, String(args?.prefix || ""));
      case "supabase_query":
        return await supabaseQuery(
          ctx.jwt,
          String(args?.table || ""),
          String(args?.select || "*"),
          args?.eq,
          Number(args?.limit || 50),
        );
      case "deploy_project":
        return await deployProject(args?.payload ?? {});
      default:
        return { ok: false, error: `unknown_tool:${name}` };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// ─── Main agent loop with SSE streaming ──────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userMessages = Array.isArray(body?.messages) ? body.messages : [];
  if (userMessages.length === 0) {
    return new Response(JSON.stringify({ error: "messages required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Identify caller
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  let userId = "anon";
  if (jwt) {
    try {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${jwt}` } } },
      );
      const { data } = await sb.auth.getUser();
      if (data.user) userId = data.user.id;
    } catch { /* anon */ }
  }

  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...userMessages,
  ];

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: any) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const done = () => { controller.enqueue(enc.encode("data: [DONE]\n\n")); controller.close(); };

      try {
        for (let step = 0; step < 8; step++) {
          // Non-streaming call so we can reliably parse tool_calls each step;
          // we stream the final assistant message ourselves below.
          const resp = await callQwen(messages, false);
          if (!(resp as Response).ok) {
            const errTxt = await (resp as Response).text();
            send({ error: errTxt || "qwen_failed" });
            return done();
          }
          const json = await (resp as Response).json();
          const choice = json.choices?.[0];
          const msg = choice?.message;
          if (!msg) { send({ error: "no_message" }); return done(); }

          const toolCalls = msg.tool_calls || [];
          if (toolCalls.length === 0) {
            // Final answer — chunk-stream to client
            const text = String(msg.content || "");
            const CHUNK = 80;
            for (let i = 0; i < text.length; i += CHUNK) {
              send({ choices: [{ delta: { content: text.slice(i, i + CHUNK) } }] });
            }
            return done();
          }

          // Push the assistant tool-call turn into history
          messages.push({ role: "assistant", content: msg.content || "", tool_calls: toolCalls });

          for (const tc of toolCalls) {
            const name = tc.function?.name;
            let args: any = {};
            try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}
            send({ tool_event: { event: "tool_call", name, args } });
            const result = await execTool(name, args, { userId, jwt });
            send({ tool_event: { event: "tool_result", name, result } });
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              name,
              content: JSON.stringify(result).slice(0, 12_000),
            });
          }
        }
        send({ choices: [{ delta: { content: "\n\n[agent reached step limit]" } }] });
        done();
      } catch (e: any) {
        send({ error: e?.message || "agent_failed" });
        done();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
