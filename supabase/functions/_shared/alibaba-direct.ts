// Direct Alibaba DashScope fallback for image + video generation.
// Used when the primary provider chain (openrouter-media / runbase) fails.
//
// Looks up DashScope API keys from the canonical `media_provider_keys` table,
// then calls DashScope's official text2image/text2video endpoints. Polls async
// tasks to completion and returns URLs.
//
// This is the LAST RESORT — keep it dependency-free and resilient.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const MAAS_REGIONS = [
  "ap-southeast-1",
  "cn-beijing",
  "cn-shanghai",
  "cn-hangzhou",
  "cn-shenzhen",
  "ap-northeast-1",
  "us-east-1",
];

/** Extract the workspace_id from an sk-ws-* key (chars between "sk-ws-" and
 *  first ".") and re-prepend "ws-" for use as a MaaS subdomain. */
function workspaceIdFromKey(apiKey: string): string | null {
  if (!apiKey || !apiKey.startsWith("sk-ws-")) return null;
  const rest = apiKey.slice("sk-ws-".length);
  const ws = rest.split(".")[0];
  return ws && ws.length > 0 ? `ws-${ws}` : null;
}


export interface AlibabaResult {
  ok: boolean;
  urls?: string[];
  error?: string;
  status?: number;
}

export interface KeyCandidate {
  key: string;
  host: string;       // hostname only, no scheme, no /api/v1 suffix
  source: string;     // for logging
  id?: string;        // row id in media_provider_keys
  table?: "media_provider_keys";
}

const DEFAULT_HOSTS = [
  "dashscope-intl.aliyuncs.com",
  "dashscope.aliyuncs.com",
];

let cachedCandidates: KeyCandidate[] | null = null;
let cachedAt = 0;
const KEY_TTL_MS = 60_000;

const FAILURE_BLOCK_THRESHOLD = 5;
// Probe sources try multiple hosts/regions for the same key. An auth failure
// on a probe host does NOT mean the key is invalid — only that this particular
// host is wrong for that key. Never block based on probe-source auth failures.
function isProbeSource(source?: string): boolean {
  if (!source) return false;
  return source.includes("+default") || source.includes("+maas") || source.includes("+workspace");
}

function getAdmin() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return null;
  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Record success/failure for a key candidate. Best-effort; never throws.
 *  - Resets failure_count + bumps last_used_at on success
 *  - Increments failure_count on failure; blocks key after threshold for auth errors
 *  - Writes one row to key_usage_log
 */
export async function recordKeyOutcome(
  cand: KeyCandidate,
  outcome: { ok: boolean; model?: string; status?: number; error?: string },
): Promise<void> {
  try {
    const admin = getAdmin();
    if (!admin) return;
    const nowIso = new Date().toISOString();
    const isAuthError =
      outcome.status === 401 ||
      outcome.status === 403 ||
      /InvalidApiKey|AccessDenied|Unauthor/i.test(outcome.error || "");
    const probing = isProbeSource(cand.source);

    // Update key row (best-effort, depends on table).
    if (cand.id && cand.table === "media_provider_keys") {
      if (outcome.ok) {
        await admin.from("media_provider_keys").update({
          status: "active",
          updated_at: nowIso,
        }).eq("id", cand.id);
      } else if (isAuthError && !probing) {
        await admin.from("media_provider_keys").update({
          status: "blocked",
          notes: (outcome.error || "").slice(0, 500),
          updated_at: nowIso,
        }).eq("id", cand.id);
      }
    }

    // Append to key_usage_log (single row per attempt).
    await admin.from("key_usage_log").insert({
      provider: "alibaba",
      key_id: cand.id ?? null,
      model_id: outcome.model ?? null,
      success: !!outcome.ok,
      error_message: outcome.ok ? null : (outcome.error || "").slice(0, 500),
    });
  } catch (_e) {
    // swallow — telemetry must never break generation
  }
}

