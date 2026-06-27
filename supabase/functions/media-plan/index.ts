/** @doc Plans a multi-step media generation pipeline before execution. */
import { corsHeaders } from "../_shared/cors.ts";
// Media Plan — analyzes a user's image/video generation prompt and returns a
// structured scene-by-scene plan that the chat UI can review before kicking
// off the actual generation jobs.
//
// Contract:
//   POST { mode: "images" | "video", prompt: string, model_slug?: string,
//          model_name?: string, scene_hint?: number }
//   →    { summary, scenes: [{ index, title, prompt, duration_seconds? }],
//          estimated_total_seconds?, notes? }

import "https://deno.land/std@0.224.0/dotenv/load.ts";



const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface PlanScene {
  index: number;
  title: string;
  prompt: string;
  duration_seconds?: number;
}

interface PlanResult {
  summary: string;
  scenes: PlanScene[];
  estimated_total_seconds?: number;
  notes?: string;
}

const SYSTEM_VIDEO = `You are a senior creative director who plans short AI-generated video pieces.
Given a user idea and a chosen model, design a coherent plan.

RULES:
- Default to EXACTLY 1 scene (a single video clip). Most users want one clip per request.
- Only return multiple scenes (2–6) if the user EXPLICITLY asks for a story / sequence / multiple scenes / "مشاهد" / "قصة" / "scenes" / "story" / numbered shots. Otherwise return 1.
- Each scene is a single continuous shot (no cuts inside a scene). No editing terms ("cut to", "split-screen", "transition").
- The scene "prompt" MUST be written in the SAME LANGUAGE the user used in their idea (Arabic → Arabic, English → English, etc.). Do NOT translate.
- The "summary" and "title" must also be in the user's language.
- duration_seconds: 4, 5, 6, 8, or 10. Default 5.
- Output STRICT JSON only, no commentary, no markdown fences.

Schema:
{
  "summary": "1 sentence in the user's language",
  "scenes": [
    { "index": 1, "title": "short label in user's language", "prompt": "vivid shot prompt in the SAME language as the user input", "duration_seconds": 5 }
  ],
  "estimated_total_seconds": 5,
  "notes": "optional"
}`;

const SYSTEM_IMAGES = `You are a senior art director who analyzes a user's image prompt before generation.
Given a user idea and a chosen model, design exactly ONE polished image prompt for the selected model.

RULES:
- Return exactly 1 scene. The product generates one image by default, not four.
- The scene "prompt" MUST be in the SAME LANGUAGE the user used. Do NOT translate.
- The "summary" and "title" must also be in the user's language.
- The scene prompt must be vivid and self-contained: subject, framing, mood, lighting, style, camera/lens when useful.
- In notes, always include this exact sentence (in the user's language if not English): "If you want me to generate this with multiple models so you can compare results, tell me and I'll do that."
- Output STRICT JSON only, no commentary, no markdown fences.

Schema:
{
  "summary": "1 concise sentence in user's language describing the final image direction",
  "scenes": [
    { "index": 1, "title": "short shot label in user's language", "prompt": "detailed shot prompt in user's language" }
  ],
  "notes": "If you want me to generate this with multiple models so you can compare results, tell me and I'll do that."
}`;

import { getDashscopeKey } from "../_shared/llm-router.ts";

