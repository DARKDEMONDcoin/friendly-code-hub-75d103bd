// Odysseus-style unified tool registry for the Megsy chat agent.
// All tool definitions + execution live here so the agent loop stays generic.
//
// First-party tools: web_search, memory_recall, memory_save, skill_lookup.
// Integrations (Pipedream apps) are deferred behind the meta-tools
// `tool_search` and `tool_invoke` to keep the model's context window light
// even when the user has connected 20+ apps.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { buildToolsForApps, resolveRequest, type ToolDef } from "../pipedream-tools.ts";
import { proxyRequest } from "../pipedream-proxy.ts";
import { embedText, toPgVector } from "../embeddings.ts";

const DASHSCOPE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";

export interface RegistryContext {
  dashscopeKey: string;
  /** All active DashScope keys (newest first) so the agent loop can rotate
   *  away from a key that hits a quota / FreeTier / 403 error mid-stream. */
  dashscopeKeys?: string[];
  /** Invalidate the chat-alibaba key cache so a freshly-rotated key is picked
   *  up on the very next request (after a 401/403). */
  invalidateKeyCache?: () => void;
  userId: string | null;
  isGuest: boolean;
  supabaseUrl: string;
  serviceRoleKey: string;
  // The end-user's Supabase JWT (Bearer …) from the original request. Some
  // downstream edge functions (e.g. openrouter-media) enforce a billing gate
  // that requires a real user JWT, so the agent's tools must forward it.
  userAuthHeader: string | null;
  connectedAccounts: Array<{
    app_slug: string;
    account_id: string;
    external_user_id: string | null;
  }>;
  integrationTools: any[]; // OpenAI-style tool schemas built from PIPEDREAM_TOOLS
  integrationByName: Map<string, ToolDef>;
  // Optional streaming progress channel. Long-running tools (build_website,
  // code_agent) call this to surface task/step updates that the frontend
  // renders as a live task list inside the assistant message.
  emitProgress?: (event: {
    tool: string;
    step: string;
    label: string;
    status: "running" | "done" | "error";
    index?: number;
    total?: number;
    detail?: string;
  }) => void;
}


export interface ExecResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

// ── First-party tool SCHEMAS (always eager) ─────────────────────────────────

