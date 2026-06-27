// Alibaba DashScope provider — Qwen-Image (text2image / image-edit) and
// Wan2.2 video (text-to-video / image-to-video). All keys come from the
// shared api_keys pool (service = 'alibaba') with rotation; falls back to
// env DASHSCOPE_API_KEY for local dev.
//
// Uses the international endpoint (dashscope-intl) by default. Set
// DASHSCOPE_REGION=cn to switch to the mainland endpoint.

import { pickKey, recordUsage } from "../key-pool.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export class AlibabaError extends Error {
  status: number;
  constructor(msg: string, status = 500) {
    super(msg);
    this.status = status;
  }
}

function defaultBaseUrl(): string {
  const region = (Deno.env.get("DASHSCOPE_REGION") || "intl").toLowerCase();
  return region === "cn"
    ? "https://dashscope.aliyuncs.com/api/v1"
    : "https://dashscope-intl.aliyuncs.com/api/v1";
}

/** Build the base URL for a given key: uses its endpoint_host (sub-workspace
 *  keys with custom maas endpoint) when set, otherwise the global default. */
function baseUrlFor(host?: string | null): string {
  if (host && host.trim()) {
    const clean = host.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return `https://${clean}/api/v1`;
  }
  return defaultBaseUrl();
}

/** Extract the workspace_id segment from an sk-ws-* key (everything between
 *  "sk-ws-" and the first dot). Returns null for non-workspace keys. */
function workspaceIdFromKey(apiKey: string): string | null {
  if (!apiKey || !apiKey.startsWith("sk-ws-")) return null;
  const rest = apiKey.slice("sk-ws-".length);
  const ws = rest.split(".")[0];
  return ws && ws.length > 0 ? `ws-${ws}` : null;
  // Note: Alibaba workspace ids are conventionally prefixed "ws-" when used
  // as a subdomain (ws-XXXX.<region>.maas.aliyuncs.com). The key itself uses
  // "sk-ws-<id>..." so we re-prepend "ws-" for endpoint host construction.
}

/** Regions where sub-workspace MaaS endpoints are exposed. Tried in order
 *  until one returns a non-auth response, then cached on the key row. */
const MAAS_REGIONS = [
  "ap-southeast-1",   // Singapore
  "cn-beijing",       // Beijing
  "cn-shanghai",      // Shanghai
  "cn-hangzhou",      // Hangzhou
  "cn-shenzhen",      // Shenzhen
  "ap-northeast-1",   // Tokyo
  "us-east-1",        // Virginia
];

/** Look up endpoint_host AND workspace_id for a given api_key
 *  (alibaba_keys first, then media_provider_keys). */
async function lookupKeyMeta(apiKey: string): Promise<{ host: string | null; workspaceId: string | null }> {
  let host: string | null = null;
  let workspaceId: string | null = null;
  try {
    const c = adminClient();
    if (c) {
      const { data: a } = await c.from("alibaba_keys").select("endpoint_host, workspace_id").eq("api_key", apiKey).maybeSingle();
      if (a?.endpoint_host) host = a.endpoint_host as string;
      if ((a as any)?.workspace_id) workspaceId = (a as any).workspace_id as string;
      if (!host || !workspaceId) {
        const { data: m } = await c.from("media_provider_keys").select("endpoint_host").eq("api_key", apiKey).maybeSingle();
        if (!host && m?.endpoint_host) host = m.endpoint_host as string;
      }
    }
  } catch (_e) { /* noop */ }
  if (!workspaceId) workspaceId = workspaceIdFromKey(apiKey);
  return { host, workspaceId };
}

let _adminCache: ReturnType<typeof createClient> | null = null;
function adminClient() {
  if (_adminCache) return _adminCache;
  const url = Deno.env.get("SUPABASE_URL");
  const sk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !sk) return null;
  _adminCache = createClient(url, sk, { auth: { persistSession: false } });
  return _adminCache;
}

/** Return all distinct candidate hosts to try for a sub-workspace key,
 *  pulled from any row in alibaba_keys / media_provider_keys. Cached briefly. */
let _hostsCache: { hosts: string[]; at: number } | null = null;
async function listKnownHosts(): Promise<string[]> {
  if (_hostsCache && Date.now() - _hostsCache.at < 60_000) return _hostsCache.hosts;
  const c = adminClient();
  if (!c) return [];
  const set = new Set<string>();
  try {
    const { data: a } = await c.from("alibaba_keys").select("endpoint_host").not("endpoint_host", "is", null);
    (a || []).forEach((r: any) => r?.endpoint_host && set.add(String(r.endpoint_host)));
    const { data: m } = await c.from("media_provider_keys").select("endpoint_host").not("endpoint_host", "is", null);
    (m || []).forEach((r: any) => r?.endpoint_host && set.add(String(r.endpoint_host)));
  } catch (_e) { /* noop */ }
  const hosts = Array.from(set);
  _hostsCache = { hosts, at: Date.now() };
  return hosts;
}

