// Vercel AI SDK powered agent loop for Qwen / DashScope (Alibaba).
//
// Replaces the previous hand-rolled tool-calling loop. We use `streamText`
// from the AI SDK with a stop condition of stepCountIs(50) — the SDK handles
// the whole tool-call → execute → re-prompt cycle for us, and supports real
// streaming of the final answer token-by-token.
//
// We keep emitting the SAME SSE wire format the frontend already consumes
// (`{choices:[{delta:{content}}]}` for text, `{tool_event:...}` for tool
// activity, then `data: [DONE]`) so no UI change is needed.

import { streamText, stepCountIs, tool, jsonSchema, type ModelMessage } from "npm:ai@5.0.196";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@1.0.20";
import { executeTool, type RegistryContext } from "./tool-registry.ts";
import { maybeCompressHistory, extractAndSaveMemory } from "./memory-bg.ts";

// EdgeRuntime is provided by Supabase Edge Functions for background tasks.
// Declared loosely so this file still type-checks outside that runtime.
// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

// Lowered from 50 → 12. Real chat turns rarely need more than 3-4 tool
// calls; capping at 12 prevents runaway loops (and the bill) when a model
// gets stuck retrying the same tool. Combined with duplicate-call detection
// below this is the single biggest safety win for the agent loop.
const MAX_STEPS = 12;
const DUPLICATE_CALL_LIMIT = 3;

// Best-effort: derive a Pipedream app slug from the tool name (e.g.
// "gmail_send_email" → "gmail", "google_sheets_*" → "google_sheets").
function inferAppSlug(name: string, _args: unknown): string | undefined {
  if (!name) return undefined;
  const known = ["google_sheets", "google_calendar", "google_drive", "google_docs", "telegram_bot_api", "airtable_oauth"];
  for (const k of known) if (name.startsWith(k)) return k;
  const first = name.split("_")[0];
  return first || undefined;
}

// Pull a short human target out of common tool inputs ("to", "query", "channel").
function inferTarget(_name: string, args: any): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const keys = ["to", "query", "q", "channel", "subject", "title", "url", "message", "text", "name", "prompt"];
  let v: unknown;
  for (const k of keys) if (typeof args[k] === "string" && args[k]) { v = args[k]; break; }
  if (!v) {
    // last resort: first string leaf
    for (const k of Object.keys(args)) {
      if (typeof args[k] === "string" && args[k]) { v = args[k]; break; }
    }
  }
  if (typeof v !== "string") return undefined;
  return v.length > 60 ? v.slice(0, 57) + "…" : v;
}