export function buildFirstPartyTools(ctx: RegistryContext) {
  const tools: any[] = [
    {
      type: "function",
      function: {
        name: "web_search",
        description:
          "Search the LIVE web for fresh information you cannot know from training: news, current events, today's prices, recent releases, real-world facts after your knowledge cutoff. " +
          "DO NOT use for: greetings, math, code explanation, translation, general concepts, or anything the user is asking you to reason about rather than look up. " +
          "Returns a synthesised answer with inline numeric citations [1], [2].",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Concise search query in the user's language. Example: 'سعر iPhone 17 Pro في مصر نوفمبر 2026' — be specific about time and place.",
            },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "generate_image",
        description:
          "Generate a new AI image from a text prompt and SHOW IT IN THE CHAT. " +
          "⚠️ PREMIUM / SUBSCRIBERS ONLY: this tool requires the user to be signed in AND have an active subscription (Plus / Pro / Team). " +
          "If the user is a guest or unsubscribed, DO NOT call this tool — instead, briefly apologize in the user's language, explain it's a paid feature, and direct them to sign in / upgrade at /billing. " +
          "When eligible, call this whenever the user asks you to draw / create / design / generate / produce an image, photo, illustration, logo, poster, icon, avatar, or any visual. " +
          "DO NOT tell the user to visit another page or studio — just call this tool. " +
          "After it returns, embed the image in your reply using Markdown like ![generated](URL) so the user can see it inline. " +
          "Default to a square image unless the user specifies another aspect ratio.",
        parameters: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Detailed English prompt describing the image (subject, style, lighting, mood, composition).",
            },
            aspect_ratio: {
              type: "string",
              description: "One of: 1:1, 3:4, 4:3, 9:16, 16:9, 2:3, 3:2. Default 1:1.",
            },
          },
          required: ["prompt"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "generate_video",
        description:
          "Generate a short AI video clip from a text prompt and SHOW IT IN THE CHAT. " +
          "⚠️ PREMIUM / SUBSCRIBERS ONLY: requires the user to be signed in AND on an active paid plan (Plus / Pro / Team). " +
          "If the user is a guest or unsubscribed, DO NOT call this tool — apologize briefly, explain it's a paid feature, and point them to /billing. " +
          "When eligible, call this whenever the user asks you to create / generate / produce a video, clip, animation, or motion piece. " +
          "Returns a job_id; the chat polls it automatically. " +
          "Do NOT redirect the user to another page — just call this tool and tell them the clip is being generated.",
        parameters: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Detailed English prompt describing the scene, motion, camera, and style.",
            },
            aspect_ratio: {
              type: "string",
              description: "One of: 16:9, 9:16, 1:1, 4:3, 3:4. Default 16:9.",
            },
            duration: {
              type: "number",
              description: "Clip duration in seconds (3-8). Default 5.",
            },
          },
          required: ["prompt"],
        },
      },
    },

    {
      type: "function",
      function: {
        name: "code_agent",
        description:
          "Run Megsy's premium coding agent inside chat for app-building, debugging, repo changes, code generation, and complex programming tasks. " +
          "This is a paid feature. If unavailable, return an upgrade/setup response instead of a raw error.",
        parameters: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description: "The user's coding/build task, with requirements and constraints.",
            },
          },
          required: ["task"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "build_website",
        description:
          "Kick off an async React 18 + Vite + Tailwind website build from a user brief. " +
          "Returns INSTANTLY with {site_id, preview_url, status:'building'}. The build runs in the background (~60-120s) and the URL becomes live when ready. " +
          "Use for any 'build me a site / landing / portfolio / متجر / بناء موقع' request — do NOT paste raw HTML inline. " +
          "When the tool returns, IMMEDIATELY reply to the user with the preview_url as a clickable markdown link AND mention the site will be ready in ~1-2 minutes. Subscribers only.",
        parameters: {
          type: "object",
          properties: {
            brief: {
              type: "string",
              description: "Detailed description of the site: purpose, sections, tone, color hints, target audience. Be specific.",
            },
          },
          required: ["brief"],
        },
      },
    },
  ];


  if (!ctx.isGuest && ctx.userId) {
    tools.push(
      {
        type: "function",
        function: {
          name: "memory_recall",
          description:
            "SEMANTIC search over the user's long-term memory (facts, preferences, projects, names they shared in past chats). " +
            "Uses vector similarity, so synonyms and paraphrases match (e.g. 'شغلي' will find memories about 'work', 'job', 'startup'). " +
            "Call this when: (a) the user asks what you remember about them, (b) the current question depends on personal context you weren't told this turn, (c) you need to personalise the answer. " +
            "Returns up to 6 matching memory snippets with similarity scores.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "Natural-language description of what to recall. Examples: 'user's job and company', 'food preferences', 'ongoing projects'.",
              },
            },
            required: ["query"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "memory_save",
          description:
            "Persist ONE durable fact about the user (name, role, location, ongoing project, strong preference). " +
            "Use SPARINGLY — only when the user explicitly shares something stable about themselves that will be useful in future chats. " +
            "DO NOT save: transient questions, tasks for this turn, things they asked you to do, or your own opinions about them.",
          parameters: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Short title for the memory (≤ 80 chars). Example: 'User's job'.",
              },
              summary: {
                type: "string",
                description:
                  "The fact as a single short sentence. Example: 'Works as a frontend developer at a Cairo-based startup called Megsy.'",
              },
            },
            required: ["title", "summary"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "skill_lookup",
          description:
            "Find a system or user-defined skill whose instructions should guide your reply (e.g. coding style, writing tone, domain workflow, output format). " +
            "Call this when the user's request matches a named workflow or specialised domain. DO NOT call for ordinary chat.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "Keywords describing the kind of skill you need. Example: 'resume writing', 'react debugging'.",
              },
            },
            required: ["query"],
          },
        },
      },
    );
  }

  // Meta-tools for the deferred integration catalog.
  if (ctx.integrationTools.length > 0) {
    tools.push(
      {
        type: "function",
        function: {
          name: "tool_search",
          description:
            "Discover an external connector tool (Gmail, Slack, Notion, Calendar, etc.) by keyword. " +
            "ALWAYS call this BEFORE `tool_invoke` — you do not know the exact tool names without it. " +
            "Filter by `server` (app slug) when the user mentioned a specific service. Returns up to 12 candidate tools with their schemas.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "Keywords to match in tool name or description. Example: 'send email', 'create page'.",
              },
              server: {
                type: "string",
                description:
                  "Optional app slug to narrow the search. Examples: 'gmail', 'notion', 'slack', 'google_calendar'.",
              },
              limit: { type: "number", description: "Max results (default 6, max 12)." },
            },
            required: ["query"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "tool_invoke",
          description:
            "Execute a connector tool by its exact `name` (as returned by `tool_search`) with a JSON `arguments` object that matches that tool's schema. " +
            "Always discover the tool via `tool_search` first — guessing names will fail.",
          parameters: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Exact tool name from a prior tool_search result.",
              },
              arguments: {
                type: "object",
                description: "JSON arguments matching that tool's input_schema.",
              },
            },
            required: ["name"],
          },
        },
      },
    );
  }

  return tools;
}

