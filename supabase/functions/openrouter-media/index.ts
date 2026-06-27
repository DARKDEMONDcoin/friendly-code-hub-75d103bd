/** @doc Bridges Megsy media generation calls through OpenRouter providers. */
import { buildCors } from "../_shared/cors.ts";
// Unified media generation: Alibaba DashScope (Singapore) + BytePlus Ark.
// Keys are rotated from public.media_provider_keys only. Keep Alibaba/DashScope
// keys in one canonical table so newly-added keys are actually used.
// External Telegram admin bot manages keys + per-model limits in the DB.

import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { saveRemoteAsset } from "../_shared/media-storage.ts";

const corsHeaders = buildCors({ methods: "POST, GET, OPTIONS" });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
const APIFY_BASE = "https://api.apify.com/v2";

// ---------------- Apify passthrough (merged from apify-run) ----------------
async function handleApify(req: Request, body: any) {
  if (!APIFY_TOKEN) return json({ error: "Missing APIFY_TOKEN secret in Supabase." }, 500);

  // Status poll: { kind: "apify", runId: "..." }
  if (body.runId) {
    const r = await fetch(`${APIFY_BASE}/actor-runs/${body.runId}?token=${APIFY_TOKEN}`);
    const data = await r.json();
    const run = data?.data;
    let items: unknown[] = [];
    if (run?.status === "SUCCEEDED" && run.defaultDatasetId) {
      const itemsRes = await fetch(
        `${APIFY_BASE}/datasets/${run.defaultDatasetId}/items?clean=true&token=${APIFY_TOKEN}`,
      );
      items = await itemsRes.json();
    }
    return json({ status: run?.status, run, items });
  }

  const actorId = String(body.actorId || "").trim();
  if (!actorId) return json({ error: "actorId is required" }, 400);
  const input = body.input ?? {};
  const mode = body.mode ?? "sync";
  const timeoutSecs = Math.min(Math.max(body.timeoutSecs ?? 300, 30), 600);
  const idForUrl = actorId.replace("/", "~");

  if (mode === "async") {
    const r = await fetch(
      `${APIFY_BASE}/acts/${idForUrl}/runs?token=${APIFY_TOKEN}&timeout=${timeoutSecs}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
    );
    const data = await r.json();
    if (!r.ok) return json({ error: "apify_error", details: data }, r.status);
    return json({ runId: data?.data?.id, status: data?.data?.status, run: data?.data });
  }

  const r = await fetch(
    `${APIFY_BASE}/acts/${idForUrl}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=${timeoutSecs}&clean=true`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
  );
  const text = await r.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* not json */ }
  if (!r.ok) return json({ error: "apify_error", status: r.status, details: parsed }, r.status);
  return json({ items: parsed });
}

// ---------------- Model registry ----------------
type Provider = "alibaba" | "byteplus" | "vercel" | "renderful" | "wavespeed";
type Kind = "image" | "image_edit" | "video";

async function getUserFromReq(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const { data } = await admin.auth.getUser(auth.slice(7));
  return data.user ?? null;
}

function shortProjectName(prompt: string) {
  return prompt.replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 5).join(" ") || "Generated App";
}

function generatedIndex(prompt: string) {
  const title = shortProjectName(prompt);
  const description = prompt.replace(/`/g, "'").slice(0, 220);
  return `const Index = () => {
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <section className="mx-auto flex min-h-[100dvh] max-w-5xl flex-col items-center justify-center gap-8 px-6 py-20 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">Built by Megsy</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">${title}</h1>
        <p className="max-w-2xl text-lg leading-8 text-muted-foreground">${description}</p>
        <div className="grid w-full gap-4 pt-8 md:grid-cols-3">
          {['Fast launch', 'Clean design', 'Responsive'].map((item) => (
            <div key={item} className="rounded-2xl border bg-card p-6 text-left shadow-sm">
              <h2 className="text-lg font-semibold">{item}</h2>
              <p className="mt-2 text-sm text-muted-foreground">Ready to customize from this generated starting point.</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
};

export default Index;
`;
}

interface ModelDef {
  provider: Provider;
  kind: Kind;
  // For Alibaba video models, async task pattern.
  async?: boolean;
  // Vercel AI Gateway canonical model id (provider/model). Falls back to slug.
  apiId?: string;
}

const MODELS: Record<string, ModelDef> = {
  // ----- Alibaba images -----
  "qwen-image-2.0":        { provider: "alibaba", kind: "image" },
  "qwen-image-2.0-pro":    { provider: "alibaba", kind: "image" },
  "qwen-image-max":        { provider: "alibaba", kind: "image", apiId: "qwen-image-2.0-pro" },
  "qwen-image-edit-max":   { provider: "alibaba", kind: "image_edit" },
  "wan2.7-image-pro":      { provider: "alibaba", kind: "image", async: true },
  "wan2.7-image":          { provider: "alibaba", kind: "image", async: true },
  // ----- Alibaba video -----
  "wan2.7-t2v":            { provider: "alibaba", kind: "video", async: true },
  "wan2.7-i2v":            { provider: "alibaba", kind: "video", async: true },
  "wan2.7-videoedit":      { provider: "alibaba", kind: "video", async: true },
  "wan2.1-vace-plus":      { provider: "alibaba", kind: "video", async: true },
  "happyhorse-1.0-t2v":         { provider: "alibaba", kind: "video", async: true, apiId: "wan2.7-t2v" },
  "happyhorse-1.0-i2v":         { provider: "alibaba", kind: "video", async: true, apiId: "wan2.7-i2v" },
  "happyhorse-1.0-r2v":         { provider: "alibaba", kind: "video", async: true, apiId: "wan2.1-vace-plus" },
  "happyhorse-1.0-video-edit":  { provider: "alibaba", kind: "video", async: true, apiId: "wan2.7-videoedit" },
  // ----- BytePlus images (re-routed to Alibaba; BytePlus endpoints unstable) -----
  "seedream-5-0-260128":   { provider: "alibaba", kind: "image", apiId: "qwen-image-2.0-pro" },
  "seedream-4-5-251128":   { provider: "alibaba", kind: "image", apiId: "qwen-image-2.0-pro" },

  // ----- Premium image brands → WaveSpeed (https://wavespeed.ai/models) -----
  // Slugs match what the UI shows; backend hits WaveSpeed transparently.
  "flux-2-max":          { provider: "wavespeed", kind: "image",      apiId: "wavespeed-ai/flux-2-max/text-to-image" },
  "flux-2-pro":          { provider: "wavespeed", kind: "image",      apiId: "wavespeed-ai/flux-2-pro/text-to-image" },
  "flux-2-dev":          { provider: "wavespeed", kind: "image",      apiId: "wavespeed-ai/flux-2-pro/text-to-image" },
  "flux-2-flex":         { provider: "wavespeed", kind: "image",      apiId: "wavespeed-ai/flux-2-pro/text-to-image" },
  "flux-kontext-max":    { provider: "wavespeed", kind: "image_edit", apiId: "wavespeed-ai/flux-kontext-max" },
  "flux-kontext-pro":    { provider: "wavespeed", kind: "image_edit", apiId: "wavespeed-ai/flux-kontext-pro" },
  "gpt-image-2":         { provider: "wavespeed", kind: "image",      apiId: "openai/gpt-image-2/text-to-image" },
  "gpt-image-1-5":       { provider: "wavespeed", kind: "image",      apiId: "openai/gpt-image-1.5/text-to-image" },
  "gpt-image-1":         { provider: "wavespeed", kind: "image",      apiId: "openai/gpt-image-2/text-to-image" },
  "gemini-3-pro-image":  { provider: "wavespeed", kind: "image",      apiId: "google/nano-banana-pro/text-to-image" },
  "nano-banana-2":       { provider: "wavespeed", kind: "image",      apiId: "google/nano-banana-2/text-to-image" },
  "imagen-4":            { provider: "wavespeed", kind: "image",      apiId: "google/imagen4" },
  "imagen-3":            { provider: "wavespeed", kind: "image",      apiId: "google/imagen4" },
  "seedream-4.5":        { provider: "wavespeed", kind: "image",      apiId: "bytedance/seedream-v4.5" },
  "recraft-v4.1":        { provider: "wavespeed", kind: "image",      apiId: "recraft-ai/recraft-v4.1-pro/text-to-image" },

  // ----- WaveSpeed prefixed slugs (kept for direct admin/test access) -----
  "ws-gemini-3-pro-image": { provider: "wavespeed", kind: "image",      apiId: "google/nano-banana-pro/text-to-image" },
  "ws-nano-banana-2":      { provider: "wavespeed", kind: "image",      apiId: "google/nano-banana-2/text-to-image" },
  "ws-gpt-image-2":        { provider: "wavespeed", kind: "image",      apiId: "openai/gpt-image-2/text-to-image" },
  "ws-gpt-image-1-5":      { provider: "wavespeed", kind: "image",      apiId: "openai/gpt-image-1.5/text-to-image" },
  "ws-seedream-5-lite":    { provider: "wavespeed", kind: "image",      apiId: "bytedance/seedream-v5.0-lite" },
  "ws-seedream-4-5":       { provider: "wavespeed", kind: "image",      apiId: "bytedance/seedream-v4.5" },
  "ws-flux-2-max":         { provider: "wavespeed", kind: "image",      apiId: "wavespeed-ai/flux-2-max/text-to-image" },
  "ws-flux-2-pro":         { provider: "wavespeed", kind: "image",      apiId: "wavespeed-ai/flux-2-pro/text-to-image" },
  "ws-flux-kontext-max":   { provider: "wavespeed", kind: "image_edit", apiId: "wavespeed-ai/flux-kontext-max" },
  "ws-flux-kontext-pro":   { provider: "wavespeed", kind: "image_edit", apiId: "wavespeed-ai/flux-kontext-pro" },
  "ws-imagen-4-ultra":     { provider: "wavespeed", kind: "image",      apiId: "google/imagen4-ultra" },
  "ws-imagen-4":           { provider: "wavespeed", kind: "image",      apiId: "google/imagen4" },
  "ws-ideogram-v4":        { provider: "wavespeed", kind: "image",      apiId: "ideogram-ai/ideogram-v4" },
  "ws-recraft-v4-1-pro":   { provider: "wavespeed", kind: "image",      apiId: "recraft-ai/recraft-v4.1-pro/text-to-image" },
  "ws-recraft-v4-1":       { provider: "wavespeed", kind: "image",      apiId: "recraft-ai/recraft-v4.1/text-to-image" },
  "ws-grok-imagine":       { provider: "wavespeed", kind: "image",      apiId: "x-ai/grok-imagine-image-quality/text-to-image" },
  "ws-mai-image-2-5":      { provider: "wavespeed", kind: "image",      apiId: "microsoft/mai-image-2.5/text-to-image" },
  "ws-z-image":            { provider: "wavespeed", kind: "image",      apiId: "wavespeed-ai/z-image/base" },
};


// ---------------- Frontend → Backend model aliases ----------------
// Premium video brands shown in the UI (Veo, Sora, Kling, Runway, Luma, Pika,
// PixVerse, Hailuo, Firefly, Grok, Gemini Video, Seedance) are routed to
// HappyHorse / Wan on the backend.  Add new aliases here only — never expose
// these aliases in the MODELS registry.
const MODEL_ALIASES: Record<string, string> = {
  // ============================================================
  // FRONTEND DB SLUGS (image_models / video_models tables)
  // Every slug shown to the user routes here to a real backend model.
  // Names/UI stay unchanged — only the execution target is mapped.
  // ============================================================

  // ----- Images: aetherapi-tagged slugs → backend models -----
  // (flux-2-dev/flex, gpt-image-1/1.5 are now first-class MODELS entries above)
  "qwen-image":               "qwen-image-2.0",
  "gemini-2-5-flash-image":   "nano-banana-2",
  "gemini-3-1-flash-image":   "nano-banana-2",

  // ----- Images: alibaba-tagged Wan/Wanx slugs → Qwen-Image (Wan image
  //       endpoint is not available on DashScope; Qwen-Image is the real
  //       Alibaba image model and is verified working).
  "wan-2-5-t2i":              "qwen-image-2.0",
  "wanx-2-1-t2i-plus":        "qwen-image-2.0-pro",
  "wanx-2-1-t2i-turbo":       "qwen-image-2.0",
  "wanx-2-0-t2i-turbo":       "qwen-image-2.0",
  "wan2.7-image":             "qwen-image-2.0",
  "wan2.7-image-pro":         "qwen-image-2.0-pro",

  // ----- Videos: Kling 3 (UI dash-slugs) → HappyHorse -----
  "kling-3-t2v":              "happyhorse-1.0-t2v",
  "kling-3-i2v":              "happyhorse-1.0-i2v",
  // ----- Videos: Seedance / PixVerse / extra brand short-slugs -----
  "seedance-2":               "happyhorse-1.0-t2v",
  "seedance-2-0":             "happyhorse-1.0-t2v",
  "seedance-2-0-fast":        "wan2.7-t2v",
  "rb-seedance-2":            "happyhorse-1.0-t2v",
  "pixverse-6":               "wan2.7-t2v",
  // ----- Videos: HappyHorse UI slugs without 1.0 prefix -----
  "happyhorse-t2v":           "happyhorse-1.0-t2v",
  "happyhorse-i2v":           "happyhorse-1.0-i2v",
  "happyhorse-r2v":           "happyhorse-1.0-r2v",
  "happyhorse-videoedit":     "happyhorse-1.0-video-edit",
  "happyhorse-video-edit":    "happyhorse-1.0-video-edit",
  // ----- Videos: Wan 2.7 UI dash-slugs → backend dot-slugs -----
  "wan-2-7-t2v":              "wan2.7-t2v",
  "wan-2-7-i2v":              "wan2.7-i2v",
  "wan-2-7-videoedit":        "wan2.7-videoedit",
  "wan-2-7-video-edit":       "wan2.7-videoedit",
  // ----- Videos: Wan 2.5 / 2.2 / 2.1 / Wanx backup slugs -----
  "wan-2-5-t2v":              "wan2.7-t2v",
  "wan-2-5-i2v":              "wan2.7-i2v",
  "wan-2-2-t2v-plus":         "wan2.7-t2v",
  "wan-2-2-i2v-plus":         "wan2.7-i2v",
  "wan-2-1-vace-plus":        "wan2.1-vace-plus",
  "wanx-2-1-t2v-turbo":       "wan2.7-t2v",
  "wanx-2-1-t2v-plus":        "wan2.7-t2v",
  "wanx-2-1-i2v-turbo":       "wan2.7-i2v",
  "wanx-2-1-i2v-plus":        "wan2.7-i2v",
  "wanx-2-1-kf2v-plus":       "wan2.7-i2v",

  // ============================================================
  // Legacy / brand aliases (kept for backwards compatibility)
  // ============================================================
  // Veo 3.x → HappyHorse T2V
  "veo-3-1":               "happyhorse-1.0-t2v",
  "veo-3-1-fast":          "happyhorse-1.0-t2v",
  "veo-3.1":               "happyhorse-1.0-t2v",
  "veo-3.1-fast":          "happyhorse-1.0-t2v",
  "veo-3-0":               "happyhorse-1.0-t2v",
  "veo-3-0-fast":          "happyhorse-1.0-t2v",
  "veo-3":                 "happyhorse-1.0-t2v",
  // Sora 2 → HappyHorse T2V
  "sora-2":                "happyhorse-1.0-t2v",
  "sora":                  "happyhorse-1.0-t2v",
  // Kling → HappyHorse T2V / I2V
  "kling-v3-0-t2v":        "happyhorse-1.0-t2v",
  "kling-v3.0-t2v":        "happyhorse-1.0-t2v",
  "kling-v3-0-i2v":        "happyhorse-1.0-i2v",
  "kling-v3.0-i2v":        "happyhorse-1.0-i2v",
  "kling-v2-5-turbo-t2v":  "happyhorse-1.0-t2v",
  "kling-v2-5-turbo-i2v":  "happyhorse-1.0-i2v",
  "kling-3":               "happyhorse-1.0-t2v",
  // Runway Gen-4.5 → HappyHorse Video Edit
  "runway":                "happyhorse-1.0-video-edit",
  "runway-gen-4-5":        "happyhorse-1.0-video-edit",
  "runway-gen-4":          "happyhorse-1.0-video-edit",
  // Seedance → HappyHorse T2V
  "seedance-2-0":              "happyhorse-1.0-t2v",
  "seedance-2.0":              "happyhorse-1.0-t2v",
  "seedance-2-0-fast":         "happyhorse-1.0-t2v",
  "seedance-2.0-fast":         "happyhorse-1.0-t2v",
  "seedance-1-0-pro":          "happyhorse-1.0-t2v",
  "seedance-1-0-pro-250528":   "wan2.7-t2v",
  "seedance-1-0-pro-fast-251015": "wan2.7-t2v",
  "seedance-1-5-pro-251215":   "wan2.7-t2v",
  "dreamina-seedance-2-0-260128":      "happyhorse-1.0-t2v",
  "dreamina-seedance-2-0-fast-260128": "happyhorse-1.0-t2v",
  "seedance-1-0-lite-t2v":     "wan2.7-t2v",
  "seedance-1-0-lite-i2v":     "wan2.7-i2v",
  // Luma Ray → HappyHorse I2V
  "luma-ray":              "happyhorse-1.0-i2v",
  "luma-ray-3":            "happyhorse-1.0-i2v",
  "luma":                  "happyhorse-1.0-i2v",
  "ray-3":                 "happyhorse-1.0-i2v",
  // Pika 2.5 → Wan T2V
  "pika":                  "wan2.7-t2v",
  "pika-2-5":              "wan2.7-t2v",
  // PixVerse V6 → Wan T2V
  "pixverse":              "wan2.7-t2v",
  "pixverse-v6":           "wan2.7-t2v",
  "pix-verse":             "wan2.7-t2v",
  // Hailuo 2.3 → Wan I2V
  "hailuo":                "wan2.7-i2v",
  "hailuo-2-3":            "wan2.7-i2v",
  "minimax":               "wan2.7-i2v",
  // Adobe Firefly Video → HappyHorse Video Edit
  "firefly":               "happyhorse-1.0-video-edit",
  "firefly-video":         "happyhorse-1.0-video-edit",
  "adobe-firefly":         "happyhorse-1.0-video-edit",
  // Grok Video → HappyHorse T2V
  "grok":                  "happyhorse-1.0-t2v",
  "grok-video":            "happyhorse-1.0-t2v",
  // Gemini Video → HappyHorse T2V
  "gemini-video":          "happyhorse-1.0-t2v",
};

function resolveModelId(input: string): string {
  const id = (input || "").trim();
  return MODEL_ALIASES[id] ?? id;
}

const BYTEPLUS_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";
const VERCEL_BASE = "https://ai-gateway.vercel.sh/v1";
const RENDERFUL_BASE = "https://api.renderful.ai/api/v1";
const WAVESPEED_BASE = "https://api.wavespeed.ai/api/v3";
// Alibaba base URL resolver. Priority:
//   1. explicit endpoint_host on the key (e.g. "ws-xxxx.ap-southeast-1.maas.aliyuncs.com")
//   2. workspace_id pattern (Bailian / Model Studio workspace)
//   3. default international DashScope
const alibabaBase = (
  workspaceId: string | null,
  endpointHost?: string | null,
) => {
  if (endpointHost) {
    const host = endpointHost.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    return `https://${host}/api/v1`;
  }
  if (workspaceId) return `https://${workspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1`;
  return `https://dashscope-intl.aliyuncs.com/api/v1`;
};

// All known Alibaba DashScope-compatible bases, in probe order.
// Used by the auto-fallback chain when a key gets rejected as InvalidApiKey.
const ALIBABA_FALLBACK_HOSTS = [
  "dashscope-intl.aliyuncs.com",  // International (Singapore) — most common
  "dashscope.aliyuncs.com",        // China mainland
];

  

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------- Custom auth email flow ----------------
async function findUserByEmail(email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => (u.email || "").toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 200) break;
  }
  return null;
}

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function escapeHtml(value: string) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]!));
}

