// Runbase.net key pool + API client with automatic rotation.
// Used by media-image, media-video, and media-video-poll.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = () => createClient(SUPABASE_URL, SERVICE_KEY);

export const RUNBASE_BASE = "https://runbase.net/api/v1";

export type RunbaseKey = { id: string; api_key: string };

// Map legacy frontend model_slug → Runbase canonical model id.
// Anything containing "/" is passed through as-is.
const MODEL_ALIAS: Record<string, string> = {
  // Images
  "nano-banana": "google/nano-banana",
  "nano-banana-2": "google/nano-banana-2",
  "nano-banana-pro": "google/nano-banana-pro",
  "ws-nano-banana": "google/nano-banana",
  "ws-nano-banana-2": "google/nano-banana-2",
  "ws-nano-banana-pro": "google/nano-banana-pro",
  "gpt-image-1": "openai/gpt-image-1",
  "gpt-image-1.5": "openai/gpt-image-1.5",
  "gpt-image-2": "openai/gpt-image-2",
  "ws-gpt-image-1": "openai/gpt-image-1",
  "ws-gpt-image-2": "openai/gpt-image-2",
  "seedream-4.5": "bytedance/seedream-4.5",
  "seedream-5-lite": "bytedance/seedream-5-lite",
  "ws-seedream-4.5": "bytedance/seedream-4.5",
  "ws-seedream-5-lite": "bytedance/seedream-5-lite",
  "ws-z-image": "z-image/base",
  "qwen-image-2.0": "bytedance/seedream-5-lite",
  "qwen-image-2.0-pro": "bytedance/seedream-4.5",
  // Videos
  "seedance-2": "bytedance/seedance-2.0",
  "seedance-2-0": "bytedance/seedance-2.0",
  "seedance-2-0-fast": "bytedance/seedance-2.0",
  "rb-seedance-2": "bytedance/seedance-2.0",
  "seedance-2.0": "bytedance/seedance-2.0",
  "ws-seedance-2.0": "bytedance/seedance-2.0",
  "kling-2.0": "kling/kling-2.0",
  "kling-2.1": "kling/kling-2.1",
  "veo-3.1-fast": "google/veo-3.1-fast",
  "ws-veo-3.1-fast": "google/veo-3.1-fast",
  "hailuo-02": "hailuo/hailuo-02",
  "hailuo-pro": "hailuo/hailuo-pro",
};

export function resolveRunbaseModel(slug: string | undefined | null): string | null {
  if (!slug) return null;
  const s = String(slug).trim();
  if (!s) return null;
  if (s.includes("/")) return s;
  return MODEL_ALIAS[s] || null;
}

export async function pickRunbaseKey(): Promise<RunbaseKey | null> {
  const { data } = await sb()
    .from("runbase_keys")
    .select("id,api_key")
    .eq("status", "active")
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  return { id: row.id as string, api_key: row.api_key as string };
}

export async function markRunbaseUsed(id: string) {
  await sb()
    .from("runbase_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", id);
}

function classifyError(status: number, body: any): "auth" | "exhausted" | "transient" | "other" {
  const msg = (typeof body === "string" ? body : JSON.stringify(body || {})).toLowerCase();
  if (status === 401 || status === 403 || /invalid.*key|unauthor|forbidden|revoked|disabled/.test(msg)) return "auth";
  if (status === 402 || /insufficient|balance|quota|credit|exhaust|payment.required/.test(msg)) return "exhausted";
  if (status === 429 || status >= 500) return "transient";
  return "other";
}

export async function markRunbaseFailure(id: string, status: number, body: any): Promise<"rotate" | "stop"> {
  const kind = classifyError(status, body);
  const patch: Record<string, unknown> = {
    failure_count: (await currentFailureCount(id)) + 1,
    last_error: `${status}: ${typeof body === "string" ? body : JSON.stringify(body).slice(0, 500)}`,
  };
  if (kind === "auth") {
    patch.status = "blocked";
    patch.blocked_reason = "auth_invalid";
  } else if (kind === "exhausted") {
    patch.status = "exhausted";
    patch.blocked_reason = "insufficient_balance";
  }
  await sb().from("runbase_keys").update(patch).eq("id", id);
  // rotate on auth/exhausted/transient — try another key.
  return kind === "other" ? "stop" : "rotate";
}