// ── Execution ───────────────────────────────────────────────────────────────

export async function executeTool(
  ctx: RegistryContext,
  name: string,
  args: Record<string, any>,
): Promise<ExecResult> {
  try {
    switch (name) {
      case "web_search":
        return await execWebSearch(ctx, args);
      case "generate_image":
        return await execGenerateImage(ctx, args);
      case "generate_video":
        return await execGenerateVideo(ctx, args);
      case "code_agent":
        return await execCodeAgent(ctx, args);
      case "build_website":
        return await execBuildWebsite(ctx, args);
      case "memory_recall":
        return await execMemoryRecall(ctx, args);
      case "memory_save":
        return await execMemorySave(ctx, args);
      case "skill_lookup":
        return await execSkillLookup(ctx, args);
      case "tool_search":
        return execToolSearch(ctx, args);
      case "tool_invoke":
        return await execToolInvoke(ctx, args);
      default:
        return await execIntegration(ctx, name, args);
    }

  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// web_search → uses Qwen-plus with forced native web search as a sub-call.
async function execWebSearch(ctx: RegistryContext, args: Record<string, any>): Promise<ExecResult> {
  const query = String(args?.query || "").trim();
  if (!query) return { ok: false, error: "missing 'query'" };

  const body = {
    model: "qwen-plus",
    stream: false,
    temperature: 0.3,
    max_tokens: 1200,
    enable_search: true,
    search_options: { forced_search: true, enable_source: true, search_strategy: "standard" },
    messages: [
      {
        role: "system",
        content:
          "You are a focused web search assistant. Use live web search and return a concise answer to the user's query with inline numeric citations [1], [2]. End with a short 'Sources:' list (title — url).",
      },
      { role: "user", content: query },
    ],
  };

  const r = await fetch(DASHSCOPE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.dashscopeKey}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return { ok: false, error: `web_search upstream ${r.status}: ${t.slice(0, 200)}` };
  }
  const data = await r.json().catch(() => ({}) as any);
  const content = data?.choices?.[0]?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((p: any) => p?.text || "").join("")
        : "";
  return { ok: true, data: { answer: text.slice(0, 6000) } };
}

// ── Media generation (image + video) ──────────────────────────────────────
// These call the internal `media-image` / `media-video` edge functions which
// already handle provider routing, key rotation, and quota tracking. We use
// the service-role key so background generation works even for guest chats.

async function execGenerateImage(
  ctx: RegistryContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  const prompt = String(args?.prompt || "").trim();
  if (!prompt) return { ok: false, error: "missing 'prompt'" };
  const aspect = String(args?.aspect_ratio || "1:1").trim();

  // ── Subscriber gate (image generation is a paid feature) ─────────────
  const gate = await requireActiveSubscription(ctx, "image");
  if (gate) return gate;

  // Forward the end-user's JWT so the downstream billing gate in
  // openrouter-media can see a real user, not the service role.
  const userAuth = ctx.userAuthHeader || `Bearer ${ctx.serviceRoleKey}`;

  const r = await fetch(`${ctx.supabaseUrl}/functions/v1/media-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: userAuth,
      apikey: ctx.serviceRoleKey,
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: aspect,
      num_images: 1,
      // Default to a WaveSpeed-routed model so the user's WaveSpeed keys (from the
      // Telegram bot's `wavespeed_keys` table) are exercised. Alibaba keys are
      // currently invalid/exhausted in this workspace.
      model_slug: "qwen-image-2.0",
    }),
  });

  const data = await r.json().catch(() => ({}) as any);
  // media-image returns 200 with `{error}` body on provider failures, so
  // detect that explicitly rather than only checking the HTTP status.
  if (!r.ok || data?.error) {
    const reason = data?.details?.error || data?.message || data?.error || `image_gen_${r.status}`;
    const paywallText = JSON.stringify(data || {}) + ` ${reason}`;
    const paywall =
      r.status === 401 ||
      r.status === 402 ||
      /auth_required|free_trial_exhausted|insufficient|credit|quota|balance|invalid_token|generation_failed/i.test(paywallText);
    if (paywall) {
      return {
        ok: true,
        data: {
          paywall: true,
          feature: "image",
          message:
            "Image generation is a premium/credit feature right now. Apologize briefly, explain Plus/Pro/Team benefits, and include a clear upgrade CTA to /billing.",
          upgrade_url: "/billing",
          reason: String(reason).slice(0, 180),
        },
      };
    }
    return {
      ok: false,
      error: `image_generation_failed: ${reason}. The platform's image provider keys may be invalid or out of credit — ask the user to update the API keys in admin or try again later.`,
    };
  }
  const url: string | null =
    data?.image_url ||
    (Array.isArray(data?.image_urls) && data.image_urls[0]) ||
    null;
  if (!url) {
    return { ok: false, error: "no_image_returned" };
  }

  return {
    ok: true,
    data: {
      image_url: url,
      markdown: `![generated image](${url})`,
      note:
        "Image is ready. Embed it in your reply with: ![generated](URL). Do not tell the user to visit another studio.",
    },
  };
}