/** Persist the discovered working host on the key row so future calls go direct. */
async function rememberHost(apiKey: string, host: string): Promise<void> {
  const c = adminClient();
  if (!c) return;
  try {
    await c.from("alibaba_keys").update({ endpoint_host: host }).eq("api_key", apiKey);
    await c.from("media_provider_keys").update({ endpoint_host: host }).eq("api_key", apiKey);
    _hostsCache = null;
  } catch (_e) { /* noop */ }
}


async function dsFetch(
  path: string,
  init: RequestInit,
  apiKey: string,
  async_ = true,
  host?: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) || {}),
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (async_) headers["X-DashScope-Async"] = "enable";
  return fetch(`${baseUrlFor(host)}${path}`, { ...init, headers });
}

/** Resolve a DashScope key — DB-only with rotation. Includes workspace_id. */
export async function getAlibabaKey(): Promise<
  { id: string | null; api_key: string; endpoint_host?: string | null; workspace_id?: string | null } | null
> {
  const pick = await pickKey("alibaba" as any);
  if (pick) {
    const meta = await lookupKeyMeta(pick.api_key);
    return { ...pick, endpoint_host: meta.host, workspace_id: meta.workspaceId };
  }
  const mediaPick = await pickKey("media" as any);
  if (mediaPick) {
    const meta = await lookupKeyMeta(mediaPick.api_key);
    return { ...mediaPick, endpoint_host: meta.host, workspace_id: meta.workspaceId };
  }
  return null;
}

/** Try a candidate list of hosts for the given key, returning the first
 *  response that is NOT an auth failure (401/403/invalid_api_key).
 *  Candidates: preferred host → all known hosts → auto-generated per-region
 *  sub-workspace hosts (from workspace_id) → global defaults. */
async function dsFetchWithDiscovery(
  path: string,
  init: RequestInit,
  apiKey: string,
  async_: boolean,
  preferredHost?: string | null,
  workspaceId?: string | null,
): Promise<{ res: Response; host: string | null }> {
  const ws = workspaceId || workspaceIdFromKey(apiKey);

  const ordered: Array<string | null> = [];
  const pushUnique = (h: string | null) => { if (!ordered.includes(h)) ordered.push(h); };

  if (preferredHost) pushUnique(preferredHost);
  // Global intl/cn endpoints (null = defaultBaseUrl from env).
  pushUnique(null);
  pushUnique("dashscope-intl.aliyuncs.com");
  pushUnique("dashscope.aliyuncs.com");
  // Other known hosts learned from previous calls.
  for (const h of await listKnownHosts()) pushUnique(h);
  // Auto-generated per-region sub-workspace endpoints.
  if (ws) {
    for (const region of MAAS_REGIONS) {
      pushUnique(`${ws}.${region}.maas.aliyuncs.com`);
    }
  }

  let lastRes: Response | null = null;
  let lastHost: string | null = preferredHost ?? null;
  for (const h of ordered) {
    const res = await dsFetch(path, { ...init, body: init.body }, apiKey, async_, h);
    if (res.status !== 401 && res.status !== 403 && res.status !== 404) {
      if (h && h !== preferredHost) {
        rememberHost(apiKey, h).catch(() => {});
      }
      return { res, host: h };
    }
    try { await res.text(); } catch (_e) { /* noop */ }
    lastRes = res;
    lastHost = h;
  }
  return { res: lastRes!, host: lastHost };
}

/** Submit a task and return the task_id (raises AlibabaError on failure). */
async function submitTask(path: string, body: unknown, apiKey: string, host?: string | null): Promise<string> {
  const { res: r } = await dsFetchWithDiscovery(
    path,
    { method: "POST", body: JSON.stringify(body) },
    apiKey,
    true,
    host,
  );
  if (!r.ok) {
    const text = await r.text();
    throw new AlibabaError(`dashscope_submit:${r.status}:${text.slice(0, 300)}`, r.status);
  }
  const j = await r.json().catch(() => ({}));
  const taskId = j?.output?.task_id;
  if (!taskId) throw new AlibabaError(`no_task_id:${JSON.stringify(j).slice(0, 200)}`, 502);
  return taskId;
}



export interface AlibabaPollResult {
  status: "pending" | "complete" | "failed";
  urls?: string[];
  videoUrl?: string;
  error?: string;
}