async function currentFailureCount(id: string): Promise<number> {
  const { data } = await sb().from("runbase_keys").select("failure_count").eq("id", id).maybeSingle();
  return Number(data?.failure_count ?? 0);
}

// --- HTTP calls ---

async function runbaseFetch(path: string, key: string, init?: RequestInit) {
  return fetch(`${RUNBASE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
}

export type RunbaseRun = {
  id: string;
  status: "pending" | "running" | "succeeded" | "failed" | string;
  output?: { urls?: string[]; url?: string };
  error?: string;
  costUsd?: number;
};

// Create a run, rotating keys on auth/quota/transient failures.
export async function createRunbaseRun(model: string, input: Record<string, unknown>): Promise<
  | { ok: true; run: RunbaseRun; keyId: string }
  | { ok: false; status: number; error: any }
> {
  const tried = new Set<string>();
  let lastStatus = 500;
  let lastErr: any = { error: "no_runbase_keys" };
  for (let attempt = 0; attempt < 5; attempt++) {
    const k = await pickRunbaseKey();
    if (!k || tried.has(k.id)) break;
    tried.add(k.id);
    const r = await runbaseFetch("/runs", k.api_key, {
      method: "POST",
      body: JSON.stringify({ model, input }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data?.id) {
      await markRunbaseUsed(k.id);
      return { ok: true, run: data as RunbaseRun, keyId: k.id };
    }
    lastStatus = r.status;
    lastErr = data;
    const decision = await markRunbaseFailure(k.id, r.status, data);
    if (decision === "stop") break;
  }
  return { ok: false, status: lastStatus, error: lastErr };
}

export async function getRunbaseRun(runId: string, keyId?: string | null): Promise<
  | { ok: true; run: RunbaseRun }
  | { ok: false; status: number; error: any }
> {
  // Prefer the same key that created the run; fall back to any active key.
  let key: RunbaseKey | null = null;
  if (keyId) {
    const { data } = await sb().from("runbase_keys").select("id,api_key").eq("id", keyId).maybeSingle();
    if (data) key = { id: data.id as string, api_key: data.api_key as string };
  }
  if (!key) key = await pickRunbaseKey();
  if (!key) return { ok: false, status: 500, error: { error: "no_runbase_keys" } };
  const r = await runbaseFetch(`/runs/${encodeURIComponent(runId)}`, key.api_key);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, error: data };
  return { ok: true, run: data as RunbaseRun };
}

// Synchronously create + poll a run until it finishes (for images).
export async function runbaseGenerateSync(
  model: string,
  input: Record<string, unknown>,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<
  | { ok: true; urls: string[]; raw: RunbaseRun }
  | { ok: false; status: number; error: any }
> {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const intervalMs = opts.intervalMs ?? 1500;
  const created = await createRunbaseRun(model, input);
  if (!created.ok) return created;
  let runId = created.run.id;
  let keyId = created.keyId;
  let run = created.run;
  while (Date.now() - start < timeoutMs) {
    if (run.status === "succeeded") {
      const urls = run.output?.urls || (run.output?.url ? [run.output.url] : []);
      if (urls.length) return { ok: true, urls, raw: run };
      return { ok: false, status: 502, error: { error: "no_output_urls", raw: run } };
    }
    if (run.status === "failed") {
      return { ok: false, status: 502, error: { error: run.error || "runbase_failed", raw: run } };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    const g = await getRunbaseRun(runId, keyId);
    if (!g.ok) return g;
    run = g.run;
  }
  return { ok: false, status: 504, error: { error: "runbase_timeout" } };
}

export async function hasRunbaseKeys(): Promise<boolean> {
  const k = await pickRunbaseKey();
  return !!k;
}