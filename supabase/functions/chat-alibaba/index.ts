/** @doc Streaming chat completions via Alibaba/Qwen with full tool-call support. */
import { corsHeaders } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
// (router import removed — OpenRouter is no longer used; Qwen handles all research)
import { buildToolsForApps, resolveRequest, type ToolDef } from "../_shared/pipedream-tools.ts";
import { proxyRequest } from "../_shared/pipedream-proxy.ts";
import { buildOdysseusSystemPrompt } from "../_shared/odysseus/system-prompt.ts";
import {
  buildFirstPartyTools,
  buildIntegrationCatalog,
  type RegistryContext,
} from "../_shared/odysseus/tool-registry.ts";
import { runOdysseusAgent } from "../_shared/odysseus/agent-loop.ts";
import { routeModel } from "../_shared/odysseus/model-router.ts";
import { embedText, toPgVector } from "../_shared/embeddings.ts";
import { buildLanguageLockPrompt } from "./language.ts";
import { handleTasksBotRequest } from "../_shared/tasks-bot.ts";



// Build a compact personalization preamble from the user's ai_personalization row.
// Returns an empty string when there's nothing useful to add.
function buildPersonalizationPrompt(row: any | null): string {
  if (!row || typeof row !== "object") return "";
  const lines: string[] = [];
  const name = (row.call_name || "").toString().trim();
  const prof = (row.profession || "").toString().trim();
  const about = (row.about || "").toString().trim();
  const traits = (row.ai_traits || "").toString().trim();
  const custom = (row.custom_instructions || "").toString().trim();
  const interests: string[] = Array.isArray(row.interests)
    ? row.interests.filter((s: any) => typeof s === "string" && s.trim()).slice(0, 12)
    : [];
  const formality = Number.isFinite(row.tone_formality) ? Number(row.tone_formality) : null;
  const verbosity = Number.isFinite(row.tone_verbosity) ? Number(row.tone_verbosity) : null;
  const creativity = Number.isFinite(row.tone_creativity) ? Number(row.tone_creativity) : null;
  const lang = (row.language_style || "").toString().trim();

  if (name) lines.push(`- The user's preferred name is "${name}". Address them by that name when natural.`);
  if (prof) lines.push(`- Their role / field: ${prof}. Tailor examples and depth to that context.`);
  if (about) lines.push(`- Short bio they shared: ${about.slice(0, 400)}`);
  if (interests.length) lines.push(`- Topics they care about: ${interests.join(", ")}.`);

  const toneBits: string[] = [];
  if (formality !== null) {
    toneBits.push(formality >= 60 ? "warm and friendly" : formality <= 40 ? "formal and professional" : "balanced in formality");
  }
  if (verbosity !== null) {
    toneBits.push(verbosity >= 60 ? "thorough and detailed" : verbosity <= 40 ? "concise and to the point" : "moderate length");
  }
  if (creativity !== null) {
    toneBits.push(creativity >= 60 ? "creative and exploratory" : creativity <= 40 ? "conservative and grounded" : "balanced creativity");
  }
  if (toneBits.length) lines.push(`- Reply style preference: ${toneBits.join(", ")}.`);

  if (lang === "casual") lines.push("- Default tone: casual and conversational.");
  else if (lang === "formal") lines.push("- Default tone: formal and polished.");
  else if (lang === "english") lines.push("- Prefer English when the user's message is ambiguous, BUT always mirror the user's actual message language when they write in another language.");

  if (traits) lines.push(`- Personality traits the user wants in you: ${traits.slice(0, 300)}.`);
  if (custom) lines.push(`- Extra user instructions (treat as high priority): ${custom.slice(0, 800)}.`);

  if (lines.length === 0) return "";
  return [
    "USER PERSONALIZATION (apply silently — do NOT mention these settings, just follow them):",
    ...lines,
  ].join("\n");
}


const DASHSCOPE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
const DASHSCOPE_SERVICES = new Set([
  "alibaba",
  "alibabacloud",
  "dashscope",
  "qwen",
  "aliyun",
  "ali",
  "qwendashscope",
  "alibabaqwen",
]);

type ChatMessage = {
  role?: string;
  content?: unknown;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeService(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

// Short cache so rotating a key in the dashboard propagates within seconds
// (key gets refetched on every request, but we dedupe concurrent fetches).
let _keysCache: { keys: string[]; expiry: number } | null = null;
const KEYS_TTL_MS = 10_000;

async function getDashscopeKeys(): Promise<string[]> {
  const now = Date.now();
  if (_keysCache && _keysCache.expiry > now) return _keysCache.keys;

  const out: string[] = [];
  const envKey =
    Deno.env.get("DASHSCOPE_API_KEY") ||
    Deno.env.get("QWEN_API_KEY") ||
    Deno.env.get("ALIBABA_API_KEY");
  if (envKey) out.push(envKey);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (supabaseUrl && serviceRole) {
    try {
      const admin = createClient(supabaseUrl, serviceRole, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      // Newest first so a freshly-added key is tried before older ones.
      const { data, error } = await admin
        .from("api_keys")
        .select("service, api_key, is_active, is_blocked, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        console.error("[chat-alibaba] api_keys lookup failed", error.message);
      } else {
        for (const item of data || []) {
          if (
            DASHSCOPE_SERVICES.has(normalizeService((item as any).service)) &&
            (item as any).api_key &&
            (item as any).is_active !== false &&
            (item as any).is_blocked !== true
          ) {
            out.push((item as any).api_key);
          }
        }
      }
    } catch (e) {
      console.error("[chat-alibaba] api_keys query failed", (e as Error).message);
    }
  }

  // Dedupe while preserving order.
  const seen = new Set<string>();
  const unique = out.filter((k) => (seen.has(k) ? false : (seen.add(k), true)));
  _keysCache = { keys: unique, expiry: now + KEYS_TTL_MS };
  return unique;
}

async function getDashscopeKey(): Promise<string | null> {
  const keys = await getDashscopeKeys();
  return keys[0] || null;
}

/** Invalidate the key cache so the next request refetches from the DB. */
function invalidateKeyCache() {
  _keysCache = null;
}

function hasImage(messages: ChatMessage[]) {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part: any) => part?.type === "image_url" || part?.image_url),
  );
}

function pickQwenModel(rawModel: unknown, tier: unknown, messages: ChatMessage[]) {
  if (hasImage(messages)) return "qwen-vl-max";
  const raw = String(rawModel || tier || "").toLowerCase();
  if (raw.includes("qwen-turbo")) return "qwen-turbo";
  if (raw.includes("qwen-plus")) return "qwen-plus-latest";
  if (raw.includes("qwen-max")) return "qwen-plus-latest"; // qwen-max leaks Chinese into non-Chinese replies
  if (raw.includes("qwen3-coder"))
    return raw.includes("/") ? raw.split("/").pop() || "qwen3-coder-plus" : raw;
  if (raw.includes("lite") || raw.includes("nano")) return "qwen-turbo";
  if (raw.includes("pro") || raw.includes("max")) return "qwen-plus-latest";
  return "qwen-plus-latest";
}

function normalizeMessages(messages: ChatMessage[]) {
  return messages
    .filter((message) => ["system", "user", "assistant"].includes(String(message.role || "")))
    .map((message) => ({ role: message.role, content: message.content || "" }))
    .filter(
      (message) =>
        !(
          message.role === "assistant" &&
          typeof message.content === "string" &&
          !message.content.trim()
        ),
    );
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => part?.text || part?.content || "")
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function latestUserText(messages: ChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      const text = contentToText(messages[i].content).trim();
      if (text) return text;
    }
  }
  return messages
    .map((message) => contentToText(message.content))
    .join("\n")
    .trim();
}