async function execGenerateVideo(
  ctx: RegistryContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  const prompt = String(args?.prompt || "").trim();
  if (!prompt) return { ok: false, error: "missing 'prompt'" };
  const aspect = String(args?.aspect_ratio || "16:9").trim();
  const duration = Number(args?.duration) > 0 ? Number(args?.duration) : 5;

  // ── Subscriber gate (video generation is a paid feature) ─────────────
  const gate = await requireActiveSubscription(ctx, "video");
  if (gate) return gate;

  const userAuth = ctx.userAuthHeader || `Bearer ${ctx.serviceRoleKey}`;

  const r = await fetch(`${ctx.supabaseUrl}/functions/v1/media-video`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: userAuth,
      apikey: ctx.serviceRoleKey,
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: aspect,
      duration,
      resolution: "720P",
      model_slug: "wan-2-7-t2v",
    }),
  });

  const data = await r.json().catch(() => ({}) as any);
  if (!r.ok || data?.error) {
    const reason = data?.message || data?.error || `video_gen_${r.status}`;
    const paywallText = JSON.stringify(data || {}) + ` ${reason}`;
    const paywall =
      r.status === 401 ||
      r.status === 402 ||
      /auth_required|free_trial_exhausted|insufficient|credit|quota|balance|invalid_token|generation_failed/i.test(paywallText);
    if (paywall) {
      return {
        ok: true,
        data: {
          paywall: true,
          feature: "video",
          message:
            "Video generation is a premium/credit feature right now. Apologize briefly, explain Plus/Pro/Team benefits, and include a clear upgrade CTA to /billing.",
          upgrade_url: "/billing",
          reason: String(reason).slice(0, 180),
        },
      };
    }
    return {
      ok: false,
      error: `video_gen_${r.status}: ${JSON.stringify(data).slice(0, 300)}`,
    };
  }
  const jobId = data?.job_id || data?.jobId;
  if (!jobId) return { ok: false, error: "no_job_id" };
  return {
    ok: true,
    data: {
      job_id: jobId,
      status: data?.status || "pending",
      note:
        "Video render started in the background. Tell the user the clip is being generated and will appear shortly. Do NOT redirect them to /media.",
    },
  };
}