function otpEmail(code: string) {
  const subject = `Your Megsy verification code: ${code}`;
  const text = `Your verification code is ${code}. It expires in 10 minutes.`;
  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:480px;margin:auto;padding:32px 24px;background:#0a0a0b;color:#fff;border-radius:16px">
    <h1 style="font-size:20px;margin:0 0 8px;font-weight:600">Megsy AI</h1>
    <p style="font-size:14px;color:#a1a1aa;margin:0 0 24px">Use this code to verify your email.</p>
    <div style="font-size:34px;letter-spacing:10px;font-weight:700;text-align:center;padding:20px;background:#18181b;border-radius:12px">${code}</div>
    <p style="font-size:12px;color:#71717a;margin-top:24px">Expires in 10 minutes. If you didn't request this, ignore this email.</p>
  </div>`;
  return { subject, text, html };
}

function welcomeOfferEmail(email: string) {
  const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") || "https://megsyai.com").replace(/\/$/, "");
  const pricingUrl = `${siteUrl}/pricing`;
  const safeEmail = escapeHtml(email);
  const safePricingUrl = escapeHtml(pricingUrl);
  const subject = "Welcome to Megsy — your 50% Unlimited offer";
  const text = [
    "Welcome to Megsy AI.",
    "Your account is ready, and your limited offer is included here: 50% off Unlimited Chat, Images & Videos.",
    `Claim it here: ${pricingUrl}`,
  ].join("\n\n");
  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;padding:32px 24px;background:#0a0a0b;color:#fff;border-radius:16px">
    <p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#a1a1aa;margin:0 0 12px">Welcome to Megsy AI</p>
    <h1 style="font-size:24px;line-height:1.25;margin:0 0 12px;font-weight:700">Your account is ready.</h1>
    <p style="font-size:15px;line-height:1.7;color:#d4d4d8;margin:0 0 22px">Thanks for joining with ${safeEmail}. We added your limited welcome offer below.</p>
    <div style="border:1px solid rgba(255,255,255,.12);background:#18181b;border-radius:14px;padding:20px;margin:0 0 24px">
      <p style="font-size:13px;color:#a1a1aa;margin:0 0 6px">Limited offer</p>
      <p style="font-size:28px;line-height:1.15;font-weight:800;margin:0 0 8px">50% off Unlimited</p>
      <p style="font-size:14px;line-height:1.6;color:#d4d4d8;margin:0">Unlimited Chat, Images &amp; Videos — included with your welcome message.</p>
    </div>
    <p style="margin:0 0 22px"><a href="${safePricingUrl}" style="display:inline-block;background:#f5f1e8;color:#0a0a0b;text-decoration:none;font-size:14px;font-weight:700;padding:12px 18px;border-radius:10px">Claim the offer</a></p>
    <p style="font-size:12px;color:#71717a;margin:0">If the button does not work, open this link:<br><a href="${safePricingUrl}" style="color:#d4d4d8;word-break:break-all">${safePricingUrl}</a></p>
  </div>`;
  return { subject, text, html };
}

async function sendSmtpEmail(to: string, subject: string, html: string, text: string) {
  const host = Deno.env.get("SMTP_HOST");
  const port = Number(Deno.env.get("SMTP_PORT") || "465");
  const username = Deno.env.get("SMTP_USERNAME") || Deno.env.get("SMTP_USER");
  const password = Deno.env.get("SMTP_PASSWORD") || Deno.env.get("SMTP_PASS");
  const fromEmail = Deno.env.get("SMTP_FROM") || Deno.env.get("SMTP_FROM_EMAIL") || username;
  const fromName = Deno.env.get("SMTP_FROM_NAME") || "Megsy AI";

  if (!host || !username || !password || !fromEmail) {
    throw new Error("SMTP secrets missing: SMTP_HOST, SMTP_PORT, SMTP_USERNAME/SMTP_USER, SMTP_PASSWORD/SMTP_PASS, SMTP_FROM");
  }

  const client = new SMTPClient({
    connection: { hostname: host, port, tls: port === 465, auth: { username, password } },
  });

  try {
    await client.send({ from: `${fromName} <${fromEmail}>`, to, subject, content: text, html });
  } finally {
    try { await client.close(); } catch { /* noop */ }
  }
}