const EXTENDED_RESEARCH_SECTIONS = [
  {
    title: "Scope, thesis, and executive overview",
    focus:
      "define the topic precisely, explain why it matters, summarize the core thesis, and map the report's scope",
  },
  {
    title: "Definitions, background, and historical context",
    focus:
      "explain concepts, terminology, origin story, historical milestones, and context needed before analysis",
  },
  {
    title: "Current state and latest developments",
    focus:
      "cover recent developments, current facts, active debates, major news, and what changed recently",
  },
  {
    title: "Key actors, stakeholders, and institutional landscape",
    focus:
      "map people, organizations, countries, companies, communities, regulators, and other actors involved",
  },
  {
    title: "Evidence base and source-by-source findings",
    focus:
      "compare what the strongest sources say, identify agreements and contradictions, and quote concrete figures or claims",
  },
  {
    title: "Drivers, causes, mechanisms, and incentives",
    focus:
      "analyze why the situation exists, the forces behind it, incentives, constraints, and causal chains",
  },
  {
    title: "Data, metrics, numbers, and measurable indicators",
    focus:
      "collect statistics, estimates, dates, rankings, financials, adoption numbers, timelines, or measurable evidence",
  },
  {
    title: "Regional, sectoral, and comparative analysis",
    focus:
      "compare regions, markets, sectors, groups, alternatives, or historical analogies relevant to the topic",
  },
  {
    title: "Case studies and concrete examples",
    focus:
      "write detailed examples and mini-case-studies that make the topic specific instead of generic",
  },
  {
    title: "Benefits, opportunities, strengths, and upside scenarios",
    focus:
      "analyze positive outcomes, opportunities, strategic advantages, and best-case interpretations",
  },
  {
    title: "Risks, criticism, limitations, and counterarguments",
    focus:
      "analyze weaknesses, failure modes, controversies, opposing views, uncertainty, and source limitations",
  },
  {
    title: "Future outlook and scenario planning",
    focus:
      "project likely paths, alternative scenarios, early signals to watch, and second-order effects",
  },
  {
    title: "Practical implications and recommendations",
    focus:
      "turn the analysis into practical takeaways, decisions, recommendations, and action priorities",
  },
  {
    title: "Final synthesis, open questions, and sources",
    focus:
      "synthesize the whole report, identify unresolved questions, and finish with a detailed Sources section",
  },
];

function enqueueSse(controller: ReadableStreamDefaultController<Uint8Array>, payload: unknown) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

function enqueueText(controller: ReadableStreamDefaultController<Uint8Array>, content: string) {
  if (!content) return;
  enqueueSse(controller, { choices: [{ delta: { content } }] });
}

function enqueueDone(controller: ReadableStreamDefaultController<Uint8Array>) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
}

// All research turns run on Alibaba Qwen with native web search.
type ResearchProvider = { kind: "dashscope" };

function countWords(text: string): number {
  return (text.trim().match(/\S+/g) || []).length;
}

// Generic OpenAI-compatible SSE streamer. Streams content deltas to the client
// AND returns the full accumulated text so the caller can measure depth.
async function streamOpenAICompatible(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  controller: ReadableStreamDefaultController<Uint8Array>,
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(extraHeaders || {}),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!upstream.ok || !upstream.body) {
    const errorText = await upstream.text().catch(() => "");
    throw new Error(`Upstream error ${upstream.status}: ${errorText.slice(0, 500)}`);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let collected = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "" || !line.startsWith("data:")) continue;

      const raw = line.replace(/^data:\s*/, "").trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const parsed = JSON.parse(raw);
        const content =
          parsed?.choices?.[0]?.delta?.content ?? parsed?.choices?.[0]?.message?.content ?? "";
        if (typeof content === "string" && content) {
          collected += content;
          enqueueText(controller, content);
        }
      } catch {
        continue;
      }
    }
  }
  return collected;
}

// Runs one writing turn against Qwen with native web search, returning the streamed text.
async function streamResearchTurn(
  _provider: ResearchProvider,
  dashscopeKey: string,
  _router: { url: string; key: string } | null,
  systemPrompt: string,
  userPrompt: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  signal?: AbortSignal,
): Promise<string> {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  // DashScope / Qwen with native forced web search.
  return await streamOpenAICompatible(
    DASHSCOPE_URL,
    dashscopeKey,
    {
      model: "qwen-max",
      stream: true,
      temperature: 0.35,
      max_tokens: 8192,
      enable_search: true,
      search_options: { forced_search: true, enable_source: true, search_strategy: "pro" },
      messages,
    },
    controller,
    signal,
  );
}

function streamExtendedResearch(
  apiKey: string,
  _router: { url: string; key: string } | null,
  messages: ChatMessage[],
  researchPrompt: string,
  signal?: AbortSignal,
) {
  const topic = latestUserText(messages) || "Deep Research";
  const conversationContext = messages
    .slice(-8)
    .map(
      (message) =>
        `${String(message.role || "user").toUpperCase()}: ${contentToText(message.content)}`,
    )
    .join("\n\n")
    .slice(-18_000);
  const outline = EXTENDED_RESEARCH_SECTIONS.map(
    (section, index) => `${index + 1}. ${section.title}: ${section.focus}`,
  ).join("\n");

  // Single-provider pool: Alibaba Qwen (native web search) handles every section.
  const pool: ResearchProvider[] = [{ kind: "dashscope" }];

  const MIN_SECTION_WORDS = 1600;

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          enqueueSse(controller, {
            status: `Building a 40,000+ word deep research report with Qwen...`,
          });

          for (let index = 0; index < EXTENDED_RESEARCH_SECTIONS.length; index++) {
            if (signal?.aborted) throw new Error("Request cancelled");
            const section = EXTENDED_RESEARCH_SECTIONS[index];
            const sectionNumber = index + 1;
            const provider = pool[index % pool.length];
            const providerLabel = "qwen-max";

            enqueueSse(controller, {
              status: `Researching section ${sectionNumber}/${EXTENDED_RESEARCH_SECTIONS.length} (${providerLabel}): ${section.title}`,
            });
            if (index > 0) enqueueText(controller, "\n\n---\n\n");

            const sectionPrompt = `Original research request:\n${topic}\n\nRecent conversation context:\n${conversationContext}\n\nFull report outline (${EXTENDED_RESEARCH_SECTIONS.length} sections):\n${outline}\n\nWrite section ${sectionNumber}/${EXTENDED_RESEARCH_SECTIONS.length}: "${section.title}".\nFocus only on: ${section.focus}.\n\nDepth requirements:\n- This is one part of a 40,000+ word report. Write this section as a long, standalone, deeply researched chapter.\n- Target 2,800-3,800 words for this section; do not summarize briefly.\n- Use H2/H3 headings, dense paragraphs, bullets, and tables where useful.\n- Include concrete names, dates, numbers, examples, and nuanced analysis.\n- Use web search and add inline citations like [1], [2] for factual claims.\n- Do NOT write the other sections. Do NOT end the whole report unless this is section ${EXTENDED_RESEARCH_SECTIONS.length}.\n- Match the user's exact language and dialect throughout.`;

            let sectionText = "";
            try {
              sectionText = await streamResearchTurn(
                provider,
                apiKey,
                null,
                researchPrompt,
                sectionPrompt,
                controller,
                signal,
              );
            } catch (turnError) {
              console.error(`[deep-research] section ${sectionNumber} failed`, turnError);
              throw turnError;
            }

            // Continuation pass: if a section came back thin, have Qwen continue it.
            if (countWords(sectionText) < MIN_SECTION_WORDS && !signal?.aborted) {
              enqueueSse(controller, {
                status: `Deepening section ${sectionNumber} (${providerLabel})...`,
              });
              const continuationPrompt = `You are continuing section ${sectionNumber}/${EXTENDED_RESEARCH_SECTIONS.length}: "${section.title}" of a 40,000+ word report on:\n${topic}\n\nHere is what has been written so far for this section:\n"""\n${sectionText.slice(-6000)}\n"""\n\nContinue seamlessly from where it stopped. Do NOT repeat earlier content, do NOT restate the heading, and do NOT start the next section. Add at least 1,500 more words of NEW, deeper analysis on: ${section.focus}. Include extra concrete data, examples, names, numbers, tables, and inline citations [n]. Match the user's exact language and dialect.`;
              enqueueText(controller, "\n\n");
              try {
                await streamResearchTurn(
                  provider,
                  apiKey,
                  null,
                  researchPrompt,
                  continuationPrompt,
                  controller,
                  signal,
                );
              } catch (contError) {
                console.error(
                  `[deep-research] section ${sectionNumber} continuation failed`,
                  contError,
                );
              }
            }
          }

          enqueueDone(controller);
        } catch (error) {
          console.error("[chat-alibaba/deep-research]", error);
          enqueueSse(controller, { error: (error as Error)?.message || "Deep Research failed" });
          enqueueDone(controller);
        } finally {
          controller.close();
        }
      },
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    },
  );
}