async function execBuildWebsite(
  ctx: RegistryContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  const brief = String(args?.brief || "").trim();
  if (!brief) return { ok: false, error: "missing 'brief'" };
  if (!ctx.userId || ctx.isGuest) {
    return {
      ok: true,
      data: {
        paywall: true,
        feature: "website",
        message:
          "Website builder is for signed-in subscribers. Apologize briefly and add a /billing CTA explaining the plans.",
        upgrade_url: "/billing",
      },
    };
  }
  // Subscription gate (same shape as code_agent)
  const admin = adminClient(ctx);
  const { data: sub } = await admin
    .from("subscriptions")
    .select("status, plan, current_period_end")
    .eq("user_id", ctx.userId)
    .in("status", ["active", "trialing"])
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  const active = sub && (!sub.current_period_end || new Date(sub.current_period_end as string) > new Date());
  if (!active) {
    return {
      ok: true,
      data: {
        paywall: true,
        feature: "website",
        message:
          "Building production sites requires an active subscription. Apologize and link to /billing with a short plan comparison.",
        upgrade_url: "/billing",
      },
    };
  }

  try {
    const { kickoffBuildWebsite } = await import("./build-website.ts");
    const res = await kickoffBuildWebsite(
      {
        dashscopeKey: ctx.dashscopeKey,
        supabaseUrl: ctx.supabaseUrl,
        serviceRoleKey: ctx.serviceRoleKey,
        userId: ctx.userId,
        emitProgress: ctx.emitProgress
          ? (e) => ctx.emitProgress!({ tool: "build_website", ...e })
          : undefined,
      },
      brief,
    );
    return { ok: true, data: res };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: true,
      data: {
        error: msg.slice(0, 600),
        message:
          "Website build failed to start. Tell the user briefly what went wrong (one line) and offer to retry with a simpler brief.",
      },
    };
  }
}