/** Poll a task once. Use repeatedly with backoff in callers. */
export async function alibabaPollOnce(taskId: string, apiKey: string, host?: string | null): Promise<AlibabaPollResult> {
  const { res: r } = await dsFetchWithDiscovery(
    `/tasks/${taskId}`,
    { method: "GET" },
    apiKey,
    false,
    host,
  );
  if (!r.ok) {
    const text = await r.text();
    if (r.status === 404) return { status: "failed", error: "task_not_found" };
    throw new AlibabaError(`poll:${r.status}:${text.slice(0, 200)}`, r.status);
  }

  const j = await r.json().catch(() => ({}));
  const s = j?.output?.task_status;
  if (s === "SUCCEEDED") {
    const out = j.output;
    const results = (out?.results || []) as any[];
    const urls = results.map((x: any) => x.url).filter(Boolean);
    const videoUrl: string | undefined = out?.video_url || urls[0];
    return { status: "complete", urls, videoUrl };
  }
  if (s === "FAILED" || s === "UNKNOWN") {
    return { status: "failed", error: j?.output?.message || s || "task_failed" };
  }
  return { status: "pending" };
}


/* ============================ IMAGE ============================ */

export interface AlibabaImageParams {
  prompt: string;
  /** "qwen-image-plus" (t2i) or "qwen-image-edit" (i2i) */
  model: string;
  size?: string; // e.g. "1024*1024"
  n?: number;
  seed?: number;
  negative_prompt?: string;
  refImageUrl?: string; // for qwen-image-edit
}

export async function alibabaSubmitImage(p: AlibabaImageParams, apiKey: string, host?: string | null): Promise<string> {
  const isEdit = !!p.refImageUrl;
  const path = isEdit
    ? "/services/aigc/image2image/image-synthesis"
    : "/services/aigc/text2image/image-synthesis";

  const input: Record<string, unknown> = { prompt: p.prompt };
  if (p.negative_prompt) input.negative_prompt = p.negative_prompt;
  if (isEdit) input.base_image_url = p.refImageUrl;

  const parameters: Record<string, unknown> = {
    n: Math.min(4, Math.max(1, p.n ?? 1)),
    size: p.size || "1024*1024",
  };
  if (p.seed !== undefined) parameters.seed = p.seed;

  return submitTask(path, { model: p.model, input, parameters }, apiKey, host);
}

/** Full sync image generation with key rotation + bounded polling. */
export async function alibabaGenerateImage(
  p: AlibabaImageParams,
  opts: { maxWaitMs?: number; maxKeys?: number } = {},
): Promise<{ urls: string[]; keyId: string | null }> {
  const maxWaitMs = opts.maxWaitMs ?? 90_000;
  const maxKeys = opts.maxKeys ?? 3;
  let lastErr: AlibabaError | null = null;

  const tried = new Set<string>();
  for (let attempt = 0; attempt < maxKeys; attempt++) {
    const k = await getAlibabaKey();
    if (!k) throw new AlibabaError("no_alibaba_key", 503);
    const id = k.id || "_env_";
    if (tried.has(id)) break;
    tried.add(id);

    try {
      const taskId = await alibabaSubmitImage(p, k.api_key, k.endpoint_host);
      const deadline = Date.now() + maxWaitMs;
      while (Date.now() < deadline) {
        const res = await alibabaPollOnce(taskId, k.api_key, k.endpoint_host);
        if (res.status === "complete") {
          if (k.id) await recordUsage(k.id, 0, true, 200).catch(() => {});
          return { urls: res.urls ?? [], keyId: k.id };
        }
        if (res.status === "failed") {
          throw new AlibabaError(res.error || "task_failed", 502);
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
      throw new AlibabaError("task_timeout", 504);
    } catch (e) {
      lastErr = e instanceof AlibabaError ? e : new AlibabaError(String(e), 500);
      if (k.id) await recordUsage(k.id, 0, false, lastErr.status, lastErr.message).catch(() => {});
      // Only rotate on auth/quota errors.
      if (![401, 402, 403, 429].includes(lastErr.status)) throw lastErr;
    }
  }
  throw lastErr ?? new AlibabaError("all_keys_failed", 503);
}


/* ============================ VIDEO ============================ */

export interface AlibabaVideoParams {
  prompt: string;
  /** "wan2.2-t2v-plus" (t2v) or "wan2.2-i2v-plus" (i2v) */
  model: string;
  image_url?: string;
  size?: string; // e.g. "1280*720"
  duration?: number; // seconds
  seed?: number;
}

export async function alibabaSubmitVideo(p: AlibabaVideoParams, apiKey: string, host?: string | null): Promise<string> {
  const path = "/services/aigc/video-generation/video-synthesis";
  const input: Record<string, unknown> = { prompt: p.prompt };
  if (p.image_url) input.img_url = p.image_url;
  const parameters: Record<string, unknown> = {};
  if (p.size) parameters.size = p.size;
  if (p.duration) parameters.duration = p.duration;
  if (p.seed !== undefined) parameters.seed = p.seed;
  return submitTask(path, { model: p.model, input, parameters }, apiKey, host);
}