/** Force-refresh the candidate cache. Useful after marking a key blocked. */
export function resetDashscopeCandidateCache() {
  cachedCandidates = null;
  cachedAt = 0;
}

function normalizeHost(h?: string | null): string | null {
  if (!h) return null;
  const clean = String(h).trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return clean || null;
}

/** Returns all known DashScope key candidates from the canonical table. */
export async function getDashscopeCandidates(): Promise<KeyCandidate[]> {
  const now = Date.now();
  if (cachedCandidates && now - cachedAt < KEY_TTL_MS) return cachedCandidates;

  const out: KeyCandidate[] = [];
  const seen = new Set<string>();
  const push = (
    key: string,
    host: string,
    source: string,
    id?: string,
    table?: KeyCandidate["table"],
  ) => {
    const k = `${key}|${host}`;
    if (!key || seen.has(k)) return;
    seen.add(k);
    out.push({ key, host, source, id, table });
  };

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (supabaseUrl && serviceRole) {
    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // The single production pool used by openrouter-media / Telegram admin bot.
    try {
      const { data } = await admin
        .from("media_provider_keys")
        .select("id, api_key, endpoint_host, workspace_id")
        .eq("provider", "alibaba")
        .eq("status", "active")
        .order("priority", { ascending: true, nullsFirst: true })
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(10);
      for (const row of (data || []) as any[]) {
        const key = row?.api_key as string | undefined;
        if (!key) continue;
        const explicitHost = normalizeHost(row?.endpoint_host);
        if (explicitHost) push(key, explicitHost, "media_provider_keys", row?.id, "media_provider_keys");
        const workspace = normalizeHost(row?.workspace_id);
        if (workspace) push(key, `${workspace}.ap-southeast-1.maas.aliyuncs.com`, "media_provider_keys+workspace", row?.id, "media_provider_keys");
        // Auto-derive workspace endpoint from sk-ws-* keys when no explicit host is configured.
        if (!explicitHost && !workspace) {
          const derived = workspaceIdFromKey(key);
          if (derived) push(key, `${derived}.ap-southeast-1.maas.aliyuncs.com`, "media_provider_keys+derived", row?.id, "media_provider_keys");
        }
        for (const h of DEFAULT_HOSTS) push(key, h, "media_provider_keys+default", row?.id, "media_provider_keys");
      }
    } catch (_e) { /* table may not exist on some deployments */ }
  }

  cachedCandidates = out;
  cachedAt = now;
  return out;
}

// Back-compat: returns just one key (first candidate). Kept for any callers
// outside this file.
export async function getDashscopeKeyDirect(): Promise<string | null> {
  const list = await getDashscopeCandidates();
  return list[0]?.key ?? null;
}



const AR_TO_SIZE: Record<string, string> = {
  "1:1": "1024*1024",
  "16:9": "1280*720",
  "9:16": "720*1280",
  "4:3": "1024*768",
  "3:4": "768*1024",
  "3:2": "1024*680",
  "2:3": "680*1024",
};

const VIDEO_AR_TO_SIZE: Record<string, string> = {
  "16:9": "1280*720",
  "9:16": "720*1280",
  "1:1": "960*960",
  "4:3": "1088*832",
  "3:4": "832*1088",
};

async function pollTask(
  host: string,
  key: string,
  taskId: string,
  timeoutMs = 180_000,
): Promise<AlibabaResult> {
  const url = `https://${host}/api/v1/tasks/${taskId}`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 3000));
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = await r.json().catch(() => ({}));
    const status = data?.output?.task_status;
    if (status === "SUCCEEDED") {
      const results = data?.output?.results;
      const urls: string[] = [];
      if (Array.isArray(results)) {
        for (const it of results) {
          const u = it?.url || it?.video_url;
          if (typeof u === "string") urls.push(u);
        }
      }
      const single = data?.output?.video_url;
      if (typeof single === "string") urls.push(single);
      if (urls.length === 0) {
        return { ok: false, status: r.status, error: "no_urls_in_task_result" };
      }
      return { ok: true, urls };
    }
    if (status === "FAILED" || status === "UNKNOWN" || status === "CANCELED") {
      return {
        ok: false,
        status: r.status,
        error: `task_${status}: ${data?.output?.message || data?.message || ""}`.slice(0, 300),
      };
    }
    // PENDING / RUNNING — continue polling.
  }
  return { ok: false, error: "task_timeout" };
}