async function execCodeAgent(
  ctx: RegistryContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  const task = String(args?.task || "").trim();
  if (!task) return { ok: false, error: "missing 'task'" };
  if (!ctx.userId || ctx.isGuest) {
    return {
      ok: true,
      data: {
        paywall: true,
        feature: "code",
        message:
          "Coding agents are available for signed-in subscribers. Apologize briefly, explain Plus/Pro/Team benefits, and include a clear upgrade CTA to /billing.",
        upgrade_url: "/billing",
      },
    };
  }

  // Subscription gate
  const admin = adminClient(ctx);
  const { data: sub } = await admin
    .from("subscriptions")
    .select("status, plan, current_period_end")
    .eq("user_id", ctx.userId)
    .in("status", ["active", "trialing"])
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  const active = sub && (!sub.current_period_end || new Date(sub.current_period_end as string) > new Date());
  if (!active) {
    return {
      ok: true,
      data: {
        paywall: true,
        feature: "code",
        message:
          "Claude Code agent requires an active subscription. Apologize briefly and explain Plus/Pro/Team differences, with a clear /billing CTA button.",
        upgrade_url: "/billing",
      },
    };
  }

  // Pick an E2B key
  const { pickE2BKey, reportE2BFailure } = await import("../e2b-keys.ts");
  const e2b = await pickE2BKey();
  if (!e2b) {
    return {
      ok: true,
      data: {
        message: "Coding sandbox is temporarily unavailable (no active E2B key). Try again shortly.",
        error: "no_e2b_key",
      },
    };
  }

  // Ask Qwen3-Coder-Plus (Alibaba's dedicated agentic coding model) for a
  // single self-contained Python script that performs the task and prints
  // results. Falls back to Claude on the Anthropic-compatible endpoint if
  // qwen3-coder is unavailable on this key.
  const planPrompt =
    `You are Megsy's autonomous coding agent powered by Qwen3-Coder, running inside an E2B Python 3 sandbox.\n` +
    `Write ONE self-contained Python 3 script that fully accomplishes the user's task end-to-end.\n` +
    `Rules:\n` +
    `- No interactive input. Print all results (and any intermediate progress) to stdout.\n` +
    `- pip install anything you need at the top: import subprocess, sys; subprocess.check_call([sys.executable,"-m","pip","install","-q","<pkg>"]).\n` +
    `- The sandbox has network access — fetch URLs, call public APIs, scrape, download files.\n` +
    `- Handle errors with try/except and print clear diagnostics.\n` +
    `- Keep it under 250 lines. Output ONLY a single fenced \`\`\`python code block — no prose.\n\n` +
    `Task:\n${task}`;

  let code = "";
  try {
    const r = await fetch(DASHSCOPE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.dashscopeKey}` },
      body: JSON.stringify({
        model: "qwen3-coder-plus",
        stream: false,
        temperature: 0.2,
        max_tokens: 4000,
        messages: [{ role: "user", content: planPrompt }],
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      // Fallback to Claude if Qwen3-Coder isn't available on this key
      const r2 = await fetch(DASHSCOPE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.dashscopeKey}` },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          stream: false,
          temperature: 0.2,
          max_tokens: 4000,
          messages: [{ role: "user", content: planPrompt }],
        }),
      });
      const j2 = await r2.json().catch(() => ({}));
      code = j2?.choices?.[0]?.message?.content || "";
    } else {
      code = j?.choices?.[0]?.message?.content || "";
    }
  } catch (e) {
    return { ok: false, error: `code_agent llm: ${e instanceof Error ? e.message : String(e)}` };
  }


  const m = code.match(/```(?:python|py)?\s*\n([\s\S]*?)```/);
  const script = (m ? m[1] : code).trim();
  if (!script) return { ok: false, error: "code_agent: empty script from model" };

  // Execute via E2B Code Interpreter REST
  let stdout = "", stderr = "", errorMsg = "";
  try {
    const { Sandbox } = await import("https://esm.sh/@e2b/code-interpreter@2.6.1");
    const sbx = await Sandbox.create({ apiKey: e2b.api_key, timeoutMs: 120_000 });
    try {
      const exec = await sbx.runCode(script, { timeoutMs: 90_000 });
      stdout = (exec.logs?.stdout || []).join("");
      stderr = (exec.logs?.stderr || []).join("");
      if (exec.error) errorMsg = `${exec.error.name}: ${exec.error.value}`;
    } finally {
      try { await sbx.kill(); } catch { /* noop */ }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const m = /\b(401|402|403|429)\b/.exec(msg);
    await reportE2BFailure(e2b.id, m ? Number(m[1]) : 500, msg);
    return {
      ok: true,
      data: {
        message: "Sandbox execution failed. The model should explain the error to the user.",
        error: msg.slice(0, 400),
        script,
      },
    };
  }

  return {
    ok: true,
    data: {
      script,
      stdout: stdout.slice(0, 8000),
      stderr: stderr.slice(0, 2000),
      error: errorMsg || null,
      summary:
        errorMsg
          ? "Script ran but raised an error — explain it to the user."
          : "Script ran successfully — summarise the stdout for the user in their language.",
    },
  };
}