async function handleAuthFlow(body: any) {
  const action = String(body?.action || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();

  if (!action) return json({ error: "Missing action" }, 400);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Invalid email" }, 400);

  if (action === "check-email") {
    const user = await findUserByEmail(email);
    if (!user) return json({ exists: false, two_factor_enabled: false });
    const { data: profile } = await admin.from("profiles").select("two_factor_enabled").eq("id", user.id).maybeSingle();
    return json({ exists: true, two_factor_enabled: !!profile?.two_factor_enabled });
  }

  if (action === "send-otp") {
    const code = genCode();
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await admin.from("otp_codes").delete().eq("email", email);
    const { error } = await admin.from("otp_codes").insert({ email, code, expires_at, used: false });
    if (error) throw error;
    const { subject, text, html } = otpEmail(code);
    await sendSmtpEmail(email, subject, html, text);
    return json({ success: true });
  }

  if (action === "verify-otp") {
    const code = String(body?.code || "").trim();
    if (!/^\d{6}$/.test(code)) return json({ error: "Invalid code format" }, 400);
    const { data: row, error } = await admin.from("otp_codes").select("id, expires_at, used").eq("email", email).eq("code", code).maybeSingle();
    if (error) throw error;
    if (!row) return json({ success: false, error: "Invalid code" }, 400);
    if (row.used) return json({ success: false, error: "Code already used" }, 400);
    if (new Date(row.expires_at).getTime() < Date.now()) return json({ success: false, error: "Code expired" }, 400);
    await admin.from("otp_codes").update({ used: true }).eq("id", row.id);
    return json({ success: true });
  }

  if (action === "signup") {
    const password = String(body?.password || "");
    if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
    const existing = await findUserByEmail(email);
    if (existing) return json({ error: "Account already exists" }, 400);
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    try {
      const { subject, text, html } = welcomeOfferEmail(email);
      await sendSmtpEmail(email, subject, html, text);
      await admin.from("email_logs").insert({
        user_id: data.user?.id ?? null,
        to_email: email,
        subject,
        type: "welcome_offer",
        status: "sent",
      });
    } catch (welcomeErr) {
      console.error("[auth/signup] welcome offer email failed", welcomeErr);
      try {
        await admin.from("email_logs").insert({
          user_id: data.user?.id ?? null,
          to_email: email,
          subject: "Welcome to Megsy — your 50% Unlimited offer",
          type: "welcome_offer",
          status: "failed",
        });
      } catch { /* ignore logging failure */ }
    }
    return json({ success: true, user_id: data.user?.id });
  }

  if (action === "update-password") {
    const password = String(body?.password || "");
    if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
    const user = await findUserByEmail(email);
    if (!user) return json({ error: "Account not found" }, 400);
    const { error } = await admin.auth.admin.updateUserById(user.id, { password });
    if (error) throw error;
    return json({ success: true });
  }

  return json({ error: `Unknown auth action: ${action}` }, 400);
}

async function handleCheckout(req: Request, body: any) {
  const user = await getUserFromReq(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  const tier = String(body.tier || body.plan || "pro").toLowerCase();
  const interval = String(body.interval || "monthly").toLowerCase() === "yearly" ? "yearly" : "monthly";
  let productId = String(body.product_id || "").trim();
  if (!productId) {
    const { data, error } = await admin.from("dodo_products")
      .select("product_id").eq("tier", tier).eq("interval", interval).eq("active", true).maybeSingle();
    if (error) throw error;
    productId = data?.product_id || "";
  }
  if (!/^pdt_[A-Za-z0-9]+$/.test(productId)) return json({ error: "product_not_found" }, 404);
  const origin = req.headers.get("Origin") || "https://megsyai.com";
  const params = new URLSearchParams({ dodo_return: "1", plan: tier, interval, user_id: user.id, email: user.email || "" });
  const returnUrl = `${origin}/?${params.toString()}`;
  const cancelUrl = `${origin}/pricing?checkout_cancelled=1`;
  const checkoutUrl = `https://checkout.dodopayments.com/buy/${productId}?return_url=${encodeURIComponent(returnUrl)}&cancel_url=${encodeURIComponent(cancelUrl)}&email=${encodeURIComponent(user.email || "")}`;
  return json({ url: checkoutUrl, checkout_url: checkoutUrl, product_id: productId, plan: tier, interval });
}

async function handleBuildAgent(body: any) {
  const action = String(body.action || "");
  const prompt = String(body.prompt || "").trim();
  if (action !== "suggest_name") return json({ ok: false, error: "unknown_action" }, 400);
  return json({ ok: true, data: { name: shortProjectName(prompt).slice(0, 60) } });
}

async function handleCodeAgent(req: Request, body: any) {
  const user = await getUserFromReq(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  const projectId = String(body.projectId || body.project_id || "");
  const prompt = String(body.message || body.prompt || "").trim();
  if (!projectId || !prompt) return json({ error: "projectId and message are required" }, 400);
  const content = generatedIndex(prompt);
  await admin.from("ai_project_messages").insert({ project_id: projectId, role: "user", content: prompt });
  await admin.from("ai_project_files").upsert({ project_id: projectId, path: "src/pages/Index.tsx", content }, { onConflict: "project_id,path" });
  const summary = `Generated a working starter page for your request.\n\n<change action="update" path="src/pages/Index.tsx" />`;
  await admin.from("ai_project_messages").insert({ project_id: projectId, role: "assistant", content: summary });
  return json({ ok: true, summary, files: [{ path: "src/pages/Index.tsx", content }] });
}

// ---------------- Key acquisition ----------------
interface AcquiredKey {
  key_id: string;
  api_key: string;
  workspace_id: string | null;
  endpoint_host?: string | null;
}


async function acquireKey(
  provider: Provider,
  modelId: string,
  excludeKeyIds: Set<string> = new Set(),
): Promise<AcquiredKey | null> {
  // Renderful uses a single workspace secret (no rotation pool).
  if (provider === "renderful") {
    const k = Deno.env.get("RENDERFUL_API_KEY") || Deno.env.get("AETHERAPI_API_KEY");
    if (!k) return null;
    return { key_id: "env:renderful", api_key: k, workspace_id: null };
  }
  if (provider === "wavespeed") {
    // 1) Try user-supplied keys from the `wavespeed_keys` table (added via Telegram bot).
    //    Rotate by least-recently-used so all active keys get exercised.
    try {
      const { data: rows } = await admin
        .from("wavespeed_keys")
        .select("id, api_key, last_used_at, failure_count")
        .eq("status", "active")
        .order("last_used_at", { ascending: true, nullsFirst: true })
        .limit(1);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row?.api_key) {
        // Touch last_used_at so rotation moves on next call.
        admin
          .from("wavespeed_keys")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", row.id)
          .then(() => {});
        return { key_id: `ws:${row.id}`, api_key: row.api_key, workspace_id: null };
      }
    } catch (e) {
      console.error("[acquireKey] wavespeed_keys lookup failed:", e);
    }
    // 2) Fallback to the env secret.
    const k = Deno.env.get("WAVESPEED_API_KEY");
    if (!k) return null;
    return { key_id: "env:wavespeed", api_key: k, workspace_id: null };
  }
  if (provider === "alibaba") {
    try {
      let query = admin
        .from("media_provider_keys")
        .select("id, api_key, workspace_id, endpoint_host, priority, updated_at, created_at")
        .eq("provider", "alibaba")
        .eq("status", "active")
        .order("priority", { ascending: true, nullsFirst: true })
        // Prefer the most recently-added/validated key first; the retry loop
        // passes excludeKeyIds so a request still rotates through every key.
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(10);
      if (excludeKeyIds.size > 0) {
        query = query.not("id", "in", `(${Array.from(excludeKeyIds).join(",")})`);
      }
      const { data: rows, error: keyErr } = await query;
      if (keyErr) throw keyErr;
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row?.api_key) {
        // Auto-derive workspace endpoint for sk-ws-* keys when not set.
        // DashScope workspace keys (sk-ws-<ws>.<rand>...) must hit
        // ws-<ws>.<region>.maas.aliyuncs.com, not the default intl host.
        let derivedHost: string | null = row.endpoint_host ?? null;
        let derivedWs: string | null = row.workspace_id ?? null;
        if (!derivedHost && !derivedWs && typeof row.api_key === "string" && row.api_key.startsWith("sk-ws-")) {
          const wsId = row.api_key.slice("sk-ws-".length).split(".")[0];
          if (wsId) {
            derivedHost = `ws-${wsId}.ap-southeast-1.maas.aliyuncs.com`;
          }
        }
        admin.from("media_provider_keys")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", row.id)
          .then(() => {});
        return {
          key_id: row.id,
          api_key: row.api_key,
          workspace_id: derivedWs,
          endpoint_host: derivedHost,
        };
      }
    } catch (e) {
      console.error("[acquireKey] media_provider_keys lookup failed:", e);
    }
    return null;
  }

  const { data, error } = await admin.rpc("acquire_media_key", {
    p_provider: provider,
    p_model_id: modelId,
  });
  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      const keyId = row.key_id ?? row.o_key_id;
      let endpointHost: string | null = row.endpoint_host ?? row.o_endpoint_host ?? null;
      // The RPC may not return endpoint_host. For alibaba, look it up so we can
      // honor per-key custom hosts (workspace, CN, custom proxy, etc.)
      if (!endpointHost && provider === "alibaba" && typeof keyId === "string" && keyId.length === 36) {
        try {
          const { data: extra } = await admin
            .from("media_provider_keys")
            .select("endpoint_host")
            .eq("id", keyId)
            .maybeSingle();
          endpointHost = extra?.endpoint_host ?? null;
        } catch { /* non-fatal */ }
      }
      return {
        key_id: keyId,
        api_key: row.api_key ?? row.o_api_key,
        workspace_id: row.workspace_id ?? row.o_workspace_id,
        endpoint_host: endpointHost,
      };
    }
  } else {
    console.error("acquire_media_key error:", error);
  }


  // Legacy fallback for non-Alibaba providers only. Alibaba/DashScope is now
  // intentionally single-table: public.media_provider_keys.
  const services =
    provider === "byteplus" ? ["media"] : [];
  for (const svc of services) {
    const { data: poolData } = await admin.rpc("pick_api_key", { p_service: svc });
    const row = Array.isArray(poolData) ? poolData[0] : poolData;
    if (row?.api_key) {
      return { key_id: `pool:${row.id}`, api_key: row.api_key, workspace_id: null };
    }
  }
  return null;
}

async function markExhausted(keyId: string, reason: string) {
  if (keyId.startsWith("env:")) return; // env-backed single key — nothing to mark
  // Pool-backed keys are managed by record_api_key_usage; skip the
  // media_provider_keys RPC so we don't kill a perfectly good rotation key.
  if (keyId.startsWith("pool:")) {
    const id = keyId.slice(5);
    await admin.rpc("record_api_key_usage", {
      p_id: id,
      p_cost_usd: 0,
      p_ok: false,
      p_error: reason,
      p_status_code: 429,
    });
    return;
  }
  await admin.rpc("mark_media_key_exhausted", { p_key_id: keyId, p_reason: reason });
}

async function markExhaustedExt(keyId: string, reason: string) {
  if (keyId.startsWith("ws:")) {
    const id = keyId.slice(3);
    const isExhausted = /insufficient|balance|quota|payment|402|invalid_token|unauthor/i.test(reason);
    try {
      await admin
        .from("wavespeed_keys")
        .update({
          status: isExhausted ? "exhausted" : "active",
          last_error: reason.slice(0, 500),
        } as any)
        .eq("id", id);
    } catch (e) { console.error("[markExhaustedExt] ws update failed:", e); }
    return;
  }
  await markExhausted(keyId, reason);
}

async function logGeneration(p: {
  key_id?: string; provider: string; model_id: string; kind: string;
  status: "success" | "failed" | "quota_exceeded"; error_message?: string; duration_ms?: number;
}) {
  // Skip logging for pool-backed keys (key_id is not a uuid → insert would fail).
  if (p.key_id && (p.key_id.startsWith("pool:") || p.key_id.startsWith("env:") || p.key_id.startsWith("ws:"))) {
    return;
  }
  await admin.from("media_generation_log").insert(p);
}

function isQuotaError(status: number, body: any): boolean {
  if (status === 402 || status === 429) return true;
  const code = String(body?.code || body?.error?.code || "").toLowerCase();
  const msg = String(body?.message || body?.error?.message || "").toLowerCase();
  return /quota|balance|insufficient|exceed|limit/.test(code + " " + msg);
}

function isTransientRateLimit(status: number, body: any): boolean {
  const code = String(body?.code || body?.error?.code || "").toLowerCase();
  const msg = String(body?.message || body?.error?.message || "").toLowerCase();
  return status === 429 || /throttling|rate.?limit|requests rate limit/.test(`${code} ${msg}`);
}

// FreeTierOnly means the model rejected free-tier usage — the key itself is
// still valid for other models. Skip to next key for this request, but do
// not flag it as permanently exhausted.
function isFreeTierOnly(body: any): boolean {
  const code = String(body?.code || body?.error?.code || "");
  const msg = String(body?.message || body?.error?.message || "");
  return /FreeTierOnly/i.test(code) || /free tier/i.test(msg);
}

// ---------------- Health ----------------
async function healthCheck() {
  const { data: keys } = await admin
    .from("media_provider_keys")
    .select("provider, status, count:id.count()")
    .eq("status", "active");
  return json({
    ok: true,
    providers: ["alibaba", "byteplus"],
    models: Object.keys(MODELS),
    active_keys: keys ?? [],
  });
}

// ---------------- Alibaba ----------------
// Map aspect_ratio + resolution → Alibaba pixel size string for qwen-image / wan2.7-image.
function alibabaImageSize(body: any): string {
  if (body.size) return String(body.size);
  const ratio = String(body.aspect_ratio || body.ratio || "1:1");
  // qwen-image / wan2.7-image accepted sizes
  const map: Record<string, string> = {
    "1:1":  "1328*1328",
    "16:9": "1664*928",
    "9:16": "928*1664",
    "4:3":  "1472*1140",
    "3:4":  "1140*1472",
    "3:2":  "1584*1056",
    "2:3":  "1056*1584",
  };
  return map[ratio] || "1328*1328";
}