// ============= Tools-enabled chat loop =============
// When the user has connected Pipedream apps, we expose them as function tools.
// Qwen models on DashScope support OpenAI-style tool calling.
// We do the loop non-streaming (simpler & robust), then emit the final assistant
// content as SSE deltas so the existing chat client keeps working.
async function runWithTools(opts: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
  tools: any[];
  toolDefByName: Map<string, ToolDef>;
  connectedAccounts: Array<{
    app_slug: string;
    account_id: string;
    external_user_id: string | null;
  }>;
  userId: string;
  signal?: AbortSignal;
}): Promise<Response> {
  const {
    apiKey,
    model,
    systemPrompt,
    messages,
    tools,
    toolDefByName,
    connectedAccounts,
    userId,
    signal,
  } = opts;

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        const convo: any[] = [{ role: "system", content: systemPrompt }, ...messages];

        try {
          for (let step = 0; step < 6; step++) {
            if (signal?.aborted) throw new Error("cancelled");

            const upstreamBody = {
              model,
              messages: convo,
              tools,
              tool_choice: "auto",
              stream: false,
              temperature: 0.4,
              max_tokens: 2048,
            };
            const r = await fetch(DASHSCOPE_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify(upstreamBody),
            });
            if (!r.ok) {
              const txt = await r.text().catch(() => "");
              throw new Error(`upstream_${r.status}: ${txt.slice(0, 300)}`);
            }
            const data = await r.json();
            const choice = data?.choices?.[0];
            const msg = choice?.message;
            if (!msg) throw new Error("no_choice");

            const toolCalls = msg.tool_calls ?? [];
            if (toolCalls.length === 0) {
              // Final answer — stream content to client
              const finalText: string =
                typeof msg.content === "string"
                  ? msg.content
                  : Array.isArray(msg.content)
                    ? msg.content.map((p: any) => p?.text || "").join("")
                    : "";
              // Send in reasonable chunks so it feels streamed
              const chunkSize = 24;
              for (let i = 0; i < finalText.length; i += chunkSize) {
                if (signal?.aborted) break;
                enqueueText(controller, finalText.slice(i, i + chunkSize));
              }
              enqueueDone(controller);
              controller.close();
              return;
            }

            // Push assistant message with tool_calls into history
            convo.push({ role: "assistant", content: msg.content || "", tool_calls: toolCalls });

            // Execute each tool call via Pipedream Connect Proxy
            for (const tc of toolCalls) {
              const name = tc?.function?.name;
              const argsRaw = tc?.function?.arguments ?? "{}";
              let args: Record<string, any> = {};
              try {
                args = typeof argsRaw === "string" ? JSON.parse(argsRaw) : argsRaw;
              } catch {
                args = {};
              }

              const def = toolDefByName.get(name);
              // Emit a tool_call SSE event for the UI
              enqueueSse(controller, { tool_event: { type: "tool_call", name, args } });

              let resultPayload: any;
              if (!def) {
                resultPayload = { error: `unknown_tool:${name}` };
              } else {
                const account = connectedAccounts.find((a) => a.app_slug === def.appSlug);
                if (!account) {
                  resultPayload = { error: `not_connected:${def.appSlug}` };
                } else {
                  try {
                    const req = resolveRequest(def, args);
                    const proxied = await proxyRequest({
                      externalUserId: account.external_user_id || userId,
                      accountId: account.account_id,
                      method: req.method,
                      url: req.url,
                      body: req.body,
                      headers: req.headers,
                    });
                    resultPayload = proxied;
                  } catch (e) {
                    resultPayload = { error: e instanceof Error ? e.message : String(e) };
                  }
                }
              }

              // Truncate large results before re-feeding into the model
              const resultStr = JSON.stringify(resultPayload).slice(0, 8000);
              convo.push({ role: "tool", tool_call_id: tc.id, name, content: resultStr });
              enqueueSse(controller, {
                tool_event: {
                  type: "tool_result",
                  name,
                  ok: !resultPayload?.error,
                  result: resultPayload,
                },
              });
            }
          }
          // Fell out of loop — emit a sensible message
          enqueueText(controller, "\n\n(Stopped after maximum tool iterations.)");
          enqueueDone(controller);
          controller.close();
        } catch (err) {
          console.error("[chat-alibaba/tools]", err);
          enqueueSse(controller, { error: err instanceof Error ? err.message : String(err) });
          enqueueDone(controller);
          controller.close();
        }
      },
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    },
  );
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extractClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

