/** @doc Polls async video-generation jobs for progress and final URL. */
import { corsHeaders } from "../_shared/cors.ts";
// Thin adapter — checks an Alibaba/BytePlus/Vercel video task once and returns
// a non-blocking status for the frontend's poll loop.
//
// Frontend contract:
//   POST { job_id }   → { status: "pending" | "complete" | "failed",
//                         video_url?, error? }


import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TARGET = `${SUPABASE_URL}/functions/v1/openrouter-media`;

import { getRunbaseRun } from "../_shared/runbase.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function mirrorToBgJob(bgJobId: string | undefined, payload: any) {
  if (!bgJobId) return;
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const status = payload?.status;
    if (status === "complete" && payload?.video_url) {
      await sb.from("background_jobs").update({
        status: "done", progress: 100,
        output: { video_url: payload.video_url },
        status_text: "Done",
        finished_at: new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
      }).eq("id", bgJobId);
    } else if (status === "failed") {
      await sb.from("background_jobs").update({
        status: "error",
        error: String(payload?.error || "failed").slice(0, 4000),
        status_text: "Stopped",
        finished_at: new Date().toISOString(),
      }).eq("id", bgJobId);
    } else {
      await sb.from("background_jobs").update({
        last_heartbeat_at: new Date().toISOString(),
      }).eq("id", bgJobId);
    }
  } catch (e) { console.warn("[media-video-poll] mirror failed", e); }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json();
    const jobId = body.job_id || body.jobId;
    const bgJobId: string | undefined = body.bg_job_id;
    if (!jobId) return json({ error: "job_id required" }, 400);
    const auth = req.headers.get("authorization");

    const respond = async (payload: any, status = 200) => {
      await mirrorToBgJob(bgJobId, payload);
      return json(payload, status);
    };

    // Direct Alibaba-fallback jobs are tagged "direct:<base64-url>" and are
    // already complete by the time the client polls. Decode and return.
    if (typeof jobId === "string" && jobId.startsWith("direct:")) {
      try {
        const b64 = jobId.slice("direct:".length);
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        const url = atob(padded);
        if (!url) return await respond({ status: "failed", error: "empty_direct_url" });
        return await respond({ status: "complete", video_url: url });
      } catch (e) {
        return await respond({
          status: "failed",
          error: `direct_decode_failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    // Runbase jobs are tagged with prefix "runbase:<run_id>[:<key_id>]".
    if (typeof jobId === "string" && jobId.startsWith("runbase:")) {
      const parts = jobId.split(":");
      const runId = parts[1];
      const keyId = parts[2] || null;
      const g = await getRunbaseRun(runId, keyId);
      if (!g.ok) return await respond({ status: "failed", error: g.error?.error || `runbase_${g.status}` });
      const run = g.run;
      if (run.status === "succeeded") {
        const url = run.output?.urls?.[0] || run.output?.url || null;
        if (!url) return await respond({ status: "failed", error: "no_output_url" });
        return await respond({ status: "complete", video_url: url });
      }
      if (run.status === "failed") {
        return await respond({ status: "failed", error: run.error || "runbase_failed" });
      }
      return await respond({ status: "pending" });
    }


    const upstream = await fetch(TARGET, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        ...(auth ? { Authorization: auth } : { Authorization: `Bearer ${ANON_KEY}` }),
      },
      body: JSON.stringify({ kind: "video_status", jobId }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return json(data, upstream.status);

    // Normalise: openrouter-media returns either the new shape
    //   { status, video_url } from checkAlibabaTaskOnce
    // or a legacy { ok, url, error } from the BytePlus / Vercel pollers.
    if (typeof data?.status === "string") return await respond(data);
    if (data?.ok === true && data?.url) return await respond({ status: "complete", video_url: data.url });
    if (data?.ok === false) return await respond({ status: "failed", error: data?.data?.error || "failed" });
    return await respond({ status: "pending" });
  } catch (err) {
    return json(
      { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