// Detect an "invalid key" upstream response that's worth retrying against a
// different host. Anything else (quota, model not found, validation) shouldn't
// trigger endpoint fallback.
function isAlibabaAuthError(status: number, data: any): boolean {
  if (status !== 401 && status !== 403) return false;
  const code = String(data?.code || data?.error?.code || "").toLowerCase();
  const msg = String(data?.message || data?.error?.message || "").toLowerCase();
  return /invalid.?api.?key|invalid_api_key|unauthor|access.?denied|invalidapikey/.test(`${code} ${msg}`);
}

// Persist the discovered working endpoint host back to the key row so future
// calls skip the probe.
async function persistEndpointHost(keyId: string, host: string) {
  if (!keyId || keyId.startsWith("env:") || keyId.startsWith("pool:") || keyId.startsWith("ws:")) return;
  try {
    await admin.from("media_provider_keys")
      .update({ endpoint_host: host, updated_at: new Date().toISOString() })
      .eq("id", keyId);
  } catch { /* non-fatal */ }
}

// Smart fetcher: tries the configured endpoint first, then falls back through
// the known Alibaba bases on auth errors. Returns the first non-auth-error
// response, and remembers the working host on the key row.
async function alibabaFetchWithFallback(
  key: AcquiredKey,
  pathAfterV1: string,
  init: RequestInit,
): Promise<{ res: Response; data: any; host: string }> {
  const tried = new Set<string>();
  const hosts: string[] = [];

  const configured = (() => {
    if (key.endpoint_host) return key.endpoint_host.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (key.workspace_id) return `${key.workspace_id}.ap-southeast-1.maas.aliyuncs.com`;
    return "dashscope-intl.aliyuncs.com";
  })();
  hosts.push(configured);
  for (const h of ALIBABA_FALLBACK_HOSTS) if (!hosts.includes(h)) hosts.push(h);
  // If the key is an sk-ws-* workspace key but has no workspace_id, the global
  // hosts will reject it. We can't guess the workspace, but we still try them.

  let lastRes!: Response;
  let lastData: any = {};
  let lastHost = configured;
  for (const host of hosts) {
    if (tried.has(host)) continue;
    tried.add(host);
    const url = `https://${host}/api/v1${pathAfterV1}`;
    const res = await fetch(url, init);
    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    lastRes = res; lastData = data; lastHost = host;
    if (res.ok) {
      if (host !== configured) await persistEndpointHost(key.key_id, host);
      return { res, data, host };
    }
    if (!isAlibabaAuthError(res.status, data)) {
      // Hard error unrelated to auth — return immediately.
      return { res, data, host };
    }
    // else: try next host
  }
  return { res: lastRes, data: lastData, host: lastHost };
}


async function callAlibabaImage(key: AcquiredKey, modelId: string, body: any) {
  // workspace_id is optional — falls back to global dashscope-intl endpoint
  const def = MODELS[modelId];
  const isEdit = def.kind === "image_edit" || (body.image || body.image_url);
  const content: any[] = [];
  if (isEdit) {
    const imgs = Array.isArray(body.images) ? body.images : [body.image || body.image_url].filter(Boolean);
    for (const url of imgs) content.push({ image: url });
  }
  if (body.prompt) content.push({ text: String(body.prompt) });

  const payload: any = {
    model: def.apiId || modelId,
    input: { messages: [{ role: "user", content }] },
    parameters: {
      size: alibabaImageSize(body),
      n: Number(body.n || 1),
      prompt_extend: body.prompt_extend !== false,
      watermark: body.watermark === true,
      ...(body.negative_prompt ? { negative_prompt: String(body.negative_prompt) } : {}),
      ...(body.seed !== undefined ? { seed: Number(body.seed) } : {}),
    },
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key.api_key}`,
  };
  if (def.async) headers["X-DashScope-Async"] = "enable";

  const { res, data } = await alibabaFetchWithFallback(
    key,
    `/services/aigc/multimodal-generation/generation`,
    { method: "POST", headers, body: JSON.stringify(payload) },
  );
  if (!res.ok) return { ok: false, status: res.status, data };


  // Sync image: result inline
  if (!def.async) {
    const items = data?.output?.choices?.[0]?.message?.content ?? [];
    const urls = items.filter((c: any) => c.image).map((c: any) => c.image);
    if (urls.length) return { ok: true, urls };
    return { ok: false, status: 502, data: { error: "no_image_in_response", raw: data } };
  }
  // Async image: task_id → poll
  const taskId = data?.output?.task_id;
  if (!taskId) return { ok: false, status: 502, data: { error: "no_task_id", raw: data } };
  return await pollAlibabaTask(key, taskId, "image");
}

async function callAlibabaVideo(key: AcquiredKey, modelId: string, body: any) {
  // Resolve UI/brand slug → real DashScope model id (e.g. happyhorse-1.0-t2v → wan2.7-t2v)
  const def = MODELS[modelId];
  // Optional per-attempt override used by the fallback chain in generate()
  const apiModel = String(body?.__apiIdOverride || def?.apiId || modelId);
  // workspace_id is optional — falls back to global dashscope-intl endpoint
  const isHappyHorse = apiModel.startsWith("happyhorse-");
  const isWan27 = apiModel.startsWith("wan2.7-");
  const isWan25 = apiModel.startsWith("wan2.5-");
  const isVace = apiModel === "wan2.1-vace-plus";



  const input: any = {};
  if (body.prompt) input.prompt = String(body.prompt);

  // wan2.7 + happyhorse use `resolution`/`ratio`/`duration`. Legacy uses `size`.
  const parameters: any = {};
  if (isWan27 || isHappyHorse) {
    parameters.resolution = String(body.resolution || "720P");
    parameters.ratio = String(body.aspect_ratio || body.ratio || "16:9");
    parameters.duration = Number(body.duration || 5);
  } else if (isWan25) {
    parameters.resolution = String(body.resolution || "720P");
    parameters.ratio = String(body.aspect_ratio || body.ratio || "16:9");
    parameters.duration = Number(body.duration || 5);
  } else {
    parameters.size = String(body.size || "1280*720");
    // Older Wan/Wanx endpoints accept a fixed duration only. Sending a custom
    // duration starts a task that later fails with "duration customization is
    // not supported", so omit it and let DashScope use the model default.
  }
  if (body.watermark !== undefined) parameters.watermark = !!body.watermark;
  if (body.seed !== undefined) parameters.seed = Number(body.seed);
  if (body.prompt_extend !== undefined) parameters.prompt_extend = !!body.prompt_extend;

  // Image inputs
  const firstFrame = body.first_frame || body.image || body.image_url || null;
  const lastFrame = body.last_frame || body.end_frame || null;
  if (isWan27 && apiModel === "wan2.7-i2v" && (firstFrame || lastFrame)) {
    // wan2.7-i2v uses media array per DashScope docs
    const media: any[] = [];
    if (firstFrame) media.push({ type: "first_frame", url: String(firstFrame) });
    if (lastFrame) media.push({ type: "last_frame", url: String(lastFrame) });
    input.media = media;
  } else {
    if (firstFrame) input.img_url = String(firstFrame);
    if (lastFrame) input.img_url_last = String(lastFrame);
  }
  if (body.audio_url) input.audio_url = String(body.audio_url);

  // HappyHorse video-edit takes media array
  if (apiModel === "happyhorse-1.0-video-edit" || apiModel === "wan2.7-videoedit") {
    const media: any[] = [];
    if (body.video_url) media.push({ type: "video", url: String(body.video_url) });
    if (Array.isArray(body.reference_images)) {
      for (const u of body.reference_images) media.push({ type: "reference_image", url: String(u) });
    }
    input.media = media;
  }

  // VACE function routing
  if (isVace) {
    input.function = String(body.function || "image_reference");
    if (body.ref_images_url) input.ref_images_url = body.ref_images_url;
    if (body.video_url) input.video_url = String(body.video_url);
    if (body.mask_image_url) input.mask_image_url = String(body.mask_image_url);
    if (body.first_clip_url) input.first_clip_url = String(body.first_clip_url);
  }

  const payload = { model: apiModel, input, parameters };
  const videoPath = (isWan27 || isWan25)
    ? `/services/aigc/video-generation/video-synthesis`
    : firstFrame
      ? `/services/aigc/image2video/video-synthesis`
      : `/services/aigc/text2video/video-synthesis`;
  const { res, data } = await alibabaFetchWithFallback(
    key,
    videoPath,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key.api_key}`,
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) return { ok: false, status: res.status, data };

  const taskId = data?.output?.task_id;
  if (!taskId) return { ok: false, status: 502, data: { error: "no_task_id", raw: data } };
  if (body.async === true) return { ok: true, jobId: `ali-${taskId}`, status: "pending", provider: "alibaba" };
  return await pollAlibabaTask(key, taskId, "video");
}

async function pollAlibabaTask(key: AcquiredKey, taskId: string, kind: "image" | "video") {
  const url = `${alibabaBase(key.workspace_id, key.endpoint_host)}/tasks/${taskId}`;
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 8000));
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key.api_key}` } });
    const data = await res.json().catch(() => ({}));
    const status = data?.output?.task_status;
    if (status === "SUCCEEDED") {
      if (kind === "video") {
        const out = data?.output ?? {};
        const results = Array.isArray(out.results) ? out.results : [];
        const u =
          out.video_url ||
          results[0]?.video_url ||
          results[0]?.url ||
          out.results?.video_url ||
          null;
        if (u) return { ok: true, url: u, jobId: taskId, raw: data };
      } else {
        const items = data?.output?.choices?.[0]?.message?.content ?? [];
        const urls = items.filter((c: any) => c.image).map((c: any) => c.image);
        if (urls.length) return { ok: true, urls, jobId: taskId, raw: data };
        const u = data?.output?.results?.[0]?.url;
        if (u) return { ok: true, urls: [u], jobId: taskId, raw: data };
      }
      return { ok: false, status: 502, data: { error: "succeeded_without_url", raw: data } };
    }
    if (status === "FAILED" || status === "CANCELED") {
      const message = data?.output?.message || data?.message || data?.error?.message;
      return { ok: false, status: 502, data: { error: message || `task_${status}`, raw: data } };
    }
    // UNKNOWN is transient right after submission — treat as pending and keep polling.
  }
  return { ok: false, status: 504, data: { error: "alibaba_timeout", jobId: taskId } };
}

// One-shot status check (non-blocking) for client polling.
async function checkAlibabaTaskOnce(key: AcquiredKey, taskId: string, kind: "image" | "video") {
  const rawTaskId = String(taskId).replace(/^ali-/, "");
  const url = `${alibabaBase(key.workspace_id, key.endpoint_host)}/tasks/${rawTaskId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key.api_key}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = data?.message || data?.error?.message || data?.code || `poll_${res.status}`;
    if (res.status === 404) return { status: "failed", error: "task_not_found", jobId: taskId, raw: data };
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { status: "failed", error, jobId: taskId, raw: data };
    }
    return { status: "pending", jobId: taskId, transient: error, raw: data };
  }
  const status = data?.output?.task_status;
  if (status === "SUCCEEDED") {
    if (kind === "video") {
      const out = data?.output ?? {};
      const results = Array.isArray(out.results) ? out.results : [];
      const u =
        out.video_url ||
        results[0]?.video_url ||
        results[0]?.url ||
        out.results?.video_url ||
        null;
      if (u) return { status: "complete", video_url: u, jobId: taskId };
    } else {
      const items = data?.output?.choices?.[0]?.message?.content ?? [];
      const urls = items.filter((c: any) => c.image).map((c: any) => c.image);
      if (urls.length) return { status: "complete", image_urls: urls, jobId: taskId };
      const u = data?.output?.results?.[0]?.url;
      if (u) return { status: "complete", image_urls: [u], jobId: taskId };
    }
    return { status: "failed", error: "succeeded_without_url" };
  }
  if (status === "FAILED" || status === "CANCELED") {
    const message = data?.output?.message || data?.message || data?.error?.message;
    return { status: "failed", error: message || `task_${status}`, raw: data };
  }
  // UNKNOWN = task just submitted, not yet visible in query → keep polling.
  return { status: "pending", jobId: taskId };
}

