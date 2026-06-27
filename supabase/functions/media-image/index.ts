/** @doc Routes image-generation requests to the right provider (BFL, Flux, Recraft, ...). */
import { corsHeaders } from "../_shared/cors.ts";
// Thin adapter that translates the StudioPage / MediaHub contract
// into the unified `openrouter-media` edge function.
//
// Frontend contract:
//   POST { action: "enhance", prompt }                      → { enhanced }
//   POST { prompt, model_slug, provider, images[],
//          aspect_ratio, resolution, num_images }           → { image_urls: [], image_url }

import {
  hasRunbaseKeys,
  resolveRunbaseModel,
  runbaseGenerateSync,
} from "../_shared/runbase.ts";
import { alibabaGenerateImage } from "../_shared/alibaba-direct.ts";




const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const TARGET = `${SUPABASE_URL}/functions/v1/openrouter-media`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isRealUserAuth = (auth: string | null) => {
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice("Bearer ".length).trim();
  return !!token && token !== ANON_KEY && token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
};

const premiumPaywall = (reason = "auth_required") =>
  json({
    paywall: true,
    feature: "image",
    message: "توليد الصور متاح للمشتركين فقط. سجّل الدخول أو اشترك من صفحة الباقات.",
    upgrade_url: "/billing",
    reason,
  }, 200);

const normalizeResolution = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim().toLowerCase().replace(/px$/, "");
  return normalized || undefined;
};

