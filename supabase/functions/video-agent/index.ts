/** @doc Plans and orchestrates multi-clip video generation jobs. */
import { corsHeaders } from "../_shared/cors.ts";
// Video Agent — plans a long-form video as multiple shots, dispatches them,
// polls until ready, then merges into a single MP4 via ffmpeg.wasm.
//
// Single entry-point. POST body:
//   { action: "plan",    prompt, total_duration_s, aspect, resolution, model_slug?, max_shots? }
//   { action: "execute", job_id, shots: [{ prompt, duration }], model_slug, aspect, resolution,
//                        refs?, audio_url?, generate_images? }
//   { action: "status",  job_id }
//   { action: "merge",   job_id, audio_url? }
//
// State is persisted in `background_jobs` with kind='video_agent'.



import { getDashscopeKey } from "../_shared/llm-router.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_SHOTS_HARD = 30;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Shot = {
  index: number;
  prompt: string;
  duration: number;
  image_prompt?: string;
  status?: "pending" | "running" | "complete" | "failed";
  job_id?: string;
  video_url?: string;
  image_url?: string;
  error?: string;
};

// ─────────────────────────── helpers ───────────────────────────

async function db<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`db ${r.status}: ${await r.text()}`);
  return r.json();
}

async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: auth },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ?? null;
  } catch {
    return null;
  }
}

// LLM planner
async function planShots(opts: {
  prompt: string;
  total_duration_s: number;
  aspect: string;
  resolution: string;
  max_shots?: number;
}): Promise<Shot[]> {
  const maxShots = Math.min(opts.max_shots ?? MAX_SHOTS_HARD, MAX_SHOTS_HARD);
  // Each shot is 5/8/10/15s — prefer 8s for cinematic pacing
  const targetCount = Math.max(1, Math.min(maxShots, Math.ceil(opts.total_duration_s / 8)));

  const sys = `You are a film storyboard planner. Split a video idea into ${targetCount} consecutive shots, each 5-15 seconds, totalling approximately ${opts.total_duration_s} seconds.
Return STRICT JSON ONLY with the shape:
{ "shots": [ { "prompt": "vivid cinematic visual description of one continuous shot, camera + subject + action + style", "duration": 5|8|10|15, "image_prompt": "optional starting-frame image description if the shot benefits from a fixed first frame" } ] }
Rules:
- Each shot is ONE continuous take. No cuts inside a shot.
- Maintain visual continuity (same characters, locations, lighting, art direction) across shots.
- Vary camera framing across shots (wide / medium / close / aerial / tracking) for editing rhythm.
- Aspect ratio: ${opts.aspect}. Resolution: ${opts.resolution}.
- Aim for the requested total duration; do not exceed ${maxShots} shots.
- Output ONLY valid JSON, no markdown fences, no commentary.`;

  const dash = await getDashscopeKey();
  if (!dash) throw new Error("no_alibaba_key: configure DASHSCOPE/QWEN/ALIBABA key in api_keys table");

  const r = await fetch(dash.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${dash.key}`,
    },
    body: JSON.stringify({
      model: "qwen-plus",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: opts.prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) throw new Error(`planner ${r.status}: ${await r.text()}`);
  const d = await r.json();
  const text = d?.choices?.[0]?.message?.content ?? "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : { shots: [] };
  }
  const raw: any[] = Array.isArray(parsed?.shots) ? parsed.shots : [];
  return raw.slice(0, maxShots).map((s, i) => ({
    index: i,
    prompt: String(s?.prompt ?? "").trim() || `Shot ${i + 1}`,
    duration: [5, 8, 10, 15].includes(Number(s?.duration)) ? Number(s.duration) : 5,
    image_prompt: s?.image_prompt ? String(s.image_prompt) : undefined,
    status: "pending",
  }));
}

async function submitShot(opts: {
  shot: Shot;
  model_slug: string;
  aspect: string;
  resolution: string;
  first_frame?: string;
  refs?: string[];
  audio_url?: string;
  auth: string | null;
}): Promise<string> {
  const payload: Record<string, unknown> = {
    model_slug: opts.model_slug,
    prompt: opts.shot.prompt,
    aspect_ratio: opts.aspect,
    resolution: opts.resolution,
    duration: opts.shot.duration,
  };
  if (opts.first_frame) payload.start_frame = opts.first_frame;
  if (opts.refs?.length) payload.images = opts.refs;
  if (opts.audio_url) payload.audio_url = opts.audio_url;

  const r = await fetch(`${SUPABASE_URL}/functions/v1/media-video`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: opts.auth ?? `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`submit shot ${opts.shot.index}: ${JSON.stringify(d)}`);
  const jid = d?.job_id || d?.jobId;
  if (!jid) throw new Error(`no job_id for shot ${opts.shot.index}`);
  return jid;
}