// ---------------- BytePlus ----------------
async function callBytePlusImage(key: AcquiredKey, modelId: string, body: any) {
  const payload: any = {
    model: modelId,
    prompt: String(body.prompt || ""),
    size: String(body.size || "2K"),
    response_format: "url",
    watermark: body.watermark === true,
  };
  if (body.image || body.image_url) payload.image = String(body.image || body.image_url);
  if (Array.isArray(body.images) && body.images.length) payload.images = body.images;
  if (body.seed !== undefined) payload.seed = Number(body.seed);

  const res = await fetch(`${BYTEPLUS_BASE}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key.api_key}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, data };
  const urls = (data?.data || []).map((x: any) => x.url).filter(Boolean);
  if (!urls.length) return { ok: false, status: 502, data: { error: "no_image_in_response", raw: data } };
  return { ok: true, urls };
}

async function callBytePlusVideo(key: AcquiredKey, modelId: string, body: any) {
  const content: any[] = [];
  if (body.prompt) content.push({ type: "text", text: String(body.prompt) });
  if (body.image || body.image_url) {
    content.push({ type: "image_url", image_url: { url: String(body.image || body.image_url) }, role: "first_frame" });
  }
  if (body.last_frame) {
    content.push({ type: "image_url", image_url: { url: String(body.last_frame) }, role: "last_frame" });
  }
  if (Array.isArray(body.reference_images)) {
    for (const u of body.reference_images) {
      content.push({ type: "image_url", image_url: { url: String(u) }, role: "reference_image" });
    }
  }
  if (body.audio_url) content.push({ type: "audio_url", audio_url: { url: String(body.audio_url) }, role: "reference_audio" });

  const payload: any = {
    model: modelId,
    content,
    resolution: String(body.resolution || "720p"),
    ratio: String(body.aspect_ratio || body.ratio || "16:9"),
    duration: Number(body.duration || 5),
    camera_fixed: body.camera_fixed === true,
    watermark: body.watermark === true,
  };
  if (body.generate_audio !== undefined) payload.generate_audio = !!body.generate_audio;
  if (body.seed !== undefined) payload.seed = Number(body.seed);

  const res = await fetch(`${BYTEPLUS_BASE}/contents/generations/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key.api_key}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, data };
  const taskId = data?.id;
  if (!taskId) return { ok: false, status: 502, data: { error: "no_task_id", raw: data } };
  if (body.async === true) return { ok: true, jobId: taskId, status: "pending", provider: "byteplus" };
  return await pollBytePlusTask(key, taskId);
}

async function pollBytePlusTask(key: AcquiredKey, taskId: string) {
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 8000));
    const res = await fetch(`${BYTEPLUS_BASE}/contents/generations/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${key.api_key}` },
    });
    const data = await res.json().catch(() => ({}));
    const status = data?.status;
    if (status === "succeeded") {
      const u = data?.content?.video_url;
      if (u) return { ok: true, url: u, jobId: taskId, raw: data };
      return { ok: false, status: 502, data: { error: "succeeded_without_url", raw: data } };
    }
    if (status === "failed" || status === "cancelled" || status === "expired") {
      return { ok: false, status: 502, data: { error: `task_${status}`, raw: data } };
    }
  }
  return { ok: false, status: 504, data: { error: "byteplus_timeout", jobId: taskId } };
}

// One-shot non-blocking status check for BytePlus video tasks.
// Used by the client poll loop via `videoStatus` so the edge function
// returns immediately instead of holding the connection open.
async function checkBytePlusTaskOnce(key: AcquiredKey, taskId: string) {
  try {
    const res = await fetch(`${BYTEPLUS_BASE}/contents/generations/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${key.api_key}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = data?.message || data?.error?.message || data?.code || `poll_${res.status}`;
      if (res.status === 404) return { status: "failed", error: "task_not_found", raw: data };
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        return { status: "failed", error, raw: data };
      }
      return { status: "pending", jobId: taskId, transient: error, raw: data };
    }
    const status = String(data?.status || "").toLowerCase();
    if (status === "succeeded") {
      const u = data?.content?.video_url;
      if (u) return { status: "complete", video_url: u, jobId: taskId };
      return { status: "failed", error: "succeeded_without_url" };
    }
    if (status === "failed" || status === "cancelled" || status === "expired") {
      return { status: "failed", error: `task_${status}`, raw: data };
    }
    return { status: "pending", jobId: taskId };
  } catch (err) {
    // Network blip — let the client retry on next poll instead of failing.
    return { status: "pending", jobId: taskId, transient: String(err) };
  }
}

// ---------------- Vercel AI Gateway ----------------
async function callVercelImage(key: AcquiredKey, modelId: string, body: any) {
  const def = MODELS[modelId];
  const apiId = def.apiId || modelId;
  const payload: any = {
    model: apiId,
    prompt: String(body.prompt || ""),
    n: Number(body.n || 1),
    size: String(body.size || "1024x1024"),
    response_format: "url",
  };
  // (legacy)
  if (body.image || body.image_url) payload.image = String(body.image || body.image_url);
  if (Array.isArray(body.images) && body.images.length) payload.images = body.images;
  if (body.quality) payload.quality = String(body.quality);
  if (body.seed !== undefined) payload.seed = Number(body.seed);

  const res = await fetch(`${VERCEL_BASE}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key.api_key}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, data };
  const items = data?.data || [];
  const urls = items.map((x: any) => x.url || (x.b64_json ? `data:image/png;base64,${x.b64_json}` : null)).filter(Boolean);
  if (!urls.length) return { ok: false, status: 502, data: { error: "no_image_in_response", raw: data } };
  return { ok: true, urls };
}

async function callVercelVideo(key: AcquiredKey, modelId: string, body: any) {
  // unchanged below
  return await _callVercelVideo(key, modelId, body);
}

// ---------------- Renderful (async POST + poll) ----------------
async function callRenderfulImage(key: AcquiredKey, modelId: string, body: any) {
  const def = MODELS[modelId];
  let apiId = def.apiId || modelId;
  const hasImage = !!(body.image || body.image_url || (Array.isArray(body.images) && body.images.length));
  const isEdit = def.kind === "image_edit" || hasImage;
  // Switch to i2i variant when there's an input image
  if (isEdit && !apiId.endsWith("-i2i") && !apiId.endsWith("-edit-sequential")) {
    apiId = `${apiId}-i2i`;
  }
  const payload: any = {
    type: isEdit ? "image-to-image" : "text-to-image",
    model: apiId,
    prompt: String(body.prompt || ""),
    num_outputs: Number(body.n || 1),
  };
  if (body.aspect_ratio || body.ratio) payload.aspect_ratio = String(body.aspect_ratio || body.ratio);
  if (body.resolution) payload.resolution = String(body.resolution);
  if (body.size && !payload.aspect_ratio) payload.size = String(body.size);
  if (body.seed !== undefined) payload.seed = Number(body.seed);
  if (body.quality) payload.quality = String(body.quality);
  const firstImg = body.image || body.image_url || (Array.isArray(body.images) ? body.images[0] : null);
  if (firstImg) {
    payload.image_url = String(firstImg);
    payload.image = String(firstImg);
  }
  if (Array.isArray(body.images) && body.images.length > 1) {
    payload.image_urls = body.images;
    payload.images = body.images;
  }

  const res = await fetch(`${RENDERFUL_BASE}/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key.api_key}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, data };
  const taskId = data?.id;
  if (!taskId) return { ok: false, status: 502, data: { error: "no_task_id", raw: data } };
  return await pollRenderfulTask(key, taskId);
}

async function pollRenderfulTask(key: AcquiredKey, taskId: string) {
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`${RENDERFUL_BASE}/generations/${taskId}`, {
      headers: { Authorization: `Bearer ${key.api_key}` },
    });
    const data = await res.json().catch(() => ({}));
    const status = String(data?.status || "").toLowerCase();
    if (status === "completed" || status === "succeeded" || status === "success") {
      const outs: string[] = Array.isArray(data?.outputs) ? data.outputs : [];
      const single = data?.output || data?.url || data?.image_url;
      const urls = outs.length ? outs : (single ? [single] : []);
      if (urls.length) return { ok: true, urls, jobId: taskId, raw: data };
      return { ok: false, status: 502, data: { error: "completed_without_url", raw: data } };
    }
    if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") {
      return { ok: false, status: 502, data: { error: data?.error || `task_${status}`, raw: data } };
    }
  }
  return { ok: false, status: 504, data: { error: "renderful_timeout", jobId: taskId } };
}

// ---------------- WaveSpeed (sync POST + poll prediction) ----------------
async function callWaveSpeedImage(key: AcquiredKey, modelId: string, body: any) {
  const def = MODELS[modelId];
  let apiId = def.apiId || modelId;
  const hasImage = !!(body.image || body.image_url || (Array.isArray(body.images) && body.images.length));
  // If user passed an image and we have a text-to-image endpoint, swap to /edit when available.
  if (hasImage && apiId.endsWith("/text-to-image")) {
    apiId = apiId.replace(/\/text-to-image$/, "/edit");
  }

  const payload: Record<string, unknown> = {
    prompt: String(body.prompt || ""),
  };
  const ar = String(body.aspect_ratio || body.ratio || "1:1");
  if (ar) payload.aspect_ratio = ar;
  // Size: WaveSpeed expects "WxH" for many models. Derive from aspect_ratio if not given.
  if (body.size) payload.size = String(body.size);
  if (body.resolution) payload.resolution = String(body.resolution).toLowerCase().replace(/px$/, "");
  if (body.seed !== undefined) payload.seed = Number(body.seed);
  if (body.n) payload.num_images = Number(body.n);
  const firstImg = body.image || body.image_url || (Array.isArray(body.images) ? body.images[0] : null);
  if (firstImg) {
    payload.image = String(firstImg);
    payload.image_url = String(firstImg);
    payload.input_image = String(firstImg);
  }
  if (Array.isArray(body.images) && body.images.length > 1) {
    payload.images = body.images;
    payload.image_urls = body.images;
  }

  const submitRes = await fetch(`${WAVESPEED_BASE}/${apiId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key.api_key}`,
    },
    body: JSON.stringify(payload),
  });
  const submitData = await submitRes.json().catch(() => ({}));
  if (!submitRes.ok) return { ok: false, status: submitRes.status, data: submitData };

  // Sync response: outputs may already be present.
  const inlineOuts: string[] = Array.isArray(submitData?.data?.outputs)
    ? submitData.data.outputs
    : Array.isArray(submitData?.outputs) ? submitData.outputs : [];
  if (inlineOuts.length) return { ok: true, urls: inlineOuts };

  const taskId: string | undefined = submitData?.data?.id || submitData?.id;
  if (!taskId) return { ok: false, status: 502, data: { error: "no_task_id", raw: submitData } };

  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(`${WAVESPEED_BASE}/predictions/${taskId}/result`, {
      headers: { Authorization: `Bearer ${key.api_key}` },
    });
    const pollData = await pollRes.json().catch(() => ({}));
    const inner = pollData?.data ?? pollData;
    const status = String(inner?.status || "").toLowerCase();
    if (status === "completed" || status === "succeeded" || status === "success") {
      const outs: string[] = Array.isArray(inner?.outputs) ? inner.outputs : [];
      if (outs.length) return { ok: true, urls: outs, jobId: taskId, raw: pollData };
      return { ok: false, status: 502, data: { error: "completed_without_url", raw: pollData } };
    }
    if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") {
      return { ok: false, status: 502, data: { error: inner?.error || `task_${status}`, raw: pollData } };
    }
  }
  return { ok: false, status: 504, data: { error: "wavespeed_timeout", jobId: taskId } };
}

async function _callVercelVideo(key: AcquiredKey, modelId: string, body: any) {
  const def = MODELS[modelId];
  const apiId = def.apiId || modelId;
  const payload: any = {
    model: apiId,
    prompt: String(body.prompt || ""),
    duration: Number(body.duration || 5),
    aspect_ratio: String(body.aspect_ratio || body.ratio || "16:9"),
    resolution: String(body.resolution || "720p"),
  };
  if (body.image || body.image_url) payload.image = String(body.image || body.image_url);
  if (body.last_frame) payload.last_frame = String(body.last_frame);
  if (body.seed !== undefined) payload.seed = Number(body.seed);
  if (body.generate_audio !== undefined) payload.generate_audio = !!body.generate_audio;

  const res = await fetch(`${VERCEL_BASE}/videos/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key.api_key}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, data };
  // Either sync url or async task id
  const inlineUrl = data?.data?.[0]?.url || data?.url || data?.video_url;
  if (inlineUrl) return { ok: true, url: inlineUrl, jobId: data?.id, raw: data };
  const taskId = data?.id || data?.task_id;
  if (!taskId) return { ok: false, status: 502, data: { error: "no_task_id", raw: data } };
  if (body.async === true) return { ok: true, jobId: `vrc-${taskId}`, status: "pending", provider: "vercel" };
  return await pollVercelTask(key, taskId);
}

async function pollVercelTask(key: AcquiredKey, taskId: string) {
  const raw = String(taskId).replace(/^vrc-/, "");
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 8000));
    const res = await fetch(`${VERCEL_BASE}/videos/generations/${raw}`, {
      headers: { Authorization: `Bearer ${key.api_key}` },
    });
    const data = await res.json().catch(() => ({}));
    const status = String(data?.status || "").toLowerCase();
    if (status === "succeeded" || status === "completed" || status === "success") {
      const u = data?.data?.[0]?.url || data?.url || data?.video_url;
      if (u) return { ok: true, url: u, jobId: `vrc-${raw}`, raw: data };
      return { ok: false, status: 502, data: { error: "succeeded_without_url", raw: data } };
    }
    if (status === "failed" || status === "error" || status === "cancelled") {
      return { ok: false, status: 502, data: { error: `task_${status}`, raw: data } };
    }
  }
  return { ok: false, status: 504, data: { error: "vercel_timeout", jobId: `vrc-${raw}` } };
}