function adminClient(ctx: RegistryContext) {
  return createClient(ctx.supabaseUrl, ctx.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Shared paywall gate for premium tools. Returns an ExecResult to short-circuit
// when the user is a guest or has no active subscription; returns null when the
// caller may proceed.
const FEATURE_COPY: Record<string, { signin: string; upgrade: string }> = {
  image: {
    signin:
      "Image generation is a paid feature. The user must sign in and have an active Plus / Pro / Team subscription. Apologize briefly in the user's language, explain the benefits, and include a clear /billing CTA.",
    upgrade:
      "Image generation requires an active subscription (Plus / Pro / Team). Apologize briefly and add a clear /billing CTA with a short plan comparison.",
  },
  video: {
    signin:
      "Video generation is a paid feature. The user must sign in and have an active Plus / Pro / Team subscription. Apologize briefly in the user's language and include a clear /billing CTA.",
    upgrade:
      "Video generation requires an active subscription (Plus / Pro / Team). Apologize briefly and add a clear /billing CTA.",
  },
};

async function requireActiveSubscription(
  ctx: RegistryContext,
  feature: "image" | "video",
): Promise<ExecResult | null> {
  const copy = FEATURE_COPY[feature];
  if (!ctx.userId || ctx.isGuest) {
    return {
      ok: true,
      data: {
        paywall: true,
        feature,
        message: copy.signin,
        upgrade_url: "/billing",
        requires_signin: true,
      },
    };
  }
  const admin = adminClient(ctx);
  const { data: sub } = await admin
    .from("subscriptions")
    .select("status, plan, current_period_end")
    .eq("user_id", ctx.userId)
    .in("status", ["active", "trialing"])
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  const active =
    sub && (!sub.current_period_end || new Date(sub.current_period_end as string) > new Date());
  if (!active) {
    return {
      ok: true,
      data: {
        paywall: true,
        feature,
        message: copy.upgrade,
        upgrade_url: "/billing",
      },
    };
  }
  return null;
}


async function execMemoryRecall(
  ctx: RegistryContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  if (!ctx.userId) return { ok: false, error: "auth_required" };
  const query = String(args?.query || "").trim();
  if (!query) return { ok: false, error: "missing 'query'" };

  const admin = adminClient(ctx);

  // Try semantic recall first (HNSW + cosine over DashScope embeddings).
  try {
    const vec = await embedText(query);
    if (vec) {
      const { data, error } = await admin.rpc("match_user_memories", {
        p_user_id: ctx.userId,
        p_query_embedding: toPgVector(vec) as any,
        p_match_count: 6,
        p_min_similarity: 0.25,
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        return { ok: true, data: { matches: data, mode: "semantic" } };
      }
    }
  } catch (e) {
    console.warn("[memory_recall] semantic search failed, falling back", e);
  }

  // Fallback: keyword ilike match (for memories saved before embeddings
  // were enabled, or when the query is too short to embed usefully).
  const safe = query.replace(/[%_,]/g, " ").slice(0, 80);
  const { data, error } = await admin
    .from("user_memory_entries")
    .select("title, summary, scope, created_at")
    .eq("user_id", ctx.userId)
    .or(`title.ilike.%${safe}%,summary.ilike.%${safe}%`)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { matches: data || [], mode: "keyword" } };
}

async function execMemorySave(
  ctx: RegistryContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  if (!ctx.userId) return { ok: false, error: "auth_required" };
  const title = String(args?.title || "")
    .trim()
    .slice(0, 200);
  const summary = String(args?.summary || "")
    .trim()
    .slice(0, 2000);
  if (!title || !summary) return { ok: false, error: "missing 'title' or 'summary'" };

  // Best-effort embed; if it fails we still save the row (text-only).
  let embeddingLiteral: string | null = null;
  try {
    const vec = await embedText(`${title}\n${summary}`);
    if (vec) embeddingLiteral = toPgVector(vec);
  } catch (e) {
    console.warn("[memory_save] embed failed, saving without vector", e);
  }

  const admin = adminClient(ctx);
  const row: Record<string, unknown> = {
    user_id: ctx.userId,
    title,
    summary,
    scope: "chat",
  };
  if (embeddingLiteral) row.embedding = embeddingLiteral;

  const { error } = await admin.from("user_memory_entries").insert(row);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { saved: true, embedded: !!embeddingLiteral } };
}

async function execSkillLookup(
  ctx: RegistryContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  const query = String(args?.query || "").trim();
  if (!query) return { ok: false, error: "missing 'query'" };
  const safe = query.replace(/[%_,]/g, " ").slice(0, 80);

  const admin = adminClient(ctx);
  const [sys, usr] = await Promise.all([
    admin
      .from("system_skills")
      .select("name, description, instructions")
      .eq("is_active", true)
      .or(`name.ilike.%${safe}%,description.ilike.%${safe}%,triggers.cs.{${safe}}`)
      .limit(3),
    ctx.userId
      ? admin
          .from("skills")
          .select("name, description, instructions")
          .eq("user_id", ctx.userId)
          .eq("is_active", true)
          .or(`name.ilike.%${safe}%,description.ilike.%${safe}%`)
          .limit(3)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const results = [
    ...(sys.data || []).map((s: any) => ({ source: "system", ...s })),
    ...(usr.data || []).map((s: any) => ({ source: "user", ...s })),
  ]
    .slice(0, 5)
    .map((s: any) => ({
      source: s.source,
      name: s.name,
      description: s.description,
      instructions: String(s.instructions || "").slice(0, 2500),
    }));
  return { ok: true, data: { skills: results } };
}

// tool_search → query the deferred integration catalog.
// tool_search → query the deferred integration catalog with a relevance
// score. Ranks by token overlap on name + description, biases toward the
// requested `server` (app slug), and only returns tools whose app the user
// has actually connected.
function execToolSearch(ctx: RegistryContext, args: Record<string, any>): ExecResult {
  const rawQ = String(args?.query || "")
    .toLowerCase()
    .trim();
  const server = String(args?.server || "")
    .toLowerCase()
    .trim();
  const limit = Math.min(Math.max(Number(args?.limit) || 6, 1), 12);

  const connectedSlugs = new Set(ctx.connectedAccounts.map((a) => a.app_slug.toLowerCase()));
  const qTokens = rawQ.split(/[^a-z0-9\u0600-\u06ff]+/i).filter((t) => t && t.length > 1);

  function scoreTool(t: ToolDef): number {
    const slug = t.appSlug.toLowerCase();
    if (connectedSlugs.size > 0 && !connectedSlugs.has(slug)) return -1; // not connected
    if (server && slug !== server) return -1;
    const haystackName = t.name.toLowerCase();
    const haystackDesc = (t.description || "").toLowerCase();
    let score = 0;
    if (server && slug === server) score += 3; // app match bonus
    if (!rawQ) return score; // user only filtered by server
    if (haystackName.includes(rawQ)) score += 5;
    if (haystackDesc.includes(rawQ)) score += 2;
    for (const tok of qTokens) {
      if (haystackName.includes(tok)) score += 2;
      if (haystackDesc.includes(tok)) score += 1;
    }
    return score;
  }

  const all = Array.from(ctx.integrationByName.values());
  const ranked = all
    .map((t) => ({ t, s: scoreTool(t) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ t, s }) => ({
      name: t.name,
      server: t.appSlug,
      description: t.description,
      input_schema: t.parameters,
      score: s,
    }));

  return { ok: true, data: { matches: ranked, total_candidates: all.length } };
}

async function execToolInvoke(
  ctx: RegistryContext,
  args: Record<string, any>,
): Promise<ExecResult> {
  const name = String(args?.name || "");
  const params = args?.arguments && typeof args.arguments === "object" ? args.arguments : {};
  if (!name) return { ok: false, error: "missing 'name'" };
  return await execIntegration(ctx, name, params as Record<string, any>);
}

async function execIntegration(
  ctx: RegistryContext,
  name: string,
  args: Record<string, any>,
): Promise<ExecResult> {
  const def = ctx.integrationByName.get(name);
  if (!def) return { ok: false, error: `unknown_tool:${name}` };
  if (!ctx.userId) return { ok: false, error: "auth_required" };

  const account = ctx.connectedAccounts.find((a) => a.app_slug === def.appSlug);
  if (!account) return { ok: false, error: `not_connected:${def.appSlug}` };

  const req = resolveRequest(def, args);
  const proxied = await proxyRequest({
    externalUserId: account.external_user_id || ctx.userId,
    accountId: account.account_id,
    method: req.method,
    url: req.url,
    body: req.body,
    headers: req.headers,
  });
  if (!proxied.ok)
    return {
      ok: false,
      error: `proxy_${proxied.status}: ${JSON.stringify(proxied.data).slice(0, 500)}`,
    };
  return { ok: true, data: proxied };
}

// Helper: build the integration catalog from connected accounts.
export function buildIntegrationCatalog(
  connectedAccounts: Array<{
    app_slug: string;
    account_id: string;
    external_user_id: string | null;
  }>,
  disabledSlugs: Set<string>,
) {
  const connectedSlugs = new Set(connectedAccounts.map((a) => a.app_slug));
  const built = buildToolsForApps(connectedSlugs, disabledSlugs);
  return { integrationTools: built.tools, integrationByName: built.defByName };
}
