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
Given a user idea and a chosen model, design a coherent scene-by-scene plan.

RULES:
- Reply in clean English only.
- 2–6 scenes by default. Each scene must be a single shot (no cuts inside a scene).
- Each scene gets a vivid, self-contained prompt — describe subject, environment, camera, lighting, mood.
- duration_seconds for each scene: 4, 5, 6, 8, or 10. Default 5.
- Keep the visual style and characters consistent across scenes.
- Output STRICT JSON only, no commentary, matching the schema. NO markdown fences.

Schema:
{
  "summary": "1–2 sentences in the user's language describing the overall piece",
  "scenes": [
    { "index": 1, "title": "short scene label", "prompt": "detailed shot prompt in English (models prefer EN)", "duration_seconds": 5 }
  ],
  "estimated_total_seconds": 25,
  "notes": "optional caveats"
}`;

const SYSTEM_IMAGES = `You are a senior art director who analyzes a user's image prompt before generation.
Given a user idea and a chosen model, design exactly ONE polished image prompt for the selected model.

RULES:
- Reply in clean English only.
- Return exactly 1 scene. The product generates one image by default, not four.
- The scene prompt must be vivid and self-contained: subject, framing, mood, lighting, style, camera/lens when useful.
- In notes, always include this exact sentence: "If you want me to generate this with multiple models so you can compare results, tell me and I’ll do that."
- Output STRICT JSON only, no commentary, no markdown fences.

Schema:
{
  "summary": "1 concise English sentence describing the final image direction",
  "scenes": [
    { "index": 1, "title": "short shot label", "prompt": "detailed shot prompt in English" }
  ],
  "notes": "If you want me to generate this with multiple models so you can compare results, tell me and I’ll do that."
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
  const userMsg = [
    `User idea: ${prompt}`,
    `Chosen model: ${modelName}`,
    sceneHint ? `Preferred number of ${mode === "video" ? "scenes" : "shots"}: ${sceneHint}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const plan = await callGateway(system, userMsg);
    if (mode === "images") {
      plan.scenes = plan.scenes.slice(0, 1).map((scene) => ({ ...scene, index: 1 }));
      plan.notes =
        "If you want me to generate this with multiple models so you can compare results, tell me and I’ll do that.";
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