async function callGateway(system: string, user: string): Promise<PlanResult> {
  const dash = await getDashscopeKey();
  if (!dash) throw new Error("no_alibaba_key: add DASHSCOPE/QWEN key in api_keys");
  // Try paid-tier model first; fall back through alternates if the key is
  // limited to free tier or that specific model's free quota is exhausted.
  const MODELS = ["qwen-plus-latest", "qwen-turbo-latest", "qwen-plus", "qwen-turbo"];
  let res: Response | null = null;
  let lastText = "";
  for (const model of MODELS) {
    res = await fetch(dash.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dash.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
      }),
    });
    if (res.ok) break;
    lastText = await res.text();
    // Retry only on free-tier exhaustion; otherwise fail fast.
    if (!/FreeTierOnly|free tier/i.test(lastText)) {
      throw new Error(`Gateway ${res.status}: ${lastText.slice(0, 400)}`);
    }
    console.warn(`[media-plan] ${model} free tier exhausted, trying next…`);
  }
  if (!res || !res.ok) {
    throw new Error(`Gateway ${res?.status ?? 0}: ${lastText.slice(0, 400)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: any;
  try {
    parsed = typeof content === "string" ? JSON.parse(content) : content;
  } catch {
    // strip code fences if the model added them
    const stripped = String(content).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    parsed = JSON.parse(stripped);
  }
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("Invalid plan: no scenes");
  }
  const scenes: PlanScene[] = parsed.scenes.slice(0, 6).map((s: any, i: number) => ({
    index: i + 1,
    title: String(s.title ?? `Scene ${i + 1}`).slice(0, 80),
    prompt: String(s.prompt ?? "").slice(0, 1200),
    duration_seconds:
      typeof s.duration_seconds === "number"
        ? Math.min(10, Math.max(3, Math.round(s.duration_seconds)))
        : undefined,
  }));
  const total = scenes.reduce((acc, s) => acc + (s.duration_seconds ?? 0), 0);
  return {
    summary: String(parsed.summary ?? "").slice(0, 600),
    scenes,
    estimated_total_seconds: total > 0 ? total : undefined,
    notes: parsed.notes ? String(parsed.notes).slice(0, 400) : undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const mode = body?.mode;
  const prompt = String(body?.prompt ?? "").trim();
  const modelName = String(body?.model_name ?? body?.model_slug ?? "AI model");
  const sceneHint = Number(body?.scene_hint) > 0 ? Math.min(6, Math.round(body.scene_hint)) : 0;

  if (mode !== "images" && mode !== "video") {
    return json({ error: "invalid_mode", message: "mode must be 'images' or 'video'" }, 400);
  }
  if (!prompt || prompt.length < 2) {
    return json({ error: "invalid_prompt" }, 400);
  }

  const system = mode === "video" ? SYSTEM_VIDEO : SYSTEM_IMAGES;
  const targetCount = sceneHint > 0 ? sceneHint : 1;
  const userMsg = [
    `User idea: ${prompt}`,
    `Chosen model: ${modelName}`,
    `REQUIRED number of ${mode === "video" ? "scenes/clips" : "images"}: ${targetCount} (return EXACTLY this many).`,
    body?.aspect_ratio ? `Aspect ratio: ${body.aspect_ratio}` : "",
    body?.duration_seconds ? `Each clip duration: ${body.duration_seconds}s` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Detect whether user explicitly requested multiple scenes/clips.
  const multiSceneRegex =
    /\b(scenes?|story|sequence|multi[- ]?scene|shots?|clips?|chapters?|montage|episode)\b|مشاهد|قصة|قصه|سيناريو|تسلسل|متعدد|مشهدين|عدة مقاطع|كذا مقطع/i;
  const numberedRegex = /\b([2-6])\s*(scenes?|shots?|clips?|videos?|مقاطع|مشاهد|فيديو)/i;
  const userWantsMulti = multiSceneRegex.test(prompt) || numberedRegex.test(prompt) || sceneHint > 1;

  try {
    const plan = await callGateway(system, userMsg);
    // Determine target scene count: prefer explicit sceneHint from settings,
    // else honor language signals, else default 1.
    const targetCount = sceneHint > 0
      ? sceneHint
      : (mode === "video" && userWantsMulti ? Math.min(6, plan.scenes.length) : 1);
    plan.scenes = plan.scenes.slice(0, targetCount).map((scene, i) => ({ ...scene, index: i + 1 }));
    // If LLM returned fewer scenes than requested, duplicate the last one to match count.
    while (plan.scenes.length < targetCount && plan.scenes.length > 0) {
      const last = plan.scenes[plan.scenes.length - 1];
      plan.scenes.push({ ...last, index: plan.scenes.length + 1, title: `${last.title} (${plan.scenes.length + 1})` });
    }
    if (mode === "images") {
      plan.notes =
        "If you want me to generate this with multiple models so you can compare results, tell me and I'll do that.";
    } else {
      plan.estimated_total_seconds = plan.scenes.reduce((acc, s) => acc + (s.duration_seconds ?? 0), 0) || undefined;
    }
    return json(plan);
  } catch (e) {
    console.error("media-plan error", e);
    const msg = e instanceof Error ? e.message : "unknown";
    if (msg.includes("429")) return json({ error: "rate_limit", message: msg }, 429);
    if (msg.includes("402")) return json({ error: "credits_exhausted", message: msg }, 402);
    return json({ error: "plan_failed", message: msg }, 500);
  }
});