async function forward(payload: unknown, auth: string | null): Promise<Response> {
  const r = await fetch(TARGET, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      ...(auth ? { Authorization: auth } : { Authorization: `Bearer ${ANON_KEY}` }),
    },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json();
    const auth = req.headers.get("authorization");

    // ── Streaming path (ChatGPT-style partial_images via Lovable AI Gateway) ──
    if (body?.stream === true) {
      const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
      if (!lovableKey) return json({ error: "missing_lovable_api_key" }, 500);
      const prompt = String(body?.prompt || "").trim();
      if (!prompt) return json({ error: "missing_prompt" }, 400);
      const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-image-2",
          prompt,
          quality: body?.quality || "low",
          stream: true,
          partial_images: Number(body?.partial_images ?? 3),
        }),
      });
      if (!upstream.ok || !upstream.body) {
        const text = await upstream.text().catch(() => "");
        return json({ error: "upstream_failed", status: upstream.status, message: text }, 502);
      }
      return new Response(upstream.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    if (body.action !== "enhance" && !isRealUserAuth(auth)) {
      return premiumPaywall("auth_required");
    }

    // 1) Prompt enhancement
    if (body.action === "enhance") {
      const r = await forward({ kind: "enhance", prompt: body.prompt }, auth);
      return r;
    }

    // 2) Image generation / edit
    const images: string[] = Array.isArray(body.images) ? body.images : [];
    const isEdit = images.length > 0;

    // 2a) Runbase fast-path — try first if any active Runbase key exists.
    const requestedSlug = String(body.model_slug || body.model || "");
    const runbaseModel = resolveRunbaseModel(requestedSlug);
    if (runbaseModel && (await hasRunbaseKeys())) {
      const input: Record<string, unknown> = {
        prompt: body.prompt,
      };
      if (body.aspect_ratio) input.aspect_ratio = body.aspect_ratio;
      const res = normalizeResolution(body.resolution);
      if (res) input.resolution = res;
      const n = Number(body.num_images || 1);
      if (n > 1) input.n = n;
      if (images.length === 1) input.image = images[0];
      if (images.length > 1) input.images = images;

      const rb = await runbaseGenerateSync(runbaseModel, input, { timeoutMs: 120_000 });
      if (rb.ok) {
        return json({ image_urls: rb.urls, image_url: rb.urls[0] ?? null, provider: "runbase", raw: rb.raw });
      }
      // Fall through to legacy openrouter-media path if Runbase failed.
      console.warn("[media-image] runbase failed, falling back:", rb.status, rb.error);
    }

    const payload: Record<string, unknown> = {
      kind: isEdit ? "image_edit" : "image",
      model: body.model_slug || body.model,
      prompt: body.prompt,
      aspect_ratio: body.aspect_ratio,
      resolution: normalizeResolution(body.resolution),
      n: Number(body.num_images || 1),
    };
    if (images.length === 1) payload.image = images[0];
    if (images.length > 1) payload.images = images;

    // Fallback chain: if the requested model's provider is out of credits,
    // try alternative image models instead of failing.
    const requestedModel = String(payload.model || "");
    const wantsAlibaba = /qwen|wan|dashscope|alibaba/i.test(requestedModel);
    const fallbackModels = (
      wantsAlibaba
        ? [requestedModel, "qwen-image-2.0-pro", "qwen-image-2.0", "nano-banana-2", "gpt-image-2"]
        : [requestedModel, "nano-banana-2", "gpt-image-2", "qwen-image-2.0-pro", "qwen-image-2.0"]
    ).filter((m, i, a) => m && a.indexOf(m) === i);

    let data: any = {};
    let lastStatus = 500;
    let lastError: any = null;
    const hasUrls = (d: any) =>
      (Array.isArray(d?.urls) && d.urls.length > 0) ||
      (Array.isArray(d?.image_urls) && d.image_urls.length > 0) ||
      typeof d?.url === "string" ||
      typeof d?.image_url === "string";

    for (const model of fallbackModels) {
      const upstream = await fetch(TARGET, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
          ...(auth ? { Authorization: auth } : { Authorization: `Bearer ${ANON_KEY}` }),
        },
        body: JSON.stringify({ ...payload, model }),
      });
      data = await upstream.json().catch(() => ({}));
      lastStatus = upstream.status;
      lastError = data;
      // Treat as success only if we actually got image URLs back.
      // openrouter-media sometimes returns HTTP 200 with `{error|paywall}`
      // bodies on provider failures — those must NOT short-circuit the loop.
      if (upstream.ok && hasUrls(data) && !data?.error && !data?.paywall) break;
      const errStr = JSON.stringify(data || {});
      const retryable =
        errStr.includes("all_keys_exhausted") ||
        errStr.includes("Insufficient credits") ||
        errStr.includes("rate_limit") ||
        errStr.includes("invalid_token") ||
        errStr.includes("provider_error") ||
        errStr.includes("paywall") ||
        upstream.status === 429 ||
        upstream.ok; // 200-with-error bodies should retry the next model
      if (!retryable) break;
      console.warn(`[media-image] ${model} failed (${upstream.status}); trying next`);
    }

    const succeeded = lastStatus >= 200 && lastStatus < 300 && hasUrls(data) && !data?.error && !data?.paywall;
    if (!succeeded) {
      // ── LAST-RESORT FALLBACK: direct Alibaba DashScope ───────────────
      if (!isEdit) {
        console.warn(
          "[media-image] all providers failed — trying direct Alibaba fallback",
          { lastStatus, lastError: lastError?.error || lastError?.reason },
        );
        const ali = await alibabaGenerateImage({
          prompt: String(body.prompt || ""),
          aspect_ratio: body.aspect_ratio,
          n: Number(body.num_images || 1),
        });
        if (ali.ok && ali.urls && ali.urls.length > 0) {
          return json({
            image_urls: ali.urls,
            image_url: ali.urls[0],
            provider: "alibaba-direct",
          });
        }
        console.warn("[media-image] alibaba-direct fallback failed:", ali.error);
      }

      const msg = lastError?.last_error?.message || lastError?.reason || lastError?.error || "image generation failed";
      const paywall =
        lastStatus === 401 ||
        lastStatus === 402 ||
        lastError?.paywall === true ||
        /auth_required|free_trial_exhausted|insufficient|credit|quota|balance|invalid_token/i.test(
          JSON.stringify(lastError || {}) + ` ${msg}`,
        );
      if (paywall) {
        return json({ paywall: true, feature: "image", message: "اشترك في خطة مدفوعة أو اشحن رصيدك لتوليد الصور.", upgrade_url: "/billing", reason: msg }, 200);
      }
      return json({ error: "generation_failed", message: msg, details: lastError }, 200);
    }



    const urls: string[] =
      (Array.isArray(data?.urls) && data.urls) ||
      (Array.isArray(data?.image_urls) && data.image_urls) ||
      (data?.url ? [data.url] : []) ||
      [];
    return json({ image_urls: urls, image_url: urls[0] ?? null, raw: data });
  } catch (err) {
    return json(
      { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});