function enqueueSse(controller: ReadableStreamDefaultController<Uint8Array>, payload: unknown) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`));
}
function enqueueText(controller: ReadableStreamDefaultController<Uint8Array>, content: string) {
  if (!content) return;
  enqueueSse(controller, { choices: [{ delta: { content } }] });
}
function enqueueDone(controller: ReadableStreamDefaultController<Uint8Array>) {
  controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
}

// Convert the OpenAI-style messages we already build into AI-SDK ModelMessage
// shape. We pass arrays of parts through; for image_url parts we translate to
// AI SDK's `{type:'image', image: URL}` shape.
function toModelMessages(messages: any[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const m of messages) {
    const role = m?.role;
    if (role !== "system" && role !== "user" && role !== "assistant") continue;
    const content = m?.content;
    if (typeof content === "string") {
      out.push({ role, content } as ModelMessage);
      continue;
    }
    if (Array.isArray(content)) {
      const parts: any[] = [];
      for (const p of content) {
        if (!p) continue;
        if (p.type === "text" && typeof p.text === "string") {
          parts.push({ type: "text", text: p.text });
        } else if (p.type === "image_url" && p.image_url?.url) {
          try {
            parts.push({ type: "image", image: new URL(p.image_url.url) });
          } catch {
            parts.push({ type: "text", text: `[image: ${p.image_url.url}]` });
          }
        } else if (typeof p.text === "string") {
          parts.push({ type: "text", text: p.text });
        }
      }
      out.push({ role, content: parts.length ? parts : "" } as ModelMessage);
      continue;
    }
    out.push({ role, content: String(content ?? "") } as ModelMessage);
  }
  return out;
}

// Build AI-SDK tool record from the OpenAI-style tool array we already build
// in tool-registry.ts. Each tool's `execute` delegates to executeTool().
function buildAiSdkTools(ctx: RegistryContext, tools: any[], callCounter: Map<string, number>) {
  const record: Record<string, ReturnType<typeof tool>> = {};
  for (const t of tools) {
    const fn = t?.function;
    if (!fn?.name) continue;
    const params = fn.parameters || { type: "object", properties: {} };
    record[fn.name] = tool({
      description: fn.description || "",
      inputSchema: jsonSchema(params),
      execute: async (args: any) => {
        // Duplicate-call detection: same tool + same args ≥ N times in a
        // session means the model is stuck. Short-circuit with a hint
        // instead of letting it burn more steps.
        const sig = `${fn.name}::${JSON.stringify(args || {})}`;
        const seen = (callCounter.get(sig) || 0) + 1;
        callCounter.set(sig, seen);
        if (seen > DUPLICATE_CALL_LIMIT) {
          return {
            error: `duplicate_call_blocked: you already called ${fn.name} with these exact arguments ${seen - 1} times. Try different arguments, a different tool, or answer the user with what you already have.`,
          };
        }
        const result = await executeTool(ctx, fn.name, args || {});
        return result.ok ? result.data : { error: result.error };
      },
    });
  }
  return record;
}

export interface AgentLoopOpts {
  ctx: RegistryContext;
  model: string;
  systemPrompt: string;
  messages: any[];
  tools: any[];
  signal?: AbortSignal;
  /** When set, the FIRST step forces this exact tool call. */
  forceFirstTool?: string;
}

// Top-5 Alibaba/Qwen fallback chain. Tried in order whenever the primary
// model fails before producing any output (quota / FreeTier / 403 / 429 /
// rate-limit). Ordering: cheap-fast first, then heavier, then coder-class.
const QWEN_FALLBACK_CHAIN = [
  "qwen-plus-latest",
  "qwen-turbo",
  "qwen-plus",
  "qwen-max",
  "qwen3-coder-plus",
];

// Errors that should trigger a (key, model) rotation. We DO NOT retry on
// content / validation / abort errors — only on capacity-side failures.
const RETRYABLE_ERROR_RE =
  /FreeTierOnly|AllocationQuota|free\s*tier|quota|throttl|rate.?limit|insufficient|model_not_found|ModelNotFound|InvalidApiKey|AccessDenied|AuthenticationError|403|429|502|503|504/i;

export function runOdysseusAgent(opts: AgentLoopOpts): Response {
  const { ctx, model: modelName, systemPrompt, messages, tools, signal, forceFirstTool } = opts;


  // Detect whether the user's last message actually contains Chinese characters.
  // If not, we'll scrub any Chinese that the model leaks into the reply.
  const lastUser = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "user") {
        const c = messages[i]?.content;
        if (typeof c === "string") return c;
        if (Array.isArray(c)) return c.map((p: any) => p?.text || "").join(" ");
      }
    }
    return "";
  })();
  const userWroteChinese = /[\u4e00-\u9fff]/.test(lastUser);
  const CJK_RE = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]+/g;

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // Inject the streaming progress channel into the context so tools
          // can surface step-by-step task updates while they run.
          (ctx as any).emitProgress = (e: any) => {
            try {
              enqueueSse(controller, {
                tool_event: {
                  type: "progress",
                  tool: e?.tool || "tool",
                  step: e?.step,
                  label: e?.label,
                  status: e?.status,
                  index: e?.index,
                  total: e?.total,
                  detail: e?.detail,
                },
              });
            } catch { /* controller may be closed */ }
          };

          const callCounter = new Map<string, number>();
          const sdkTools = buildAiSdkTools(ctx, tools, callCounter);

          // Build the (key, model) attempt matrix. Keys: rotate through every
          // active DashScope key (newest first). Models: requested model, then
          // the top-5 Qwen fallback chain — deduped, in order.
          const keyPool = (ctx.dashscopeKeys && ctx.dashscopeKeys.length > 0
            ? ctx.dashscopeKeys
            : [ctx.dashscopeKey]).filter(Boolean);
          const modelPool = [modelName, ...QWEN_FALLBACK_CHAIN].filter(
            (m, i, a) => !!m && a.indexOf(m) === i,
          );

          // Auto-compress very long conversations before sending to the model.
          // No-op when total chars are below the threshold. Uses the primary
          // key — compression is best-effort and not retry-critical.
          const compactMessages = await maybeCompressHistory(messages, ctx.dashscopeKey);

          let producedOutput = false;
          let succeeded = false;
          let lastError: string | null = null;
          let buffer = "";
          const flushClean = (text: string) => {
            if (!text) return;
            const cleaned = userWroteChinese ? text : text.replace(CJK_RE, "");
            if (cleaned) {
              enqueueText(controller, cleaned);
              producedOutput = true;
            }
          };

          outer: for (const tryModel of modelPool) {
            for (const tryKey of keyPool) {
              if (signal?.aborted) break outer;
              const provider = createOpenAICompatible({
                name: "alibaba",
                baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
                headers: { Authorization: `Bearer ${tryKey}` },
              });
              const attemptLabel = `${tryModel} (key …${tryKey.slice(-4)})`;
              try {
                const result = streamText({
                  model: provider(tryModel),
                  system: systemPrompt,
                  messages: toModelMessages(compactMessages),
                  tools: Object.keys(sdkTools).length > 0 ? sdkTools : undefined,
                  experimental_prepareStep:
                    forceFirstTool && sdkTools[forceFirstTool]
                      ? async ({ stepNumber }) =>
                          stepNumber === 0
                            ? { toolChoice: { type: "tool", toolName: forceFirstTool } as any }
                            : {}
                      : undefined,
                  stopWhen: stepCountIs(MAX_STEPS),
                  temperature: 0.5,
                  abortSignal: signal,
                });

                let attemptErrored = false;
                for await (const part of result.fullStream) {
                  if (signal?.aborted) break;
                  switch (part.type) {
                    case "text-delta": {
                      const delta = (part as any).textDelta ?? (part as any).text ?? "";
                      if (!delta) break;
                      buffer += delta;
                      const lastSpace = buffer.lastIndexOf(" ");
                      if (lastSpace > 0) {
                        flushClean(buffer.slice(0, lastSpace + 1));
                        buffer = buffer.slice(lastSpace + 1);
                      } else if (buffer.length >= 24) {
                        flushClean(buffer);
                        buffer = "";
                      }
                      break;
                    }
                    case "tool-call": {
                      const p: any = part;
                      const name = p.toolName as string;
                      const args = p.input ?? p.args ?? {};
                      producedOutput = true;
                      enqueueSse(controller, {
                        tool_event: {
                          type: "tool_call",
                          call_id: p.toolCallId ?? p.id,
                          name,
                          app_slug: inferAppSlug(name, args),
                          target: inferTarget(name, args),
                          args,
                        },
                      });
                      break;
                    }
                    case "tool-result": {
                      const p: any = part;
                      const out = p.output ?? p.result;
                      const ok = !(out && typeof out === "object" && "error" in out);
                      enqueueSse(controller, {
                        tool_event: {
                          type: "tool_result",
                          call_id: p.toolCallId ?? p.id,
                          name: p.toolName,
                          app_slug: inferAppSlug(p.toolName, {}),
                          ok,
                          result: out,
                        },
                      });
                      break;
                    }
                    case "error": {
                      const p: any = part;
                      const msg =
                        p.error instanceof Error
                          ? p.error.message
                          : String(p.error ?? "stream_error");
                      lastError = msg;
                      attemptErrored = true;
                      if (!producedOutput && RETRYABLE_ERROR_RE.test(msg)) {
                        console.warn(
                          `[odysseus] retryable error on ${attemptLabel}: ${msg.slice(0, 200)}`,
                        );
                      } else {
                        enqueueSse(controller, { error: msg });
                      }
                      break;
                    }
                    default:
                      break;
                  }
                  if (attemptErrored && !producedOutput) break;
                }

                if (!attemptErrored) {
                  succeeded = true;
                  if (buffer) flushClean(buffer);
                  break outer;
                }
                // Errored before any output → try next combo.
                if (!producedOutput && lastError && RETRYABLE_ERROR_RE.test(lastError)) {
                  // If this looks like an auth/quota issue, drop the keys cache
                  // so a freshly-rotated DB key is picked up on the next req.
                  if (/403|401|InvalidApiKey|AuthenticationError|AccessDenied/i.test(lastError)) {
                    try {
                      ctx.invalidateKeyCache?.();
                    } catch { /* noop */ }
                  }
                  continue;
                }
                // Non-retryable mid-stream error already surfaced; stop.
                break outer;
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                lastError = msg;
                if (!producedOutput && RETRYABLE_ERROR_RE.test(msg)) {
                  console.warn(
                    `[odysseus] threw on ${attemptLabel}: ${msg.slice(0, 200)} — rotating`,
                  );
                  continue;
                }
                throw e;
              }
            }
          }

          if (!succeeded && !producedOutput) {
            const friendly =
              "All Alibaba models are temporarily unavailable (free-tier quota or rate limit). Please try again in a moment.";
            console.error(`[odysseus] exhausted fallbacks: ${lastError}`);
            enqueueSse(controller, { error: friendly });
          }

          enqueueDone(controller);
          controller.close();

          // Fire-and-forget: extract any durable user fact from the last turn
          // and persist it with an embedding. The user never waits for this.
          if (
            !ctx.isGuest &&
            ctx.userId &&
            typeof EdgeRuntime !== "undefined" &&
            EdgeRuntime?.waitUntil
          ) {
            try {
              EdgeRuntime.waitUntil(
                extractAndSaveMemory({
                  dashscopeKey: ctx.dashscopeKey,
                  supabaseUrl: ctx.supabaseUrl,
                  serviceRoleKey: ctx.serviceRoleKey,
                  userId: ctx.userId,
                  messages,
                }),
              );
            } catch (e) {
              console.warn("[odysseus] bg memory schedule failed", e);
            }
          }
        } catch (err) {
          console.error("[odysseus/agent-loop:ai-sdk]", err);
          enqueueSse(controller, { error: err instanceof Error ? err.message : String(err) });
          enqueueDone(controller);
          controller.close();
        }
      },
    }),
    {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type, x-anon-fingerprint",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    },
  );
}