serve(async (req) => {
  const corsHeadersWithFp = {
    ...corsHeaders,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-anon-fingerprint",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersWithFp });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Co-hosted Tasks/Agents bot dispatcher.
  // Lets us run the admin/Telegram bot logic without consuming a separate
  // edge-function slot. Triggered when the caller passes `__tasks_bot: true`
  // in the JSON body, or hits the `/chat-alibaba/tasks-bot` sub-path, or
  // posts a Telegram webhook update (detected by `update_id`).
  try {
    const url = new URL(req.url);
    const pathHit = url.pathname.endsWith("/tasks-bot");
    let bodyHit = false;
    let forwardReq: Request = req;
    if (!pathHit) {
      const peek = await req.clone().json().catch(() => null);
      if (peek && typeof peek === "object") {
        if (peek.__tasks_bot === true || typeof peek.update_id === "number") {
          bodyHit = true;
          // Strip discriminator before forwarding
          const { __tasks_bot: _omit, ...rest } = peek as Record<string, unknown>;
          forwardReq = new Request(req.url, {
            method: "POST",
            headers: req.headers,
            body: JSON.stringify(rest),
          });
        }
      }
    }
    if (pathHit || bodyHit) {
      const res = await handleTasksBotRequest(forwardReq);
      // Mirror CORS headers
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(corsHeadersWithFp)) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    }
  } catch (e) {
    console.error("[chat-alibaba] tasks-bot dispatch failed", e);
  }

  // --- Auth / Guest gating ---
  // Signed-in users: full access. Anonymous visitors get ONE free chat per
  // (ip + browser fingerprint), recorded in public.anonymous_chat_usage.
  const authHeader = req.headers.get("Authorization") ?? "";
  const anonFingerprint = (req.headers.get("x-anon-fingerprint") || "").trim();
  let authedUserId: string | null = null;
  let isGuest = false;

  const supabaseUrlEarly = Deno.env.get("SUPABASE_URL");
  const anonKeyEarly = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleEarly = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrlEarly || !anonKeyEarly || !serviceRoleEarly) {
    return json({ error: "Server misconfigured" }, 500);
  }

  // The publishable/anon JWT is sent on every browser request — treat it as guest.
  const tokenPart = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const looksLikePublishable = tokenPart && tokenPart === anonKeyEarly;
  if (tokenPart && !looksLikePublishable) {
    try {
      const authClient = createClient(supabaseUrlEarly, anonKeyEarly, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: userData } = await authClient.auth.getUser();
      if (userData?.user?.id) authedUserId = userData.user.id;
    } catch {
      authedUserId = null;
    }
  }

  if (!authedUserId) {
    // Normal chat is fully public — no sign-in required, no per-guest quota.
    isGuest = true;
  }

  const body = await req.json().catch(() => null);

  // Guests can only do a basic chat — no voice transcription, no deep research, no tools.
  if (isGuest) {
    if (body?.action === "transcribe") {
      return json({ error: "Sign in to use voice transcription", code: "auth_required" }, 403);
    }
    if (body?.deepResearch === true) {
      return json({ error: "Sign in to use Deep Research", code: "auth_required" }, 403);
    }
  }

  // --- Action: personalization_suggest ---
  // Auto-fill AI Personalization fields using REAL user data (profile + their
  // recent chat messages). Never fabricates info — empty string when unclear.
  if (body && body.action === "personalization_suggest") {
    try {
      if (!authedUserId) return json({ error: "auth_required" }, 401);
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

      const [profileRes, msgRes, userRes] = await Promise.all([
        admin.from("profiles").select("display_name").eq("id", authedUserId).maybeSingle(),
        admin
          .from("messages")
          .select("content, created_at")
          .eq("user_id", authedUserId)
          .eq("role", "user")
          .order("created_at", { ascending: false })
          .limit(60),
        admin.auth.admin.getUserById(authedUserId),
      ]);

      const displayName = ((profileRes.data as any)?.display_name || "").toString().trim();
      const email = (userRes.data?.user?.email || "").toString();
      const emailLocal = email.split("@")[0] || "";

      const messages = ((msgRes.data as any[]) || [])
        .map((m) => (typeof m.content === "string" ? m.content : ""))
        .filter((s) => s && s.length > 4)
        .map((s) => s.slice(0, 600))
        .slice(0, 40);

      const empty = {
        call_name: "",
        profession: "",
        about: "",
        interests: [] as string[],
        ai_traits: "",
        custom_instructions: "",
      };

      if (messages.length < 3) {
        return json({
          suggestion: { ...empty, call_name: displayName || emailLocal || "" },
          source: "profile_only",
        });
      }

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        return json({
          suggestion: { ...empty, call_name: displayName || emailLocal || "" },
          source: "no_gateway",
        });
      }

      const system = [
        "You analyze a real user's profile and their actual recent chat messages to suggest values for their AI personalization settings.",
        "STRICT RULES:",
        "- Use ONLY information clearly evident from the data. Do NOT invent details.",
        "- If a field has no clear signal, return an empty string (empty array for interests).",
        "- call_name: how they'd like to be addressed (first name if obvious, else empty).",
        "- profession: their role/field if mentioned or strongly implied, else empty.",
        "- about: 1-2 short sentences summarizing them in second person ('You ...'). Empty if unclear.",
        "- interests: up to 6 short topic tags they actually discuss (lowercase, 1-3 words each).",
        "- ai_traits: how the assistant should behave for them (short phrase). Empty if unclear.",
        "- custom_instructions: recurring preferences they've shown (e.g. 'reply in Arabic'). Empty if none.",
        "- Write text fields in the language they predominantly use.",
        "Return ONLY a JSON object with keys: call_name, profession, about, interests, ai_traits, custom_instructions.",
      ].join("\n");

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: JSON.stringify({
                profile: { display_name: displayName || null, email_local_part: emailLocal || null },
                recent_user_messages: messages,
              }),
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
      });

      if (!aiResp.ok) {
        const txt = await aiResp.text();
        if (aiResp.status === 429) return json({ error: "Rate limit. Try again shortly." }, 429);
        if (aiResp.status === 402) return json({ error: "AI credits exhausted." }, 402);
        return json({ error: `AI error: ${txt.slice(0, 200)}` }, 500);
      }

      const data = await aiResp.json();
      const raw = data?.choices?.[0]?.message?.content || "{}";
      let parsed: any = {};
      try {
        parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        parsed = {};
      }
      const str = (v: any) => (typeof v === "string" ? v.trim() : "");
      const suggestion = {
        call_name: str(parsed.call_name) || displayName || "",
        profession: str(parsed.profession),
        about: str(parsed.about),
        interests: Array.isArray(parsed.interests)
          ? parsed.interests.map((x: any) => str(x).toLowerCase()).filter(Boolean).slice(0, 8)
          : [],
        ai_traits: str(parsed.ai_traits),
        custom_instructions: str(parsed.custom_instructions),
      };
      return json({ suggestion, source: "ai", message_count: messages.length });
    } catch (e) {
      return json({ error: (e as Error).message }, 500);
    }
  }


  // --- Action: embed (DashScope text-embedding-v4) ---
  // Body shapes:
  //   { action: "embed", text: string }                  → { embedding: number[] }
  //   { action: "embed", texts: string[] }               → { embeddings: number[][] }
  //   { action: "embed", message_ids: string[] }         → embeds & saves; { updated }
  //   { action: "embed", backfill: "skills"|"system_skills"|"messages", limit? } → { updated }
  if (body && body.action === "embed") {
    try {
      // Bulk backfill (admin path — requires authedUserId).
      if (typeof body.backfill === "string") {
        if (!authedUserId) return json({ error: "auth_required" }, 401);
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
        const table = body.backfill;
        const limit = Math.min(Number(body.limit) || 100, 200);
        const allowed = new Set(["skills", "system_skills", "messages"]);
        if (!allowed.has(table)) return json({ error: "Invalid table" }, 400);
        const cols = table === "messages" ? "id, content" : "id, name, description, body, triggers";
        const { data, error } = await admin
          .from(table)
          .select(cols)
          .is("embedding", null)
          .limit(limit);
        if (error) return json({ error: error.message }, 500);
        const rows = (data ?? []) as any[];
        const items = rows
          .map((r) => {
            const text =
              table === "messages"
                ? (r.content || "").toString()
                : [
                    r.name,
                    r.description,
                    Array.isArray(r.triggers) ? r.triggers.join(", ") : "",
                    r.body,
                  ]
                    .filter(Boolean)
                    .join("\n")
                    .slice(0, 4000);
            return { id: r.id, text };
          })
          .filter((it) => it.text.trim().length > 0);
        if (items.length === 0) return json({ updated: 0 });
        const { embedTexts: et, toPgVector: tv } = await import("../_shared/embeddings.ts");
        const { embeddings } = await et(items.map((it) => it.text));
        let updated = 0;
        for (let i = 0; i < items.length; i++) {
          if (!embeddings[i]) continue;
          const { error: upErr } = await admin
            .from(table)
            .update({ embedding: tv(embeddings[i]) as any })
            .eq("id", items[i].id);
          if (!upErr) updated++;
        }
        return json({ updated, table });
      }

      // Embed by message id (writes back, scoped to caller).
      if (Array.isArray(body.message_ids) && body.message_ids.length > 0) {
        if (!authedUserId) return json({ error: "auth_required" }, 401);
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
        const ids = body.message_ids.slice(0, 50);
        const { data, error } = await admin
          .from("messages")
          .select("id, content, user_id")
          .in("id", ids)
          .is("embedding", null);
        if (error) return json({ error: error.message }, 500);
        // Only embed rows owned by the caller (defense-in-depth).
        const rows = (data ?? []).filter(
          (r: any) => r.user_id === authedUserId && (r.content || "").trim().length > 0,
        );
        if (rows.length === 0) return json({ updated: 0 });
        const { embeddings } = await (
          await import("../_shared/embeddings.ts")
        ).embedTexts(rows.map((r: any) => r.content));
        const { toPgVector: tv } = await import("../_shared/embeddings.ts");
        let updated = 0;
        for (let i = 0; i < rows.length; i++) {
          if (!embeddings[i]) continue;
          const { error: upErr } = await admin
            .from("messages")
            .update({ embedding: tv(embeddings[i]) as any })
            .eq("id", rows[i].id);
          if (!upErr) updated++;
        }
        return json({ updated });
      }

      // Raw embedding(s).
      const { embedText: et1, embedTexts: et2 } = await import("../_shared/embeddings.ts");
      if (Array.isArray(body.texts)) {
        const { embeddings, usage } = await et2(body.texts);
        return json({ embeddings, usage });
      }
      if (typeof body.text === "string") {
        const embedding = await et1(body.text);
        return json({ embedding });
      }
      return json({ error: "Provide text, texts[], message_ids[], or backfill" }, 400);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[chat-alibaba/embed] error", msg);
      // Embeddings are best-effort (used for semantic memory). Upstream
      // DashScope pipeline errors should not surface as 500s to the client
      // since the call is fire-and-forget from saveConversation.
      return json({ error: msg, skipped: true }, 200);
    }
  }

  // --- Action: ingest_attachment (chunk + embed file text into attachment_chunks) ---
  // Body: { action: "ingest_attachment", conversation_id: string, file_name: string, text: string }
  if (body && body.action === "ingest_attachment") {
    try {
      if (!authedUserId) return json({ error: "auth_required" }, 401);
      const conversationId = String(body.conversation_id || "").trim();
      const fileName = String(body.file_name || "file").slice(0, 200);
      const fullText = String(body.text || "").trim();
      if (!conversationId || !fullText)
        return json({ error: "conversation_id and text required" }, 400);

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

      // Chunk by ~1200 chars with 150 overlap, on whitespace boundaries.
      const CHUNK = 1200,
        OVERLAP = 150,
        MAX_CHUNKS = 60;
      const chunks: string[] = [];
      let i = 0;
      while (i < fullText.length && chunks.length < MAX_CHUNKS) {
        let end = Math.min(i + CHUNK, fullText.length);
        if (end < fullText.length) {
          const sp = fullText.lastIndexOf(" ", end);
          if (sp > i + CHUNK / 2) end = sp;
        }
        chunks.push(fullText.slice(i, end).trim());
        if (end >= fullText.length) break;
        i = end - OVERLAP;
      }
      const clean = chunks.filter((c) => c.length > 20);
      if (clean.length === 0) return json({ inserted: 0 });

      const { embedTexts: et, toPgVector: tv } = await import("../_shared/embeddings.ts");
      const { embeddings } = await et(clean);
      const rows = clean
        .map((content, idx) => ({
          user_id: authedUserId,
          conversation_id: conversationId,
          file_name: fileName,
          chunk_index: idx,
          content,
          embedding: embeddings[idx] ? (tv(embeddings[idx]) as any) : null,
        }))
        .filter((r) => r.embedding);
      if (rows.length === 0) return json({ inserted: 0 });
      const { error: insErr } = await admin.from("attachment_chunks").insert(rows as any);
      if (insErr) return json({ error: insErr.message }, 500);
      return json({ inserted: rows.length, file_name: fileName });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[chat-alibaba/ingest_attachment] error", msg);
      return json({ error: msg }, 500);
    }
  }

  // --- Action: transcribe (Qwen ASR) ---
  if (body && body.action === "transcribe") {
    const apiKey = await getDashscopeKey();
    if (!apiKey) return json({ error: "Alibaba/DashScope key is not configured" }, 503);
    const audio: string = body.audio || "";
    if (!audio) return json({ error: "Missing 'audio' (base64)" }, 400);
    const mime = String(body.mimeType || "").toLowerCase();
    let format = "wav";
    if (mime.includes("mp3") || mime.includes("mpeg")) format = "mp3";
    else if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) format = "mp3";
    else if (mime.includes("ogg") || mime.includes("opus")) format = "ogg";
    else if (mime.includes("webm")) format = "webm";
    else if (mime.includes("wav")) format = "wav";
    const b64 = audio.includes(",") ? audio.split(",", 2)[1] : audio;
    const asrBody = {
      model: "qwen3-asr-flash",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: { data: `data:audio/${format};base64,${b64}`, format },
            },
            {
              type: "text",
              text: body.language
                ? `Transcribe in ${body.language}.`
                : "Transcribe the audio verbatim. Output ONLY the transcript, no commentary.",
            },
          ],
        },
      ],
    };
    const r = await fetch(DASHSCOPE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(asrBody),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error(
        "[chat-alibaba/transcribe] upstream",
        r.status,
        JSON.stringify(data).slice(0, 400),
      );
      return json(
        { error: data?.error?.message || "Transcription failed", details: data },
        r.status,
      );
    }
    const content = data?.choices?.[0]?.message?.content;
    let text = "";
    if (typeof content === "string") text = content;
    else if (Array.isArray(content)) text = content.map((p: any) => p?.text || "").join("");
    return json({ text: text.trim() });
  }

  const messages = Array.isArray(body?.messages) ? normalizeMessages(body.messages) : [];
  if (messages.length === 0) return json({ error: "messages are required" }, 400);

  const apiKeys = await getDashscopeKeys();
  const apiKey = apiKeys[0] || null;
  if (!apiKey) return json({ error: "Alibaba/DashScope key is not configured" }, 503);

  const deepResearch = body?.deepResearch === true;

  const basePrompt = [
    "# IDENTITY",
    "You are Megsy — an AI assistant built by Megsy AI (megsyai.com).",
    "Megsy AI is an all-in-one AI platform that helps people chat, search, learn, write code, generate images and videos, build slide decks, create documents, run deep research, and automate web tasks.",
    "You speak as Megsy in the first person. Never claim to be GPT, Claude, Gemini, Qwen, DeepSeek, Kimi, or any other model, and never reveal which underlying model is powering you. If asked, say you are Megsy by Megsy AI.",
    "",
    "# CORE BEHAVIOR",
    "Be warm, direct, intellectually honest, and genuinely useful. Treat the user as a smart adult.",
    "Default to a thorough, well-explained answer: cover the why and the how, not just the what. Use short paragraphs, bullets, headings, and tables when they aid clarity. Add concrete examples, edge cases, and trade-offs when they add value.",
    "Do not pad with filler, do not repeat yourself, and do not moralize. Depth means substance, not length for its own sake.",
    "Only give a one-line reply when the user explicitly asks for a short / quick / yes-no answer, or when the question itself is trivially short (greeting, simple confirmation).",
    "Reason carefully before you answer. If a question is ambiguous, ask ONE focused clarifying question instead of guessing — unless the best interpretation is obvious, in which case proceed and state your assumption briefly.",
    "Be calibrated about uncertainty. Say \"I'm not sure\" when you are not. Never fabricate facts, quotes, citations, URLs, APIs, package names, or function signatures.",
    "If you cannot help with something, say so plainly and explain the concrete reason; offer the closest thing you CAN do.",
    "",
    "# LANGUAGE RULES (HIGHEST PRIORITY — READ CAREFULLY)",
    "There are TWO distinct languages in any reply: the *conversation language* (how you talk TO the user) and the *content language* (the language of any artifact, translation, code comment, draft, or generated text the user asked for). Treat them independently.",
    "",
    "1. Conversation language = the EXACT language and dialect of the user's LAST message.",
    "   - If they wrote in Egyptian Arabic, reply in Egyptian Arabic. Gulf → Gulf. Levantine → Levantine. Maghrebi/Darija → Maghrebi. Iraqi → Iraqi. MSA → MSA. English → English. French → French. And so on.",
    "   - Never default to MSA when the user wrote in a dialect. Never switch the conversation language on your own.",
    "   - Match their register too (formal vs casual, playful vs serious).",
    "",
    "2. Content language = whatever the user explicitly asked the output to be in.",
    "   - User writes in Arabic and says \"translate this to English\" → reply with the English translation ONLY. No Arabic preamble, no \"Here is the translation\", no commentary. Just the translated text. (Add a brief note only if they asked for one.)",
    "   - User writes in English and says \"اكتبلي إيميل بالعربي\" → talk to them in English (one short framing line is fine) and deliver the email body in Arabic.",
    "   - User writes in Arabic and asks for English copy / code / a draft → talk to them in Arabic, deliver the requested artifact in English.",
    "   - User writes in English and asks for an Arabic piece → talk to them in English, deliver the requested piece in Arabic.",
    "   - When the requested output is a pure translation or pure artifact (one block), do not wrap it in chatter from the conversation language. Just give the artifact.",
    "",
    "3. If the user explicitly requests a specific reply language (\"reply in English\", \"كلمني عربي\", \"رد بالفصحى\")، obey that immediately and keep it for the rest of the thread unless they change it.",
    "",
    "4. Keep the whole reply in ONE language unless the user mixed languages or unless rule 2 separates conversation-text from content-text. Technical terms, code identifiers, brand names, and proper nouns may stay in their original form.",
    "",
    "5. Never translate or alter quoted text, code, URLs, file names, or things in `backticks` / fenced code blocks.",
    "",
    "# TOOLS AVAILABLE ON THE MEGSY PLATFORM",
    "You operate inside the Megsy app, which exposes these capabilities. Recommend or invoke the right one when it clearly helps the user:",
    "- Web Search — live web results for current events, prices, recent releases, anything time-sensitive.",
    "- News Search — recent news articles.",
    "- Wikipedia — encyclopedic background facts.",
    "- ArXiv — academic papers and preprints.",
    "- GitHub Search — code, repos, issues, READMEs.",
    "- Stack Overflow — programming Q&A.",
    "- Reddit Search — community discussions and opinions.",
    "- YouTube Transcript — fetch and summarize a YouTube video's transcript.",
    "- Fetch URL — read the contents of a specific webpage the user shared.",
    "- Math Solver — exact symbolic/numeric math.",
    "- Generate Image — create images from a text prompt.",
    "- Generate Video — create short videos from a text prompt or image.",
    "- Generate Voice — text-to-speech.",
    "- Deep Research — produce a long, structured, multi-section research report with citations.",
    "- Slides — generate full slide decks (and export to PPTX).",
    "- Docs — generate structured documents.",
    "- Operator / Agent — multi-step web automation and tool orchestration.",
    "- Memory — remember facts the user shares about themselves across the conversation.",
    "If the user asks for an image, video, deck, document, or deep research, do not just describe it — tell them you'll generate it and proceed using the relevant tool. If a tool is not available in the current turn, say so and offer the best alternative (e.g. detailed text instead of an image).",
    "",
    "# CITATIONS",
    "When you rely on web results or fetched pages for factual claims, add inline numeric citations like [1], [2] and list the sources at the end under a short \"Sources\" / \"المصادر\" section (title + link). Do not invent citations.",
    "",
    "# FORMATTING",
    "Use Markdown. Use headings for multi-section answers, bullets for lists, fenced code blocks with the correct language tag for code, and tables for comparisons. Keep paragraphs short. For Arabic replies, write naturally right-to-left; Markdown still works.",
    "",
    "# SAFETY",
    "Refuse, in the conversation language, to help with content that would cause serious real-world harm (weapons of mass harm, sexual content involving minors, targeted harassment, instructions for violent attacks, malware aimed at specific victims, etc.). Briefly explain why and offer a safer alternative when possible. Do not lecture for ordinary requests.",
  ].join("\n");

  const researchPrompt = [
    "You are Megsy Deep Research, a meticulous senior research analyst.",
    "Produce a COMPREHENSIVE, in-depth research report — never a short summary.",
    "",
    "STRUCTURE (Markdown):",
    "- Start with a clear H1 title.",
    "- Write an introductory overview paragraph.",
    "- Use multiple H2/H3 sections covering background, key facts, analysis, different perspectives, timeline, impact, and notable details.",
    "- Use bullet lists and tables where they add clarity.",
    "- Be thorough and specific: include concrete dates, names, numbers, and facts. Avoid generic filler.",
    "- Add inline numeric citations like [1], [2] when you rely on web results.",
    "- End with a '## Sources' / '## المصادر' section listing the sources you used (title + link).",
    "",
    "LANGUAGE & DIALECT MIRRORING (HIGHEST PRIORITY):",
    "- Detect the EXACT language AND dialect of the user's topic and write the ENTIRE report in that same language and dialect.",
    "- Arabic dialects MUST be mirrored (Egyptian مصري, Gulf خليجي, Levantine شامي, Maghrebi مغربي, MSA فصحى). Never default to MSA if the user wrote in a dialect.",
    "- Aim for a long, detailed report (well beyond a few paragraphs).",
  ].join("\n");

  // Claude personas: routed through Alibaba/Qwen but with a Claude-flavored
  // system prompt so the assistant adopts Claude-style reasoning & tone.
  const rawSel = (
    typeof body?.selectedModel?.id === "string" ? body.selectedModel.id : ""
  ).toLowerCase();
  const isClaudeOpus = rawSel.includes("claude-opus");
  const isClaudeSonnet = rawSel.includes("claude-sonnet");
  const isKimi = rawSel.includes("kimi");
  const isDeepSeek = rawSel.includes("deepseek");
  const claudeFlavor = isClaudeOpus
    ? "Claude Opus 4.8"
    : isClaudeSonnet
      ? "Claude Sonnet 4.6"
      : isKimi
        ? "Kimi 2.6"
        : isDeepSeek
          ? "DeepSeek"
          : null;
  const claudePrompt = claudeFlavor
    ? [
        `You are ${claudeFlavor}, a thoughtful, careful, and articulate AI assistant.`,
        "Reason step-by-step internally, then give a clear, well-structured, THOROUGH answer.",
        "Default to depth: explain the why and how, include concrete examples, edge cases, and trade-offs.",
        "Prefer nuance, calibrated confidence, and structured formatting (short paragraphs, lists, headings) for complex topics.",
        "Avoid hype and filler — depth means substance, not length for its own sake.",
        "Only give a one-line answer when the user explicitly asks for a short / quick / yes-no reply, or for trivial greetings.",
        "Be honest about uncertainty. Never invent citations, APIs, or facts.",
        "",
        "LANGUAGE & DIALECT MIRRORING (HIGHEST PRIORITY):",
        "- Reply in the EXACT same language AND dialect as the user's LAST message.",
        "- Arabic dialects MUST be mirrored faithfully (Egyptian, Gulf, Levantine, Maghrebi, Iraqi, Sudanese, MSA).",
        "- Keep the whole reply in one language unless the user mixed languages.",
      ].join("\n")
    : null;

  const languageLockPrompt = buildLanguageLockPrompt(messages);
  const customSystem =
    typeof body?.customSystem === "string" && body.customSystem.trim().length > 0
      ? body.customSystem.trim()
      : null;
  const personaPrompt = customSystem
    ? customSystem
    : deepResearch
      ? researchPrompt
      : claudePrompt || basePrompt;
  const systemPrompt = [personaPrompt, languageLockPrompt].filter(Boolean).join("\n\n");

  const selectedModelId = typeof body?.selectedModel?.id === "string" ? body.selectedModel.id : "";
  const chosenModel = deepResearch
    ? "qwen-max"
    : claudeFlavor
      ? "qwen-plus-latest"
      : pickQwenModel(selectedModelId || body?.model || body?.tier, body?.tier, messages);
  const searchEnabled = body?.searchEnabled === true || deepResearch;

  if (deepResearch) {
    // All-Alibaba mode: research is authored entirely by Qwen (qwen-max with
    // native web search). We intentionally do NOT use OpenRouter models here.
    return streamExtendedResearch(apiKey, null, messages, researchPrompt, req.signal);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Odysseus-style orchestrator: ONE entry point that always runs through
  // a tool-enabled loop. First-party tools (web_search, memory_*, skills)
  // are always available; integration tools are loaded on demand via the
  // meta-tools tool_search / tool_invoke to keep the context light.
  // ───────────────────────────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

  const useToolsAllowed = body?.useTools !== false; // opt-out flag (kept)
  let connectedAccounts: Array<{
    app_slug: string;
    account_id: string;
    external_user_id: string | null;
  }> = [];
  let disabledSlugs = new Set<string>();
  let recallSnippets: string[] = [];
  let pastChatRecall: Array<{
    role: string;
    content: string;
    created_at: string;
    similarity: number;
  }> = [];
  let attachmentRecall: Array<{
    file_name: string;
    chunk_index: number;
    content: string;
    similarity: number;
  }> = [];
  let autoSkill: {
    name: string;
    description: string;
    instructions: string;
    similarity: number;
    preferred_model?: string | null;
  } | null = null;
  let personalizationPrompt = "";
  const semanticRecallEnabled = body?.semanticRecall === true;

  if (authedUserId && supabaseUrl && serviceRole) {
    try {
      const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

      // Embed the latest user message ONCE, then reuse it for both
      // (a) cross-conversation memory recall and (b) skills auto-retrieval.
      const lastUserMsg = [...messages].reverse().find((m: any) => m?.role === "user");
      const lastUserText =
        typeof lastUserMsg?.content === "string"
          ? lastUserMsg.content
          : Array.isArray(lastUserMsg?.content)
            ? lastUserMsg.content
                .map((p: any) => p?.text || "")
                .join(" ")
                .trim()
            : "";

      const semanticPromise: Promise<{ past: any[]; skills: any[]; attachments: any[] }> =
        semanticRecallEnabled && lastUserText && lastUserText.length > 4
          ? embedText(lastUserText.slice(0, 2000))
              .then(async (emb) => {
                if (!emb) return { past: [], skills: [], attachments: [] };
                const vec = toPgVector(emb) as any;
                const [pastRes, skillRes, attachRes] = await Promise.all([
                  admin.rpc("match_user_messages", {
                    query_embedding: vec,
                    p_user_id: authedUserId,
                    p_match_count: 6,
                    p_exclude_conversation: body?.conversation_id ?? null,
                    p_min_similarity: 0.55,
                  }),
                  body?.activeSkill
                    ? Promise.resolve({ data: [] as any[] })
                    : admin.rpc("match_skills", {
                        query_embedding: vec,
                        p_user_id: authedUserId,
                        p_match_count: 1,
                        p_min_similarity: 0.62,
                      }),
                  body?.conversation_id
                    ? admin.rpc("match_attachment_chunks", {
                        query_embedding: vec,
                        p_conversation_id: body.conversation_id,
                        p_match_count: 5,
                        p_min_similarity: 0.45,
                      })
                    : Promise.resolve({ data: [] as any[] }),
                ]);
                return {
                  past: (pastRes.data as any[]) ?? [],
                  skills: (skillRes.data as any[]) ?? [],
                  attachments: (attachRes.data as any[]) ?? [],
                };
              })
              .catch((e) => {
                console.warn("[chat-alibaba] semantic recall failed", e);
                return { past: [], skills: [], attachments: [] };
              })
          : Promise.resolve({ past: [], skills: [], attachments: [] });

      const [accs, toggles, mem, semantic, pers, memProf] = await Promise.all([
        useToolsAllowed
          ? admin
              .from("pipedream_accounts")
              .select("app_slug, account_id, external_user_id, healthy")
              .eq("user_id", authedUserId)
          : Promise.resolve({ data: [] as any[], error: null }),
        useToolsAllowed
          ? admin
              .from("pipedream_tool_settings")
              .select("app_slug, enabled")
              .eq("user_id", authedUserId)
          : Promise.resolve({ data: [] as any[], error: null }),
        admin
          .from("user_memory_entries")
          .select("title, summary")
          .eq("user_id", authedUserId)
          .order("created_at", { ascending: false })
          .limit(5),
        semanticPromise,
        admin
          .from("ai_personalization")
          .select(
            "call_name, profession, about, ai_traits, custom_instructions, tone_formality, tone_verbosity, tone_creativity, language_style, interests",
          )
          .eq("user_id", authedUserId)
          .maybeSingle(),
        admin
          .from("user_memory_profiles")
          .select("preferences")
          .eq("user_id", authedUserId)
          .maybeSingle(),
      ]);
      personalizationPrompt = buildPersonalizationPrompt((pers as any)?.data ?? null);
      connectedAccounts = (accs.data ?? []).filter((a: any) => a.healthy !== false);
      disabledSlugs = new Set<string>(
        (toggles.data ?? []).filter((t: any) => t.enabled === false).map((t: any) => t.app_slug),
      );
      const memoryEnabled = (memProf as any)?.data?.preferences?.enabled !== false;
      recallSnippets = memoryEnabled
        ? (mem.data ?? []).map((m: any) => `${m.title}: ${m.summary}`.slice(0, 300))
        : [];
      pastChatRecall = semantic.past;
      attachmentRecall = semantic.attachments || [];
      if (semantic.skills.length > 0) {
        const s = semantic.skills[0];
        autoSkill = {
          name: s.name,
          description: s.description,
          instructions: s.instructions,
          similarity: s.similarity,
          preferred_model: s.preferred_model,
        };
        console.log("[chat-alibaba] auto-activated skill", s.name, "sim=", s.similarity);
      }
    } catch (e) {
      console.warn("[chat-alibaba] context fetch failed", e);
    }
  }

  const { integrationTools, integrationByName } = buildIntegrationCatalog(
    connectedAccounts,
    disabledSlugs,
  );

  const odysseusCtx: RegistryContext = {
    dashscopeKey: apiKey,
    dashscopeKeys: apiKeys,
    invalidateKeyCache: invalidateKeyCache,
    userId: authedUserId,
    isGuest,
    supabaseUrl,
    serviceRoleKey: serviceRole,
    userAuthHeader: authHeader || null,
    connectedAccounts,
    integrationTools,
    integrationByName,
  };


  const firstPartyTools = buildFirstPartyTools(odysseusCtx);
  // Odysseus deferral: only expose first-party tools + meta-tools. The full
  // connector catalog stays behind tool_search/tool_invoke so Qwen is not
  // overwhelmed by every Gmail/Slack/Notion/etc schema on ordinary chat turns.
  const allTools = firstPartyTools;

  const manualSkill =
    body?.activeSkill && typeof body.activeSkill === "object" ? body.activeSkill : null;
  const activeSkill = manualSkill || autoSkill;

  // Merge semantic recall from past conversations into recallSnippets so the
  // assistant has long-term memory across threads (powered by DashScope embeddings).
  const pastSnippets = pastChatRecall.slice(0, 4).map((m) => {
    const when = (m.created_at || "").slice(0, 10);
    const who = m.role === "assistant" ? "assistant" : "user";
    const text = (m.content || "").replace(/\s+/g, " ").slice(0, 280);
    return `[past chat ${when}, ${who}] ${text}`;
  });
  const attachmentSnippets = attachmentRecall.slice(0, 5).map((c) => {
    const text = (c.content || "").replace(/\s+/g, " ").slice(0, 500);
    return `[file: ${c.file_name} #${c.chunk_index}] ${text}`;
  });
  const mergedRecall = [...attachmentSnippets, ...pastSnippets, ...recallSnippets];

  // Progressive skill disclosure: when the skill was auto-matched (semantic),
  // inject only a short summary and let the model call `skill_lookup` for the
  // full instructions on demand. When the user manually picked a skill, we
  // honour their choice and inject full instructions.
  const isAutoSkill = !manualSkill && !!autoSkill;
  const odysseusPrompt = buildOdysseusSystemPrompt({
    hasIntegrations: integrationTools.length > 0,
    connectedApps: connectedAccounts.map((a) => a.app_slug),
    activeSkillName: activeSkill?.name,
    activeSkillDescription: (activeSkill as any)?.description,
    activeSkillInstructions: activeSkill?.instructions,
    progressiveSkill: isAutoSkill,
    recallSnippets: mergedRecall,
    isGuest,
  });

  const baseFinalSystemPrompt = claudePrompt
    ? `${systemPrompt}\n\n---\n\n${odysseusPrompt}`
    : `${odysseusPrompt}\n\n${personaPrompt}`;
  const withPersonalization = personalizationPrompt
    ? `${baseFinalSystemPrompt}\n\n---\n\n${personalizationPrompt}`
    : baseFinalSystemPrompt;
  // ALWAYS append the per-turn language lock LAST so it overrides every
  // earlier instruction (persona, UI locale, personalization, memory, etc.).
  const finalSystemPrompt = `${withPersonalization}\n\n---\n\n${languageLockPrompt}`;

  // Smart model routing: pick the cheapest Qwen tier that can answer this
  // request well. Honors explicit user picks (turbo/plus/max) unless the
  // context is huge. Logs the decision for observability.
  const userPickedExplicit = typeof selectedModelId === "string" && selectedModelId.length > 0;
  const routed = routeModel({
    messages,
    userPickedExplicit,
    resolvedModel: chosenModel,
    hasIntegrations: integrationTools.length > 0,
  });
  if (routed.model !== chosenModel) {
    console.log(`[chat-alibaba] model_router: ${chosenModel} → ${routed.model} (${routed.reason})`);
  }

  // Detect strong "build me a website" intent in the last user turn so we
  // can FORCE the first tool call to build_website. Otherwise the model
  // tends to write prose instead of calling the tool.
  const lastUserText = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role !== "user") continue;
      const c = m.content;
      if (typeof c === "string") return c;
      if (Array.isArray(c)) return c.map((p: any) => p?.text || "").join(" ");
    }
    return "";
  })();
  const previousAssistantHadBuildTool = messages.some(
    (m: any) => m?.role === "assistant" && JSON.stringify(m).includes("build_website"),
  );
  const websiteCueRe = /(ابني\s+(لي\s+)?(موقع|لاندنغ)|اعمل\s+(لي\s+)?موقع|بناء\s+موقع|صفحة\s+هبوط|اصنع\s+موقع|سويلي\s+موقع|build\s+(me\s+)?(a\s+)?(website|landing|portfolio|web\s+app)|create\s+(a\s+)?(website|landing|portfolio)|make\s+(me\s+)?(a\s+)?website|react\s+app)/i;
  const forceBuildWebsite = !previousAssistantHadBuildTool && websiteCueRe.test(lastUserText);
  if (forceBuildWebsite) {
    console.log("[chat-alibaba] forcing build_website tool call");
  }

  // ── Code mode (Qwen3-Coder agent) ──────────────────────────────────────
  // Honour explicit `@code` / `chatMode === 'code'` from the UI. Routes
  // the turn through Qwen3-Coder-Plus and forces the `code_agent` tool
  // (E2B Python sandbox) on the first step so we actually execute code
  // instead of returning placeholder prose.
  const requestedMode = String(
    body?.chatMode || body?.activeAgent || body?.mode || "",
  ).toLowerCase();
  const codeCueRe = /(اكتب\s+(لي\s+)?كود|اعمل\s+(لي\s+)?كود|برمج|سكربت|دالة|debug|refactor|implement|write\s+(a\s+)?(python|js|ts|sql)|fix\s+this\s+(bug|code|error))/i;
  const previousAssistantHadCodeTool = messages.some(
    (m: any) => m?.role === "assistant" && JSON.stringify(m).includes("code_agent"),
  );
  const isCodeMode =
    requestedMode === "code" ||
    requestedMode === "coding" ||
    requestedMode === "coder" ||
    requestedMode === "@code";
  const forceCodeAgent =
    !forceBuildWebsite &&
    !previousAssistantHadCodeTool &&
    (isCodeMode || (codeCueRe.test(lastUserText) && requestedMode === "code"));

  let finalModel = routed.model;
  let finalSystemPromptWithMode = finalSystemPrompt;
  if (isCodeMode) {
    // Forward to the dedicated qwen-coder-agent edge function which runs a
    // full tool loop (E2B sandbox + Storage + supabase_query + deploy webhook)
    // and streams SSE in the same OpenAI delta format the client expects.
    try {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/qwen-coder-agent`;
      const forwardHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        apikey: Deno.env.get("SUPABASE_ANON_KEY") || "",
      };
      const incomingAuth = req.headers.get("Authorization");
      if (incomingAuth) forwardHeaders.Authorization = incomingAuth;
      const upstream = await fetch(url, {
        method: "POST",
        headers: forwardHeaders,
        body: JSON.stringify({ messages, user_id: body?.user_id, conversation_id: body?.conversation_id }),
        signal: req.signal,
      });
      console.log("[chat-alibaba] code mode → forwarded to qwen-coder-agent", upstream.status);
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          ...corsHeaders,
          "Content-Type": upstream.headers.get("Content-Type") || "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } catch (e) {
      console.error("[chat-alibaba] code-mode forward failed, falling back to inline", e);
      finalModel = "qwen3-coder-plus";
      finalSystemPromptWithMode +=
        "\n\n---\n\nCODING AGENT MODE (Qwen3-Coder). Execute real code with the `code_agent` tool — never fabricate results.";
    }
  }

  return runOdysseusAgent({
    ctx: odysseusCtx,
    model: finalModel,
    systemPrompt: finalSystemPromptWithMode,
    messages,
    tools: allTools,
    signal: req.signal,
    forceFirstTool: forceBuildWebsite
      ? "build_website"
      : forceCodeAgent
        ? "code_agent"
        : undefined,
  });
});

