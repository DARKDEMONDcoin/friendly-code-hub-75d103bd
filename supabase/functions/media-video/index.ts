/** @doc Routes video-generation requests to the right provider (Kling, Sora, Veo, ...). */
import { corsHeaders } from "../_shared/cors.ts";
// Thin adapter that translates the StudioPage / MediaHub video contract
// into the unified `openrouter-media` edge function.
//
// Frontend contract:
//   POST { prompt, model_slug, images[], start_frame, end_frame,
//          aspect_ratio, resolution, duration }             → { job_id }

import {
  createRunbaseRun,
  hasRunbaseKeys,
  resolveRunbaseModel,
} from "../_shared/runbase.ts";
import { alibabaGenerateVideo } from "../_shared/alibaba-direct.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";




const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TARGET = `${SUPABASE_URL}/functions/v1/openrouter-media`;
const POLL_TARGET = `${SUPABASE_URL}/functions/v1/media-video-poll`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const admin = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const isRealUserAuth = (auth: string | null) => {
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice("Bearer ".length).trim();
  return !!token && token !== ANON_KEY && token !== SERVICE_KEY;
};

const premiumPaywall = (reason = "auth_required") =>
  json(
    {
      paywall: true,
      feature: "video",
      message: "توليد الفيديو متاح للمشتركين فقط. سجّل الدخول أو اشترك من صفحة الباقات.",
      upgrade_url: "/billing",
      reason,
    },
    200,
  );

async function getUserIdFromAuth(auth: string | null): Promise<string | null> {
  if (!auth) return null;
  try {
    const sb = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: auth } },
    });
    const { data } = await sb.auth.getUser();
    return data?.user?.id ?? null;
  } catch { return null; }
}

/** Track an in-flight provider job in background_jobs so the user can
 * recover it after closing the tab and the SQL watchdog can keep it alive.
 */