async function pollShot(job_id: string, auth: string | null) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/media-video-poll`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: auth ?? `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ job_id }),
  });
  return r.json().catch(() => ({ status: "pending" }));
}

// ───────────────────────── ffmpeg merge ─────────────────────────
// Uses native ffmpeg via runtime if available; falls back to a Deno
// implementation using @ffmpeg/ffmpeg (wasm). For long videos this is
// slow — caller should treat merge as a long-running task.

async function downloadToBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status} ${url}`);
  const b = new Uint8Array(await r.arrayBuffer());
  return b;
}

async function mergeClips(_urls: string[], _audioUrl?: string): Promise<Uint8Array> {
  // ffmpeg.wasm (@ffmpeg/ffmpeg 0.12+) requires Web Workers, which are not
  // available in the Supabase Edge Runtime ("Worker is not defined"). Until
  // we move merging to a worker queue / native ffmpeg service, surface a
  // clear error so callers can fall back to returning individual clip URLs.
  throw new Error("merge_unsupported_in_edge_runtime");
}


const STORAGE_BUCKET = "media-studio";

async function uploadToStorage(bytes: Uint8Array, path: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "video/mp4",
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!r.ok) throw new Error(`upload ${r.status}: ${await r.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

// ─────────────────────────── handlers ───────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json();
    let action = String(body?.action ?? "");
    const auth = req.headers.get("authorization");
    const userId = await getUserId(req);

    // Watchdog-driven resume: re-run status polling for a stuck job.
    if (action === "resume") {
      body.job_id = body.job_id ?? body.jobId;
      action = "status";
    }

    // ── plan ───────────────────────────────────────────────
    if (action === "plan") {
      const shots = await planShots({
        prompt: String(body.prompt ?? ""),
        total_duration_s: Number(body.total_duration_s ?? 30),
        aspect: String(body.aspect ?? "16:9"),
        resolution: String(body.resolution ?? "720p"),
        max_shots: Number(body.max_shots ?? MAX_SHOTS_HARD),
      });
      // Persist parent job
      const rows: any[] = await db("background_jobs", {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          kind: "video_agent",
          status: "pending",
          phase: "planned",
          runner: "video-agent",
          resumable: true,
          last_heartbeat_at: new Date().toISOString(),
          input: {
            prompt: body.prompt,
            total_duration_s: body.total_duration_s,
            aspect: body.aspect,
            resolution: body.resolution,
            model_slug: body.model_slug,
          },
          output: { shots },
        }),
      });
      return json({ job_id: rows[0]?.id, shots });
    }

    // ── execute ────────────────────────────────────────────
    if (action === "execute") {
      const job_id = String(body.job_id ?? "");
      const shotsIn: Shot[] = Array.isArray(body.shots) ? body.shots : [];
      const model_slug = String(body.model_slug ?? "happyhorse-t2v");
      const aspect = String(body.aspect ?? "16:9");
      const resolution = String(body.resolution ?? "720p");
      const refs: string[] = Array.isArray(body.refs) ? body.refs : [];
      const audio_url: string | undefined = body.audio_url || undefined;
      if (!job_id || !shotsIn.length) return json({ error: "job_id + shots required" }, 400);

      // Fire all shot submissions in parallel
      const submitted = await Promise.all(
        shotsIn.slice(0, MAX_SHOTS_HARD).map(async (shot, i) => {
          try {
            const jid = await submitShot({
              shot: { ...shot, index: i },
              model_slug,
              aspect,
              resolution,
              refs,
              audio_url,
              auth,
            });
            return { ...shot, index: i, status: "running" as const, job_id: jid };
          } catch (e) {
            return {
              ...shot,
              index: i,
              status: "failed" as const,
              error: e instanceof Error ? e.message : String(e),
            };
          }
        }),
      );

      await db(`background_jobs?id=eq.${job_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "running",
          phase: "shots_running",
          output: { shots: submitted, model_slug, aspect, resolution, audio_url },
          updated_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString(),
        }),
      });
      return json({ job_id, shots: submitted });
    }

    // ── status ─────────────────────────────────────────────
    if (action === "status") {
      const job_id = String(body.job_id ?? "");
      if (!job_id) return json({ error: "job_id required" }, 400);
      const rows: any[] = await db(`background_jobs?id=eq.${job_id}&select=*`);
      const row = rows[0];
      if (!row) return json({ error: "not_found" }, 404);
      const shots: Shot[] = row?.output?.shots ?? [];

      // Poll all shots that aren't terminal
      const updated = await Promise.all(
        shots.map(async (s) => {
          if (!s.job_id) return s;
          if (s.status === "complete" || s.status === "failed") return s;
          try {
            const st = await pollShot(s.job_id, auth);
            if (st?.status === "complete" && st?.video_url) {
              return { ...s, status: "complete" as const, video_url: st.video_url };
            }
            if (st?.status === "failed") {
              return { ...s, status: "failed" as const, error: st?.error };
            }
            return { ...s, status: "running" as const };
          } catch (e) {
            return { ...s, error: e instanceof Error ? e.message : String(e) };
          }
        }),
      );

      const allDone = updated.every((s) => s.status === "complete" || s.status === "failed");
      const anyFailed = updated.some((s) => s.status === "failed");
      const completeCount = updated.filter((s) => s.status === "complete").length;
      const progress = Math.round((completeCount / Math.max(1, updated.length)) * 90);

      await db(`background_jobs?id=eq.${job_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          progress,
          status: allDone ? (anyFailed ? "failed" : "ready_to_merge") : "running",
          phase: allDone ? "shots_done" : "shots_running",
          output: { ...row.output, shots: updated },
          updated_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString(),
        }),
      });

      return json({
        job_id,
        status: allDone ? (anyFailed ? "failed" : "ready_to_merge") : "running",
        progress,
        shots: updated,
      });
    }

    // ── merge ──────────────────────────────────────────────
    if (action === "merge") {
      const job_id = String(body.job_id ?? "");
      if (!job_id) return json({ error: "job_id required" }, 400);
      const rows: any[] = await db(`background_jobs?id=eq.${job_id}&select=*`);
      const row = rows[0];
      if (!row) return json({ error: "not_found" }, 404);
      const shots: Shot[] = row?.output?.shots ?? [];
      const urls = shots
        .filter((s) => s.status === "complete" && s.video_url)
        .map((s) => s.video_url!) as string[];
      if (!urls.length) return json({ error: "no_clips_ready" }, 400);

      await db(`background_jobs?id=eq.${job_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          phase: "merging",
          status: "running",
          updated_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString(),
        }),
      });

      const audioUrl = body.audio_url || row?.output?.audio_url || undefined;
      try {
        const merged = await mergeClips(urls, audioUrl);
        const path = `video-agent/${job_id}.mp4`;
        const finalUrl = await uploadToStorage(merged, path);
        await db(`background_jobs?id=eq.${job_id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "complete",
            phase: "merged",
            progress: 100,
            output: { ...row.output, final_url: finalUrl },
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString(),
          }),
        });
        return json({ job_id, final_url: finalUrl, shots });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await db(`background_jobs?id=eq.${job_id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "complete",
            phase: "clips_ready",
            progress: 100,
            output: { ...row.output, clip_urls: urls, merge_error: msg },
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString(),
          }),
        });
        return json({ job_id, clip_urls: urls, shots, merge_error: msg, merge_skipped: true });
      }
    }

    // ── merge_urls (inline) ───────────────────────────────
    // Stitch a list of video URLs directly without needing a parent job.
    // Body: { action: "merge_urls", urls: string[], audio_url?: string }
    if (action === "merge_urls") {
      const urls: string[] = Array.isArray(body.urls)
        ? body.urls.filter((u: unknown) => typeof u === "string" && u.length > 0)
        : [];
      if (urls.length < 1) return json({ error: "no_urls" }, 400);
      const audioUrl: string | undefined = body.audio_url || undefined;
      try {
        const merged = await mergeClips(urls, audioUrl);
        const id = crypto.randomUUID();
        const path = `video-agent/inline-${id}.mp4`;
        const finalUrl = await uploadToStorage(merged, path);
        return json({ final_url: finalUrl, clip_count: urls.length });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return json({ clip_urls: urls, clip_count: urls.length, merge_error: msg, merge_skipped: true });
      }
    }


    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    return json(
      { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