// DashScope text2image model candidates, in preference order. Different
// workspaces/regions ship different model availabilities, so we try several
// and use the first that the key is authorized for.
const IMAGE_MODEL_CANDIDATES = [
  "wan2.2-t2i-flash",     // newest Wan 2.2, widely available
  "wan2.2-t2i-plus",
  "wanx2.1-t2i-turbo",
  "wanx2.1-t2i-plus",
  "wanx-v1",              // legacy fallback
];

export async function alibabaGenerateImage(opts: {
  prompt: string;
  aspect_ratio?: string;
  n?: number;
  model?: string;
}): Promise<AlibabaResult> {
  const candidates = await getDashscopeCandidates();
  if (candidates.length === 0) return { ok: false, error: "no_dashscope_key" };

  const size = AR_TO_SIZE[opts.aspect_ratio || "1:1"] || "1024*1024";
  const n = Math.max(1, Math.min(4, opts.n || 1));
  const modelCandidates = opts.model
    ? [opts.model, ...IMAGE_MODEL_CANDIDATES.filter((m) => m !== opts.model)]
    : IMAGE_MODEL_CANDIDATES;

  let lastErr: AlibabaResult = { ok: false, error: "no_attempt" };
  for (const cand of candidates) {
    for (const model of modelCandidates) {
      const body = {
        model,
        input: { prompt: opts.prompt.slice(0, 4000) },
        parameters: { size, n },
      };
      try {
        const r = await fetch(
          `https://${cand.host}/api/v1/services/aigc/text2image/image-synthesis`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${cand.key}`,
              "Content-Type": "application/json",
              "X-DashScope-Async": "enable",
            },
            body: JSON.stringify(body),
          },
        );
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          const errStr = JSON.stringify(data);
          lastErr = {
            ok: false,
            status: r.status,
            error: `${model}@${cand.host}[${cand.source}]: ${data?.code || "http"}: ${data?.message || r.statusText}`.slice(0, 300),
          };
          await recordKeyOutcome(cand, { ok: false, model, status: r.status, error: lastErr.error });
          // Auth/region mismatch → skip remaining models for this key+host pair.
          if (r.status === 401 || r.status === 403 || /InvalidApiKey|AccessDenied/i.test(errStr)) break;
          // Model-not-available → try next model on same key+host.
          if (/Model not exist|ModelNotExist|InvalidParameter|Unsupported|ResourceNotFound/i.test(errStr)) continue;
          // Other errors → skip remaining models for this key+host.
          break;
        }
        const taskId = data?.output?.task_id;
        if (!taskId) {
          lastErr = { ok: false, error: `${model}@${cand.host}: no_task_id_returned` };
          await recordKeyOutcome(cand, { ok: false, model, error: lastErr.error });
          continue;
        }
        const polled = await pollTask(cand.host, cand.key, taskId);
        await recordKeyOutcome(cand, { ok: polled.ok, model, status: polled.status, error: polled.error });
        if (polled.ok) return polled;
        lastErr = polled;
        continue;
      } catch (e) {
        lastErr = { ok: false, error: e instanceof Error ? e.message : String(e) };
        await recordKeyOutcome(cand, { ok: false, model, error: lastErr.error });
      }
    }
  }
  return lastErr;
}




const VIDEO_T2V_CANDIDATES = [
  "wan2.7-t2v",
  "wan2.5-t2v-preview",
  "wan2.2-t2v-plus",
  "wan2.2-t2v-flash",
  "wanx2.1-t2v-turbo",
  "wanx2.1-t2v-plus",
];

const VIDEO_I2V_CANDIDATES = [
  "wan2.7-i2v",
  "wan2.5-i2v-preview",
  "wan2.2-i2v-plus",
  "wan2.2-i2v-flash",
  "wanx2.1-i2v-turbo",
  "wanx2.1-i2v-plus",
];

export async function alibabaGenerateVideo(opts: {
  prompt: string;
  aspect_ratio?: string;
  duration?: number;
  start_frame?: string | null;
  model?: string;
}): Promise<AlibabaResult> {
  const candidates = await getDashscopeCandidates();
  if (candidates.length === 0) return { ok: false, error: "no_dashscope_key" };

  const hasStart = typeof opts.start_frame === "string" && opts.start_frame.length > 0;
  const size = VIDEO_AR_TO_SIZE[opts.aspect_ratio || "16:9"] || "1280*720";
  const duration = Math.max(3, Math.min(8, opts.duration || 5));

  const baseList = hasStart ? VIDEO_I2V_CANDIDATES : VIDEO_T2V_CANDIDATES;
  const modelCandidates = opts.model
    ? [opts.model, ...baseList.filter((m) => m !== opts.model)]
    : baseList;

  const endpoint = hasStart
    ? "/api/v1/services/aigc/image2video/video-synthesis"
    : "/api/v1/services/aigc/text2video/video-synthesis";

  let lastErr: AlibabaResult = { ok: false, error: "no_attempt" };
  for (const cand of candidates) {
    for (const model of modelCandidates) {
      const isWan27 = model.startsWith("wan2.7-");
      const isWan25 = model.startsWith("wan2.5-");
      const input: Record<string, unknown> = { prompt: opts.prompt.slice(0, 4000) };
      if (hasStart) {
        if (isWan27) input.media = [{ type: "first_frame", url: opts.start_frame }];
        else input.img_url = opts.start_frame;
      }
      const parameters = isWan27 || isWan25
        ? { resolution: "720P", ratio: opts.aspect_ratio || "16:9", duration }
        : { size };
      const body = { model, input, parameters };
      try {
        const path = isWan27 || isWan25
          ? "/api/v1/services/aigc/video-generation/video-synthesis"
          : endpoint;
        const r = await fetch(`https://${cand.host}${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cand.key}`,
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",
          },
          body: JSON.stringify(body),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          const errStr = JSON.stringify(data);
          lastErr = {
            ok: false,
            status: r.status,
            error: `${model}@${cand.host}[${cand.source}]: ${data?.code || "http"}: ${data?.message || r.statusText}`.slice(0, 300),
          };
          await recordKeyOutcome(cand, { ok: false, model, status: r.status, error: lastErr.error });
          if (r.status === 401 || r.status === 403 || /InvalidApiKey|AccessDenied/i.test(errStr)) break;
          if (/Model not exist|ModelNotExist|InvalidParameter|Unsupported|ResourceNotFound/i.test(errStr)) continue;
          break;
        }
        const taskId = data?.output?.task_id;
        if (!taskId) {
          lastErr = { ok: false, error: `${model}@${cand.host}: no_task_id_returned` };
          await recordKeyOutcome(cand, { ok: false, model, error: lastErr.error });
          continue;
        }
        // Videos can take up to ~3 minutes; bump the timeout.
        const polled = await pollTask(cand.host, cand.key, taskId, 240_000);
        await recordKeyOutcome(cand, { ok: polled.ok, model, status: polled.status, error: polled.error });
        if (polled.ok) return polled;
        lastErr = polled;
        continue;
      } catch (e) {
        lastErr = { ok: false, error: e instanceof Error ? e.message : String(e) };
        await recordKeyOutcome(cand, { ok: false, model, error: lastErr.error });
      }
    }
  }
  return lastErr;
}