async function trackVideoJob(params: {
  userId: string;
  jobId: string;
  prompt: string;
  model: string;
  provider: string;
}) {
  try {
    const sb = admin();
    const { data } = await sb
      .from("background_jobs")
      .insert({
        user_id: params.userId,
        kind: "video",
        status: "running",
        runner: "media-video",
        resumable: true,
        progress: 5,
        status_text: "Generating video…",
        input: {
          provider_job_id: params.jobId,
          prompt: params.prompt,
          model: params.model,
          provider: params.provider,
        },
        last_heartbeat_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    return data?.id as string | undefined;
  } catch (e) {
    console.warn("[media-video] trackVideoJob failed", e);
    return undefined;
  }
}

/** Watchdog resume: poll the provider once and update the tracked job. */
async function handleResume(bgJobId: string): Promise<Response> {
  const sb = admin();
  const { data: row, error } = await sb
    .from("background_jobs")
    .select("id, user_id, input, status")
    .eq("id", bgJobId)
    .maybeSingle();
  if (error || !row) return json({ error: "job_not_found" }, 404);
  if (row.status === "done" || row.status === "error" || row.status === "canceled") {
    return json({ ok: true, terminal: true, status: row.status });
  }
  const providerJobId = (row.input as any)?.provider_job_id;
  if (!providerJobId) {
    await sb.from("background_jobs")
      .update({ status: "error", error: "missing_provider_job_id", finished_at: new Date().toISOString() })
      .eq("id", bgJobId);
    return json({ ok: false, error: "missing_provider_job_id" });
  }

  // Heartbeat first so watchdog doesn't immediately re-claim while we poll.
  await sb.from("background_jobs")
    .update({ last_heartbeat_at: new Date().toISOString() })
    .eq("id", bgJobId);

  // Reuse the existing poll endpoint (handles direct:/runbase:/openrouter all in one).
  const r = await fetch(POLL_TARGET, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ job_id: providerJobId }),
  });
  const data = await r.json().catch(() => ({}));
  const status = data?.status;
  if (status === "complete" && data?.video_url) {
    await sb.from("background_jobs").update({
      status: "done",
      progress: 100,
      output: { video_url: data.video_url },
      status_text: "Done",
      finished_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    }).eq("id", bgJobId);
    return json({ ok: true, status: "complete", video_url: data.video_url });
  }
  if (status === "failed") {
    await sb.from("background_jobs").update({
      status: "error",
      error: String(data?.error || "failed").slice(0, 4000),
      status_text: "Stopped",
      finished_at: new Date().toISOString(),
    }).eq("id", bgJobId);
    return json({ ok: false, status: "failed", error: data?.error });
  }
  // Still pending — heartbeat keeps the watchdog at bay until next tick.
  return json({ ok: true, status: "pending" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json();

    // ── Watchdog resume path ────────────────────────────────────────────
    if (body?.action === "resume" && body?.job_id) {
      return await handleResume(String(body.job_id));
    }

    const auth = req.headers.get("authorization");
    if (!isRealUserAuth(auth)) return premiumPaywall("auth_required");
    const userId = await getUserIdFromAuth(auth);

    const startFrame = body.start_frame || (Array.isArray(body.images) ? body.images[0] : null);
    const endFrame = body.end_frame || null;

    // Runbase fast-path: route to runbase if we have a key + a known model.
    const requestedSlug = String(body.model_slug || body.model || "");
    const runbaseModel = resolveRunbaseModel(requestedSlug);
    if (runbaseModel && (await hasRunbaseKeys())) {
      const input: Record<string, unknown> = { prompt: body.prompt };
      if (body.aspect_ratio) input.aspect_ratio = body.aspect_ratio;
      if (body.resolution) input.resolution = body.resolution;
      if (body.duration) input.duration = body.duration;
      if (startFrame) input.start_frame = startFrame;
      if (endFrame) input.end_frame = endFrame;
      if (body.audio_url) input.audio_url = body.audio_url;
      if (body.video_url) input.video_url = body.video_url;
      if (Array.isArray(body.images) && body.images.length > 1) input.images = body.images;

      const rb = await createRunbaseRun(runbaseModel, input);
      if (rb.ok) {
        // Encode keyId so media-video-poll can re-use it.
        const jobId = `runbase:${rb.run.id}:${rb.keyId}`;
        let bgJobId: string | undefined;
        if (userId) {
          bgJobId = await trackVideoJob({
            userId, jobId, prompt: String(body.prompt || ""),
            model: requestedSlug, provider: "runbase",
          });
        }
        return json({ job_id: jobId, status: rb.run.status || "pending", provider: "runbase", bg_job_id: bgJobId });
      }
      console.warn("[media-video] runbase failed, falling back:", rb.status, rb.error);
    }

    const requestedForFallback = String(body.model_slug || body.model || "");
    const likelyAlibaba = /wan|qwen|alibaba|dashscope|happyhorse/i.test(requestedForFallback);

    const payload: Record<string, unknown> = {
      kind: "video",
      async: true,
      model: body.model_slug || body.model || "wan-2-7-t2v",
      prompt: body.prompt,
      aspect_ratio: body.aspect_ratio,
      resolution: body.resolution,
      duration: body.duration,
    };
    if (startFrame) payload.first_frame = startFrame;
    if (endFrame) payload.last_frame = endFrame;
    // NEW: forward audio + video inputs for models that support them
    // (Veo3-style audio, Runway/Firefly/VACE video-to-video edits, etc.)
    if (body.audio_url) payload.audio_url = String(body.audio_url);
    if (body.video_url) payload.video_url = String(body.video_url);
    if (Array.isArray(body.images) && body.images.length > 1) payload.images = body.images;


    const modelFallbacks = likelyAlibaba
      ? [String(payload.model), "wan-2-7-t2v", "happyhorse-1.0-t2v", "wan-2-5-t2v", "wan-2-2-t2v-plus"]
      : [String(payload.model), "wan-2-7-t2v"];
    let upstream: Response | null = null;
    let data: any = {};
    for (const model of Array.from(new Set(modelFallbacks.filter(Boolean)))) {
      upstream = await fetch(TARGET, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
          ...(auth ? { Authorization: auth } : { Authorization: `Bearer ${ANON_KEY}` }),
        },
        body: JSON.stringify({ ...payload, model }),
      });
      data = await upstream.json().catch(() => ({}));
      const job = data?.jobId || data?.job_id;
      if (upstream.ok && job && !data?.error && !data?.paywall) break;
      const errText = JSON.stringify(data || {});
      if (/auth_required|free_trial_exhausted|subscription|required|invalid_token|insufficient|credit|quota|balance/i.test(errText)) break;
      if (!/unknown model|model .*not|all_models_exhausted|provider_error|no_task_id|InvalidParameter|Model not exist/i.test(errText) && !upstream.ok) break;
    }
    if (!upstream) return json({ error: "video_request_not_started" }, 500);

    const upstreamText = JSON.stringify(data || {});
    if (data?.error === "all_models_exhausted") {
      const providerMessage = String(
        data?.last_error?.message ||
        data?.last_error?.error?.message ||
        data?.last_error?.error ||
        data?.message ||
        "Video provider capacity is currently unavailable.",
      );
      const isFreeQuota = /free quota|FreeTierOnly|quota has been exhausted/i.test(providerMessage);
      return json({
        error: "provider_unavailable",
        message: isFreeQuota
          ? "مزود الفيديو الحالي نفد رصيده/الكوتا الخاصة به. أضف مفتاح فيديو مدفوع أو جرّب لاحقًا عندما تعود الكوتا."
          : `مزود الفيديو رفض الطلب: ${providerMessage}`,
        reason: data.error,
        raw: data,
      }, 200);
    }
    const billingFailure =
      upstream.status === 401 ||
      upstream.status === 402 ||
      /auth_required|free_trial_exhausted|subscription|required|invalid_token|insufficient|credit|quota|balance/i.test(upstreamText);
    if (billingFailure) {
      const reason = data?.message || data?.error || data?.reason || `video_${upstream.status}`;
      return premiumPaywall(String(reason));
    }

    // ── LAST-RESORT FALLBACK: direct Alibaba DashScope video ─────────────
    // Only use the synchronous fallback for quick "no job returned" cases.
    // When openrouter-media returns a real provider error (rate-limit/quota/model
    // exhausted), do NOT start a blocking internal poll here; the frontend expects
    // this adapter to return quickly with either a job_id or a clear error.
    const upstreamJobId = data?.jobId || data?.job_id;
    const upstreamFailed = !upstream.ok || !upstreamJobId;
    if (upstreamFailed) {
      console.warn(
        "[media-video] openrouter-media failed — trying direct Alibaba fallback",
        upstream.status,
        data?.error,
      );
      if (!upstream.ok && data?.error) {
        const reason = data?.last_error?.message || data?.last_error?.error || data?.message || data?.error || `video_${upstream.status}`;
        return json({ error: String(reason), raw: data }, upstream.status);
      }
      const ali = await alibabaGenerateVideo({
        prompt: String(body.prompt || ""),
        aspect_ratio: body.aspect_ratio,
        duration: Number(body.duration) || 5,
        start_frame: startFrame,
      });
      if (ali.ok && ali.urls && ali.urls.length > 0) {
        // Encode the finished URL into a synthetic job id; media-video-poll
        // decodes the "direct:" prefix and returns complete immediately.
        const b64 = btoa(ali.urls[0]).replace(/=+$/, "");
        return json({
          job_id: `direct:${b64}`,
          status: "complete",
          provider: "alibaba-direct",
          video_url: ali.urls[0],
        });
      }
      console.warn("[media-video] alibaba-direct fallback failed:", ali.error);

      if (!upstream.ok) {
        const reason = data?.message || data?.error || `video_${upstream.status}`;
        const paywall =
          upstream.status === 401 ||
          upstream.status === 402 ||
          /auth_required|free_trial_exhausted|insufficient|credit|quota|balance|invalid_token/i.test(
            JSON.stringify(data || {}) + ` ${reason}`,
          );
        if (paywall) {
          return json(
            {
              paywall: true,
              feature: "video",
              message: "اشترك في خطة مدفوعة أو اشحن رصيدك لتوليد الفيديو.",
              upgrade_url: "/billing",
              reason,
            },
            200,
          );
        }
        return json(data, upstream.status);
      }
      return json({ error: "no_job_returned", raw: data }, 502);
    }

    let bgJobId: string | undefined;
    if (userId) {
      bgJobId = await trackVideoJob({
        userId,
        jobId: String(upstreamJobId),
        prompt: String(body.prompt || ""),
        model: String(payload.model || ""),
        provider: "openrouter-media",
      });
    }
    return json({ job_id: upstreamJobId, status: data?.status || "pending", bg_job_id: bgJobId });

  } catch (err) {
    return json(
      { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