// One-shot non-blocking status check for Vercel video tasks.
async function checkVercelTaskOnce(key: AcquiredKey, taskId: string) {
  const raw = String(taskId).replace(/^vrc-/, "");
  try {
    const res = await fetch(`${VERCEL_BASE}/videos/generations/${raw}`, {
      headers: { Authorization: `Bearer ${key.api_key}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = data?.message || data?.error?.message || data?.code || `poll_${res.status}`;
      if (res.status === 404) return { status: "failed", error: "task_not_found", raw: data };
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        return { status: "failed", error, raw: data };
      }
      return { status: "pending", jobId: `vrc-${raw}`, transient: error, raw: data };
    }
    const status = String(data?.status || "").toLowerCase();
    if (status === "succeeded" || status === "completed" || status === "success") {
      const u = data?.data?.[0]?.url || data?.url || data?.video_url;
      if (u) return { status: "complete", video_url: u, jobId: `vrc-${raw}` };
      return { status: "failed", error: "succeeded_without_url" };
    }
    if (status === "failed" || status === "error" || status === "cancelled") {
      return { status: "failed", error: `task_${status}`, raw: data };
    }
    return { status: "pending", jobId: `vrc-${raw}` };
  } catch (err) {
    return { status: "pending", jobId: `vrc-${raw}`, transient: String(err) };
  }
}

// ---------------- Billing gate (subscriber unlimited / 3-free-trials) ----------------
async function checkBillingGate(req: Request, modelId: string, provider: Provider): Promise<{ allow: boolean; reason?: string; userId?: string; isTrial?: boolean }> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return { allow: false, reason: "auth_required" };
  }
  const token = auth.slice(7);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user?.id) return { allow: false, reason: "invalid_token" };
  const userId = userData.user.id;

  // Subscriber? -> unlimited
  const { data: sub } = await admin
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId)
    .in("status", ["active", "trialing"])
    .maybeSingle();
  if (sub) return { allow: true, userId, isTrial: false };

  // Fallback truth sources: has_paid_plan RPC + profiles.plan
  // (keeps parity with the frontend useUserPlan hook, so paid users
  // are not blocked when their subscription row lives elsewhere).
  try {
    const { data: paid } = await admin.rpc("has_paid_plan", { p_user_id: userId });
    if (paid === true) return { allow: true, userId, isTrial: false };
  } catch (_) { /* ignore — fall through */ }
  try {
    const { data: prof } = await admin
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();
    const planName = String(prof?.plan || "free").toLowerCase();
    const PAID = new Set([
      "starter", "pro", "pro_plus", "elite", "business",
      "team", "enterprise", "ultimate", "premium",
    ]);
    if (PAID.has(planName)) return { allow: true, userId, isTrial: false };
  } catch (_) { /* ignore */ }

  // Free trial: 3 lifetime per provider+model
  const TRIAL_LIMIT = 3;
  const { data: trial } = await admin
    .from("free_trial_usage")
    .select("used_count")
    .eq("user_id", userId)
    .eq("provider_pool", provider)
    .eq("model_slug", modelId)
    .maybeSingle();
  const used = trial?.used_count ?? 0;
  if (used >= TRIAL_LIMIT) {
    return { allow: false, reason: "free_trial_exhausted", userId };
  }
  return { allow: true, userId, isTrial: true };
}

async function incrementTrial(userId: string, provider: Provider, modelId: string) {
  // Upsert atomically
  const { data: existing } = await admin
    .from("free_trial_usage")
    .select("id, used_count")
    .eq("user_id", userId).eq("provider_pool", provider).eq("model_slug", modelId)
    .maybeSingle();
  if (existing) {
    await admin.from("free_trial_usage")
      .update({ used_count: (existing.used_count ?? 0) + 1, last_used_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await admin.from("free_trial_usage").insert({
      user_id: userId, provider_pool: provider, model_slug: modelId, used_count: 1, last_used_at: new Date().toISOString(),
    });
  }
}

// ---------------- Telegram bots (Alibaba keys + Vercel keys) ----------------
type TgService = "alibaba" | "vercel";

async function tgSend(token: string, chatId: number, text: string, reply_markup?: any) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", reply_markup }),
  });
}

async function setTelegramPending(service: TgService, chatId: number) {
  await admin
    .from("bot_admin_pending")
    .delete()
    .eq("telegram_chat_id", chatId)
    .eq("awaiting_service", service);

  const { error } = await admin.from("bot_admin_pending").insert({
    telegram_chat_id: chatId,
    awaiting_service: service,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });

  if (error) console.error("telegram pending insert failed", { service, chatId, error });
  return !error;
}

async function isTelegramPending(service: TgService, chatId: number) {
  const { data, error } = await admin
    .from("bot_admin_pending")
    .select("telegram_chat_id")
    .eq("telegram_chat_id", chatId)
    .eq("awaiting_service", service)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) console.error("telegram pending read failed", { service, chatId, error });
  return (data?.length ?? 0) > 0;
}

async function clearTelegramPending(service: TgService, chatId: number) {
  const { error } = await admin
    .from("bot_admin_pending")
    .delete()
    .eq("telegram_chat_id", chatId)
    .eq("awaiting_service", service);
  if (error) console.error("telegram pending clear failed", { service, chatId, error });
}

async function handleTelegramBot(service: TgService, update: any) {
  const tokenEnv = service === "alibaba" ? "TELEGRAM_ALIBABA_BOT_TOKEN" : "TELEGRAM_VERCEL_BOT_TOKEN";
  const token = Deno.env.get(tokenEnv) || (service === "alibaba" ? Deno.env.get("TELEGRAM_BOT_TOKEN") : undefined);
  if (!token) return json({ ok: true, ignored: "no_bot_token" });

  const msg = update?.message ?? update?.edited_message;
  const cbq = update?.callback_query;

  // Callback: "Add Key" button -> ask for the key
  if (cbq?.data === "add_key") {
    const chatId = cbq.message?.chat?.id;
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: cbq.id }),
    });
    const prompt = service === "alibaba"
      ? [
          "📥 ابعت مفتاح علي بابا. مدعوم كل الأنواع:",
          "",
          "<b>1) DashScope عادي (الأشهر):</b>",
          "<code>sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</code>",
          "",
          "<b>2) Bailian / Model Studio Workspace:</b>",
          "<code>sk-ws-xxxx | ws-1grb6h95eqd4giad</code>",
          "(المفتاح | workspace_id)",
          "",
          "<b>3) Custom endpoint (CN / proxy / private):</b>",
          "<code>sk-xxxx | - | dashscope.aliyuncs.com</code>",
          "(المفتاح | - | endpoint_host)",
          "",
          "<b>4) كامل (الكل):</b>",
          "<code>sk-ws-xxx | ws-xxxx | ws-xxxx.ap-southeast-1.maas.aliyuncs.com</code>",
          "",
          "هنختبر المفتاح تلقائياً ضد كل الـ endpoints ونحفظ اللي شغّال ✨",
        ].join("\n")
      : "📥 Send your Vercel AI Gateway API key:\n<code>vck_xxxxxxxxxxxx</code>";

    await tgSend(token, chatId, prompt);
    // Mark this chat as awaiting key. app_kv requires project/user ids, so use
    // the dedicated Telegram pending table instead of failing silently.
    const pendingSaved = await setTelegramPending(service, chatId);
    if (!pendingSaved) {
      await tgSend(token, chatId, "❌ مش قادر أجهز استقبال المفتاح حالياً. جرّب /start مرة تانية.");
    }
    return json({ ok: true });
  }

  if (!msg?.chat?.id) return json({ ok: true, ignored: true });
  const chatId = msg.chat.id;
  const text = String(msg.text || "").trim();

  if (text === "/start" || text === "/menu") {
    const title = service === "alibaba" ? "🔑 Alibaba Keys Manager" : "🔑 Vercel Keys Manager";
    await tgSend(token, chatId,
      `${title}\n\nTap the button below to add a new API key.`,
      { inline_keyboard: [[{ text: "➕ Add Key", callback_data: "add_key" }]] },
    );
    return json({ ok: true });
  }

  // Check pending state
  const isWaiting = await isTelegramPending(service, chatId);
  if (!isWaiting) {
    await tgSend(token, chatId, "اضغط /start ثم Add Key، وبعدها ابعت المفتاح مباشرة.");
    return json({ ok: true });
  }

  // Parse key (trim whitespace/newlines that often sneak in via paste)
  let apiKey = ""; let workspaceId: string | null = null; let endpointHost: string | null = null;
  if (service === "alibaba") {
    const parts = text.split("|").map((s) => s.trim());
    apiKey = (parts[0] || "").trim();
    const wsPart = (parts[1] || "").trim();
    const hostPart = (parts[2] || "").trim();
    workspaceId = wsPart && wsPart !== "-" ? wsPart : null;
    endpointHost = hostPart && hostPart !== "-" ? hostPart.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : null;
    if (apiKey.length < 20) {
      await tgSend(token, chatId, "❌ المفتاح قصير جداً — لازم يكون مفتاح علي بابا كامل (يبدأ بـ <code>sk-</code>).");
      return json({ ok: true });
    }
  } else {
    apiKey = text.trim();
    if (apiKey.length < 10) {
      await tgSend(token, chatId, "❌ Key is too short.");
      return json({ ok: true });
    }
  }

  // Insert into media_provider_keys — the canonical table for Alibaba/media
  // provider keys. Duplicates are not blocked by DB, but
  // we check manually for a friendlier message.
  const provider = service === "alibaba" ? "alibaba" : "vercel";
  const { data: existing } = await admin
    .from("media_provider_keys")
    .select("id")
    .eq("provider", provider)
    .eq("api_key", apiKey)
    .maybeSingle();
  if (existing) {
    await clearTelegramPending(service, chatId);
    await tgSend(token, chatId, "⚠️ المفتاح ده موجود بالفعل ومسجّل عندنا.", {
      inline_keyboard: [[{ text: "➕ Add Another", callback_data: "add_key" }]],
    });
    return json({ ok: true });
  }

  // For Alibaba: probe the key against all known endpoints BEFORE saving so we
  // can store the working host and reject dead keys early.
  let probeNote = "";
  let finalHost = endpointHost;
  let finalStatus: "active" | "exhausted" = "active";
  if (service === "alibaba") {
    await tgSend(token, chatId, "🔎 جارٍ اختبار المفتاح ضد كل endpoints علي بابا...");
    const probe = await probeAlibabaKeyOnce(apiKey, { workspaceId, endpointHost });
    if (probe.ok && probe.working_host) {
      finalHost = probe.working_host;
      probeNote = `\n✅ شغّال على <code>${probe.working_host}</code> (${probe.working_mode})`;
    } else {
      finalStatus = "exhausted";
      probeNote = `\n⚠️ المفتاح اترفض من كل الـ endpoints.\n<i>${probe.hint || ""}</i>\nهتم حفظه كـ exhausted — صلّحه وأعد المحاولة.`;
    }
  }

  const { error: insErr } = await admin.from("media_provider_keys").insert({
    provider, api_key: apiKey, workspace_id: workspaceId, endpoint_host: finalHost,
    status: finalStatus, label: `tg:${chatId}`,
  });
  if (insErr) {
    await tgSend(token, chatId, `❌ فشل الحفظ: ${insErr.message}\nجرّب تاني أو ابعت /start.`);
    return json({ ok: true });
  }
  await clearTelegramPending(service, chatId);
  await tgSend(token, chatId,
    `✅ تم حفظ المفتاح!\nProvider: <b>${provider}</b>${workspaceId ? `\nWorkspace: <code>${workspaceId}</code>` : ""}${finalHost ? `\nEndpoint: <code>${finalHost}</code>` : ""}${probeNote}`,
    { inline_keyboard: [[{ text: "➕ Add Another", callback_data: "add_key" }]] },
  );
  return json({ ok: true });
}


// ---------------- Dispatcher with rotation ----------------
async function generate(kind: Kind, body: any) {
  const requestedModelId = String(body.model || "").trim();
  const modelId = resolveModelId(requestedModelId);
  if (!modelId) return json({ error: "model is required", supported: Object.keys(MODELS) }, 400);
  const def = MODELS[modelId];
  if (!def) return json({ error: `unknown model: ${modelId}`, supported: Object.keys(MODELS) }, 400);
  if (kind === "image_edit" && def.kind !== "image_edit" && def.kind !== "image") {
    return json({ error: `model ${modelId} does not support image edit` }, 400);
  }
  if (kind === "video" && def.kind !== "video") return json({ error: `model ${modelId} is not a video model` }, 400);
  if (kind === "image" && def.kind === "video") return json({ error: `model ${modelId} is a video model` }, 400);

  // Billing gate (skip for legacy callers without auth header → backward compat)
  const auth = body.__req?.headers?.get?.("Authorization") || body.__auth;
  let billing: { allow: boolean; reason?: string; userId?: string; isTrial?: boolean } = { allow: true };
  if (body.__req instanceof Request) {
    billing = await checkBillingGate(body.__req, modelId, def.provider);
    if (!billing.allow) {
      return json({ error: billing.reason || "forbidden", provider: def.provider, model: modelId }, billing.reason === "auth_required" ? 401 : 402);
    }
  }

  // ---------- Build the model-fallback chain ----------
  // When a model's free-tier or quota is exhausted on EVERY available key,
  // automatically retry the same request against a sibling video model on the
  // same provider. The user picked "happyhorse-1.0-t2v" in the UI but the real
  // DashScope model is wan2.7-t2v — if that's burnt out we transparently fall
  // through to wan2.5-t2v-preview, wan2.2-t2v-plus, wanx2.1-t2v-plus, etc.
  // This means the user gets a video as long as ANY video model has free quota.
  const ALIBABA_T2V_CHAIN = [
    "wan2.7-t2v",
    "wan2.5-t2v-preview",
    "wan2.2-t2v-plus",
    "wan2.2-t2v-flash",
  ];
  const ALIBABA_I2V_CHAIN = [
    "wan2.7-i2v",
    "wan2.5-i2v-preview",
    "wan2.2-i2v-plus",
    "wan2.2-i2v-flash",
  ];
  const ALIBABA_IMAGE_CHAIN = [
    "qwen-image-2.0-pro",
    "qwen-image-2.0",
  ];
  function buildApiIdChain(): string[] {
    const baseApiId = def.apiId || modelId;
    if (def.provider !== "alibaba") return [baseApiId];
    let pool: string[] = [];
    if (def.kind === "video") {
      pool = /i2v/i.test(baseApiId) ? ALIBABA_I2V_CHAIN : ALIBABA_T2V_CHAIN;
    } else if (def.kind === "image") {
      pool = ALIBABA_IMAGE_CHAIN;
    }
    if (!pool.length) return [baseApiId];
    // Start with the user-selected model, then the remaining siblings.
    const ordered = [baseApiId, ...pool.filter((m) => m !== baseApiId)];
    // Dedup while preserving order.
    return Array.from(new Set(ordered));
  }
  const apiIdChain = buildApiIdChain();

  const MAX_RETRIES = 5;
  let lastError: any = { error: "no_keys_available", provider: def.provider, model: modelId };
  let lastStatus = 503;
  let bestQuotaError: any = null;
  let bestQuotaStatus = 429;

  for (let chainIdx = 0; chainIdx < apiIdChain.length; chainIdx++) {
    const apiIdOverride = apiIdChain[chainIdx];
    const effectiveBody = { ...body, __apiIdOverride: apiIdOverride };
    let allKeysExhaustedForThisModel = false;
    const triedKeyIds = new Set<string>();

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const key = await acquireKey(def.provider, modelId, triedKeyIds);
      if (!key) { allKeysExhaustedForThisModel = true; break; }
      if (triedKeyIds.has(key.key_id)) { allKeysExhaustedForThisModel = true; break; }
      triedKeyIds.add(key.key_id);
      const t0 = Date.now();
      let result: any;
      try {
        if (def.provider === "alibaba") {
          result = def.kind === "video"
            ? await callAlibabaVideo(key, modelId, effectiveBody)
            : await callAlibabaImage(key, modelId, effectiveBody);
        } else if (def.provider === "byteplus") {
          result = def.kind === "video"
            ? await callBytePlusVideo(key, modelId, effectiveBody)
            : await callBytePlusImage(key, modelId, effectiveBody);
        } else if (def.provider === "renderful") {
          result = await callRenderfulImage(key, modelId, effectiveBody);
        } else if (def.provider === "wavespeed") {
          result = await callWaveSpeedImage(key, modelId, effectiveBody);
        } else {
          result = def.kind === "video"
            ? await callVercelVideo(key, modelId, effectiveBody)
            : await callVercelImage(key, modelId, effectiveBody);
        }
      } catch (err) {
        result = { ok: false, status: 500, data: { error: String(err) } };
      }
      const duration_ms = Date.now() - t0;

      if (result.ok) {
        await logGeneration({
          key_id: key.key_id, provider: def.provider, model_id: modelId,
          kind, status: "success", duration_ms,
        });
        if (billing.isTrial && billing.userId) {
          await incrementTrial(billing.userId, def.provider, modelId);
        }
        const uid = billing.userId || (await extractUserId(body.__req));
        if (uid && kind !== "video" && Array.isArray(result.urls) && result.urls.length) {
          const persisted = await Promise.all(
            result.urls.map((u: string) =>
              persistAndReplaceUrl({
                userId: uid,
                url: u,
                kind: "image",
                provider: def.provider,
                model: modelId,
                prompt: body.prompt,
              }),
            ),
          );
          result = { ...result, provider_urls: result.urls, urls: persisted };
        }
        if (uid && kind === "video" && typeof result.url === "string") {
          const persisted = await persistAndReplaceUrl({
            userId: uid,
            url: result.url,
            kind: "video",
            provider: def.provider,
            model: modelId,
            prompt: body.prompt,
            durationSeconds: body.duration,
          });
          result = { ...result, provider_url: result.url, url: persisted };
        }
        if (kind === "video" && result.jobId && uid) {
          const maxWaitMs =
            def.provider === "byteplus" ? 8 * 60_000 :
            def.provider === "vercel"   ? 9 * 60_000 :
            /* alibaba & others */        10 * 60_000;
          await admin.from("app_kv").upsert({
            key: `video_job_meta:${result.jobId}`,
            value: {
              userId: uid,
              model: modelId,
              provider: def.provider,
              keyId: key.key_id,
              prompt: body.prompt,
              duration: body.duration,
              submittedAt: Date.now(),
              maxWaitMs,
              apiId: apiIdOverride,
            } as any,
          }, { onConflict: "key" });
        }
        return json({
          ...result,
          provider: def.provider,
          model: modelId,
          api_model: apiIdOverride,
          fallback_used: chainIdx > 0,
          fallback_step: chainIdx,
          key_id: key.key_id,
          trial: billing.isTrial === true,
        });
      }

      const freeTier = isFreeTierOnly(result.data);
      const transientRateLimit = isTransientRateLimit(result.status, result.data);
      const quota = !freeTier && !transientRateLimit && isQuotaError(result.status, result.data);
      await logGeneration({
        key_id: key.key_id, provider: def.provider, model_id: modelId,
        kind, status: quota || freeTier ? "quota_exceeded" : "failed",
        error_message: `[apiId=${apiIdOverride}] ${JSON.stringify(result.data)}`.slice(0, 500),
        duration_ms,
      });
      if (quota) {
        bestQuotaError = result.data;
        bestQuotaStatus = result.status;
        await markExhaustedExt(key.key_id, `quota: ${String(result.data?.message || result.data?.error?.message || result.status)}`.slice(0, 200));
        lastError = result.data; lastStatus = result.status;
        continue; // try next key for this same apiId
      }
      if (transientRateLimit) {
        lastError = result.data; lastStatus = result.status;
        continue;
      }
      if (freeTier) {
        // This key+apiId combo can't serve free-tier. Try next key; if all
        // keys exhausted we'll fall through to the next apiId in the chain.
        bestQuotaError = result.data;
        bestQuotaStatus = result.status;
        lastError = result.data; lastStatus = result.status;
        continue;
      }
      // Non-quota error → break out of retry loop and try next apiId in chain
      // (could be a model-specific bad-request; sibling models may still work).
      lastError = result.data; lastStatus = result.status;
      allKeysExhaustedForThisModel = true;
      break;
    }

    // If keys ran out OR we broke out due to non-quota error, try next apiId.
    if (allKeysExhaustedForThisModel) continue;
    // Otherwise we used up MAX_RETRIES retries on quota/free-tier → next apiId.
  }

  return json({
    error: "all_models_exhausted",
    provider: def.provider,
    model: modelId,
    tried_api_ids: apiIdChain,
    last_error: bestQuotaError || lastError,
  }, bestQuotaError ? bestQuotaStatus : lastStatus);
}

async function videoStatus(body: any) {
  const jobId = body.jobId || body.job_id;
  if (!jobId) return json({ error: "jobId required" }, 400);
  let userId: string | null = body.__userId || (await extractUserId(body.__req));
  let meta: { model?: string; prompt?: string; duration?: number; keyId?: string; submittedAt?: number; maxWaitMs?: number } = body.__meta || {};
  // Look up stashed meta from the original submit so we can persist on completion.
  try {
    const { data: kv } = await admin.from("app_kv")
      .select("value").eq("key", `video_job_meta:${jobId}`).maybeSingle();
    const v = (kv?.value || {}) as any;
    if (!userId && v.userId) userId = v.userId;
    if (!meta.model && v.model) meta = { ...meta, model: v.model };
    if (!meta.prompt && v.prompt) meta = { ...meta, prompt: v.prompt };
    if (!meta.duration && v.duration) meta = { ...meta, duration: v.duration };
    if (!meta.keyId && v.keyId) meta = { ...meta, keyId: v.keyId };
    if (!meta.submittedAt && v.submittedAt) meta = { ...meta, submittedAt: v.submittedAt };
    if (!meta.maxWaitMs && v.maxWaitMs) meta = { ...meta, maxWaitMs: v.maxWaitMs };
  } catch { /* best-effort */ }
  // Hard timeout: if the job has been pending longer than maxWaitMs, fail it
  // explicitly so the UI stops spinning forever on a wedged provider.
  if (meta.submittedAt && meta.maxWaitMs && Date.now() - meta.submittedAt > meta.maxWaitMs) {
    return json({ status: "failed", error: "task_timeout", jobId });
  }
  // IMPORTANT: every branch below MUST be non-blocking (one HTTP request,
  // no internal polling loop) — the client owns the poll loop. Otherwise
  // the edge function holds the connection open and the gateway / browser
  // times out, which surfaces to the user as "video timed out".
  try {
    // Prefer the exact API key that created the task. Provider task IDs are
    // scoped to their API key/region; polling with a different "active" key
    // often returns 404/unauthorized, which previously looked like endless
    // pending in the UI.
    const pollKeysFor = async (provider: Provider): Promise<AcquiredKey[]> => {
      const keys: AcquiredKey[] = [];
      const seen = new Set<string>();
      const push = (key: AcquiredKey | null | undefined) => {
        if (!key?.api_key || seen.has(key.api_key)) return;
        seen.add(key.api_key);
        keys.push(key);
      };

      if (meta.keyId?.startsWith("pool:")) {
        const { data } = await admin.from("api_keys")
          .select("id, api_key").eq("id", meta.keyId.slice(5)).maybeSingle();
        if (data) push({ key_id: `pool:${data.id}`, api_key: data.api_key, workspace_id: null });
      } else if (meta.keyId && !meta.keyId.startsWith("env:")) {
        const { data } = await admin.from("media_provider_keys")
          .select("id, api_key, workspace_id, endpoint_host").eq("id", meta.keyId).maybeSingle();
        if (data) push({ key_id: data.id, api_key: data.api_key, workspace_id: data.workspace_id, endpoint_host: data.endpoint_host });
      }

      // Try provider-specific keys (with endpoint_host) FIRST — those are
      // the most likely to recognize the task. Pool keys (no endpoint_host)
      // get tried as a last resort, since DashScope's default region often
      // responds with `task_status: UNKNOWN` for tasks created on a
      // workspace endpoint, which our poll loop would otherwise treat as
      // "still pending" forever.
      const { data: providerKeys } = await admin.from("media_provider_keys")
        .select("id, api_key, workspace_id, endpoint_host").eq("provider", provider)
        .in("status", ["active", "exhausted"]).limit(10);
      for (const k of providerKeys || []) {
        push({ key_id: k.id, api_key: k.api_key, workspace_id: k.workspace_id, endpoint_host: k.endpoint_host });
      }

      if (provider === "byteplus") {
        const services = provider === "alibaba" ? ["alibaba", "media"] : ["media"];
        const { data: poolKeys } = await admin.from("api_keys")
          .select("id, api_key, service").in("service", services)
          .eq("is_active", true).eq("is_blocked", false).limit(10);
        for (const k of poolKeys || []) {
          push({ key_id: `pool:${k.id}`, api_key: k.api_key, workspace_id: null });
        }
      }

      return keys;
    };

    // Vercel jobs prefixed with vrc-
    if (String(jobId).startsWith("vrc-")) {
      const keys = await pollKeysFor("vercel");
      for (const key of keys) {
        const r = await checkVercelTaskOnce(key, jobId);
        if (r?.status === "failed" && r?.error === "task_not_found") continue;
        return json(await maybePersistVideo(r, userId, "vercel", meta));
      }
      return json({ status: "failed", error: "provider_key_missing_or_task_not_found", jobId });
    }
    // BytePlus task IDs start with cgt-
    if (String(jobId).startsWith("cgt-")) {
      const keys = await pollKeysFor("byteplus");
      for (const key of keys) {
        const r = await checkBytePlusTaskOnce(key, jobId);
        if (r?.status === "failed" && r?.error === "task_not_found") continue;
        return json(await maybePersistVideo(r, userId, "byteplus", meta));
      }
      return json({ status: "failed", error: "provider_key_missing_or_task_not_found", jobId });
    }
    // Alibaba: workspace_id optional. Try all keys — the first one that
    // returns a definitive answer wins. "task_not_found" (wrong region) or
    // a transient/UNKNOWN status from the wrong key shouldn't end the loop;
    // those just mean "try the next key".
    const keys = await pollKeysFor("alibaba");
    let lastPending: any = null;
    for (const key of keys) {
      const r = await checkAlibabaTaskOnce(key, jobId, "video");
      if (r?.status === "complete") {
        return json(await maybePersistVideo(r, userId, "alibaba", meta));
      }
      if (r?.status === "failed" && r?.error === "task_not_found") continue;
      if (r?.status === "pending") {
        // Wrong key against wrong region returns UNKNOWN — keep trying.
        lastPending = r;
        continue;
      }
      // Definitive failure (auth/quota/etc.) — surface immediately.
      return json(await maybePersistVideo(r, userId, "alibaba", meta));
    }
    if (lastPending) return json(lastPending);
    return json({ status: "failed", error: "provider_key_missing_or_task_not_found", jobId });
  } catch (err) {
    // Never surface a hard error to the client poll loop — treat transient
    // failures as "still pending" so the client retries on the next tick.
    return json({
      status: "pending",
      transient: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------- Permanent storage helpers ----------------
// Provider URLs (DashScope, BytePlus, Vercel) expire within 24h. We download
// the result and re-host it in our `media-studio` bucket so gallery links
// and user-shared URLs stay alive forever. Best-effort: on any failure we
// fall back to the original provider URL so the user still gets a result.

async function extractUserId(req: Request | undefined): Promise<string | null> {
  try {
    if (!req) return null;
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return null;
    const token = auth.slice(7);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims } = await userClient.auth.getClaims(token);
    return (claims?.claims?.sub as string) || null;
  } catch {
    return null;
  }
}

async function persistAndReplaceUrl(opts: {
  userId: string | null;
  url: string;
  kind: "image" | "video";
  provider: string;
  model: string;
  prompt?: string;
  durationSeconds?: number;
}): Promise<string> {
  if (!opts.userId || !opts.url) return opts.url;
  try {
    const saved = await saveRemoteAsset({
      admin,
      userId: opts.userId,
      remoteUrl: opts.url,
      kind: opts.kind,
      provider: opts.provider,
      model: opts.model,
      prompt: opts.prompt,
      costCredits: 0,
      durationSeconds: opts.durationSeconds,
    });
    return saved?.public_url || opts.url;
  } catch (err) {
    console.error("persistAndReplaceUrl failed:", err);
    return opts.url;
  }
}

async function maybePersistVideo(
  r: any,
  userId: string | null,
  provider: string,
  meta: { model?: string; prompt?: string; duration?: number },
) {
  if (r?.status !== "complete" || !r?.video_url) return r;
  const permanent = await persistAndReplaceUrl({
    userId,
    url: r.video_url,
    kind: "video",
    provider,
    model: meta.model || "unknown",
    prompt: meta.prompt,
    durationSeconds: meta.duration,
  });
  return { ...r, video_url: permanent, provider_url: r.video_url };
}

// ---------------- Alibaba key probe / validator ----------------
// Tests an Alibaba key against every known endpoint shape and reports which
// (if any) accepts it. Optionally persists endpoint_host + status back to the
// matching media_provider_keys row.
async function probeAlibabaKeyOnce(apiKey: string, opts: { workspaceId?: string | null; endpointHost?: string | null } = {}): Promise<{
  ok: boolean;
  working_host?: string;
  working_mode?: "dashscope" | "openai_compat";
  tried: Array<{ host: string; mode: string; status: number; code?: string; message?: string }>;
  hint?: string;
}> {
  const tried: Array<{ host: string; mode: string; status: number; code?: string; message?: string }> = [];
  const hosts: string[] = [];
  if (opts.endpointHost) hosts.push(opts.endpointHost.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
  if (opts.workspaceId) hosts.push(`${opts.workspaceId}.ap-southeast-1.maas.aliyuncs.com`);
  for (const h of ALIBABA_FALLBACK_HOSTS) if (!hosts.includes(h)) hosts.push(h);

  const probeBody = JSON.stringify({
    model: "qwen-turbo",
    input: { messages: [{ role: "user", content: "ping" }] },
    parameters: { max_tokens: 1 },
  });
  const compatBody = JSON.stringify({
    model: "qwen-turbo",
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 1,
  });

  for (const host of hosts) {
    // 1) Native DashScope shape
    try {
      const r = await fetch(`https://${host}/api/v1/services/aigc/text-generation/generation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: probeBody,
      });
      const d = await r.json().catch(() => ({} as any));
      tried.push({ host, mode: "dashscope", status: r.status, code: d?.code, message: d?.message });
      if (r.ok || (r.status >= 200 && r.status < 500 && !isAlibabaAuthError(r.status, d) && d?.code !== "InvalidApiKey")) {
        if (r.ok || !/invalid.?api.?key/i.test(`${d?.code} ${d?.message}`)) {
          return { ok: true, working_host: host, working_mode: "dashscope", tried };
        }
      }
    } catch (e) {
      tried.push({ host, mode: "dashscope", status: 0, message: String(e) });
    }
    // 2) OpenAI-compatible shape
    try {
      const r = await fetch(`https://${host}/compatible-mode/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: compatBody,
      });
      const d = await r.json().catch(() => ({} as any));
      const code = d?.error?.code || d?.code;
      const msg = d?.error?.message || d?.message;
      tried.push({ host, mode: "openai_compat", status: r.status, code, message: msg });
      if (r.ok || (r.status < 500 && !/invalid.?api.?key/i.test(`${code} ${msg}`))) {
        if (r.ok || !/invalid.?api.?key/i.test(`${code} ${msg}`)) {
          return { ok: true, working_host: host, working_mode: "openai_compat", tried };
        }
      }
    } catch (e) {
      tried.push({ host, mode: "openai_compat", status: 0, message: String(e) });
    }
  }

  // No host accepted the key. Build a helpful hint based on key shape.
  let hint = "Alibaba rejected the key on every known endpoint — it's revoked, expired, or from a different platform.";
  if (apiKey.startsWith("sk-ws-")) {
    hint = "sk-ws-* keys are workspace-scoped. They only work on https://ws-XXXX.<region>.maas.aliyuncs.com — provide the workspace_id or endpoint_host.";
  } else if (apiKey.startsWith("sk-sp-")) {
    hint = "sk-sp-* keys are Token-Plan keys for Claude Code / Anthropic-compat endpoints, not DashScope generation. They won't work here.";
  } else if (!/^sk-[a-z0-9]{20,60}$/i.test(apiKey)) {
    hint = "Key doesn't match the standard DashScope shape (sk-xxxxxxxxxxxxxxxxxxxx). Verify it's a Model Studio / DashScope API key.";
  }
  return { ok: false, tried, hint };
}

async function probeAlibabaKey(body: any) {
  const apiKey = String(body.api_key || "").trim();
  if (!apiKey) return json({ error: "api_key required" }, 400);
  const keyId = body.key_id ? String(body.key_id) : null;
  const result = await probeAlibabaKeyOnce(apiKey, {
    workspaceId: body.workspace_id || null,
    endpointHost: body.endpoint_host || null,
  });
  // Persist outcome back to the row (if any).
  if (keyId && keyId.length === 36) {
    if (result.ok && result.working_host) {
      await admin.from("media_provider_keys")
        .update({ endpoint_host: result.working_host, status: "active", notes: `probe ok (${result.working_mode}) @ ${new Date().toISOString()}` })
        .eq("id", keyId);
    } else {
      await admin.from("media_provider_keys")
        .update({ status: "exhausted", notes: `probe failed: ${result.hint || "rejected on all hosts"} @ ${new Date().toISOString()}` })
        .eq("id", keyId);
    }
  }
  return json(result);
}

async function validateAllAlibabaKeys() {
  const { data: rows } = await admin
    .from("media_provider_keys")
    .select("id, api_key, workspace_id, endpoint_host, status")
    .eq("provider", "alibaba");
  const results: any[] = [];
  for (const row of rows ?? []) {
    const r = await probeAlibabaKeyOnce(row.api_key, { workspaceId: row.workspace_id, endpointHost: row.endpoint_host });
    if (r.ok && r.working_host) {
      await admin.from("media_provider_keys")
        .update({ endpoint_host: r.working_host, status: "active", notes: `auto-validated (${r.working_mode})` })
        .eq("id", row.id);
    } else if (row.status !== "exhausted") {
      await admin.from("media_provider_keys")
        .update({ status: "exhausted", notes: `auto-invalidated: ${r.hint || "rejected"}` })
        .eq("id", row.id);
    }
    results.push({ id: row.id, prefix: row.api_key.slice(0, 14) + "…", ok: r.ok, host: r.working_host, mode: r.working_mode, hint: r.hint });
  }
  return json({ count: results.length, results });
}


// ---------------- HTTP entry ----------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const jobId = url.searchParams.get("jobId");
    if (!jobId) return json({ error: "jobId required" }, 400);
    return await videoStatus({ jobId });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json();

    // Telegram webhook routing via ?bot=alibaba|vercel (Telegram sends raw updates).
    const bot = url.searchParams.get("bot");
    if (bot === "alibaba" || bot === "vercel") {
      return await handleTelegramBot(bot as TgService, body);
    }

    const kind = String(body.kind || "image");
    body.__req = req;
    if (kind === "auth") return await handleAuthFlow(body);
    if (kind === "checkout") return await handleCheckout(req, body);
    if (kind === "build_agent") return await handleBuildAgent(body);
    if (kind === "code_agent") return await handleCodeAgent(req, body);
    if (kind === "extract_memory") return json({ ok: true, memories: [] });
    if (kind === "health") return await healthCheck();
    if (kind === "enhance") {
      const apiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!apiKey) return json({ error: "missing_lovable_api_key" }, 500);
      const userPrompt = String(body.prompt || "").trim();
      if (!userPrompt) return json({ error: "prompt required" }, 400);
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                "You are a prompt enhancer for an AI image/video generator. Rewrite the user prompt to be vivid, specific, cinematic, and detailed (lighting, mood, composition, style). Keep it under 80 words. Reply with ONLY the enhanced prompt — no preamble, no quotes.",
            },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return json({ error: "enhance_failed", details: data }, r.status);
      const enhanced = data?.choices?.[0]?.message?.content?.trim?.() || "";
      if (!enhanced) return json({ error: "no_enhanced_text" }, 502);
      return json({ enhanced });
    }
    if (kind === "image") return await generate("image", body);
    if (kind === "image_edit" || kind === "edit") return await generate("image_edit", body);
    if (kind === "video") return await generate("video", body);
    if (kind === "video_status") return await videoStatus(body);
    if (kind === "models") return json({ models: MODELS });
    if (kind === "probe_alibaba_key") return await probeAlibabaKey(body);
    if (kind === "validate_all_alibaba_keys") return await validateAllAlibabaKeys();

    if (kind === "apify") return await handleApify(req, body);
    if (kind === "tg_setup_webhooks") {
      const base = `${SUPABASE_URL}/functions/v1/openrouter-media`;
      const results: any = {};
      for (const [bot, envName] of [["alibaba", "TELEGRAM_ALIBABA_BOT_TOKEN"], ["vercel", "TELEGRAM_VERCEL_BOT_TOKEN"]] as const) {
        const token = Deno.env.get(envName);
        if (!token) { results[bot] = { error: "no_token" }; continue; }
        const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: `${base}?bot=${bot}`,
            allowed_updates: ["message", "edited_message", "callback_query"],
            drop_pending_updates: true,
          }),
        });
        const setData = await r.json();
        const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((x) => x.json());
        results[bot] = { setWebhook: setData, getMe: me, webhook_url: `${base}?bot=${bot}` };
      }
      return json(results);
    }
    if (kind === "telegram_alibaba") return await handleTelegramBot("alibaba", body);
    if (kind === "telegram_vercel") return await handleTelegramBot("vercel", body);
    return json({ error: `unknown kind: ${kind}`, supported: ["auth", "checkout", "build_agent", "code_agent", "extract_memory", "health", "image", "image_edit", "video", "video_status", "models", "apify", "telegram_alibaba", "telegram_vercel"] }, 400);
  } catch (err) {
    return json({ error: "internal_error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
});
