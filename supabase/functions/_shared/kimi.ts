// Shared Kimi K2 (via Fireworks AI) chat helper for the internal agent runtime.
// OpenAI-compatible API. Supports key rotation from `api_keys` table
// (service='fireworks') with FIREWORKS_API_KEY env fallback. Auto-blocks
// keys that return 401/402.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions";

const FIREWORKS_SERVICES = new Set(["fireworks", "kimi", "moonshot"]);

function norm(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

type Admin = ReturnType<typeof createClient>;

function admin(): Admin | null {
  const url = Deno.env.get("SUPABASE_URL");
  const sr = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !sr) return null;
  return createClient(url, sr, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type KeyRow = { id: string; api_key: string; service: string };

async function listFireworksKeys(): Promise<KeyRow[]> {
  const db = admin();
  if (!db) return [];
  const { data, error } = await db
    .from("api_keys")
    .select("id, service, api_key, is_active, is_blocked")
    .limit(500);
  if (error) {
    console.error("[kimi] api_keys lookup failed:", error.message);
    return [];
  }
  const rows = (data || []).filter(
    (r: any) =>
      FIREWORKS_SERVICES.has(norm(r.service)) &&
      r.api_key &&
      r.is_active !== false &&
      r.is_blocked !== true,
  );
  return rows as KeyRow[];
}

function envKey(): string | null {
  return Deno.env.get("FIREWORKS_API_KEY") || Deno.env.get("KIMI_API_KEY") || null;
}

async function blockKey(id: string, reason: string) {
  const db = admin();
  if (!db) return;
  await db
    .from("api_keys")
    .update({
      is_blocked: true,
      block_reason: reason.slice(0, 300),
    })
    .eq("id", id);
}

async function bumpError(id: string) {
  const db = admin();
  if (!db) return;
  await db.rpc("increment_api_key_error", { key_id: id }).catch(async () => {
    // RPC may not exist — best-effort raw update
    const { data } = await db.from("api_keys").select("error_count").eq("id", id).single();
    const next = ((data as any)?.error_count ?? 0) + 1;
    await db.from("api_keys").update({ error_count: next }).eq("id", id);
  });
}

async function bumpUsage(id: string) {
  const db = admin();
  if (!db) return;
  await db.rpc("increment_api_key_usage", { key_id: id }).catch(async () => {
    const { data } = await db.from("api_keys").select("usage_count").eq("id", id).single();
    const next = ((data as any)?.usage_count ?? 0) + 1;
    await db.from("api_keys").update({ usage_count: next }).eq("id", id);
  });
}

export type KimiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function pickKimiModel(tier?: string): string {
  const t = String(tier || "").toLowerCase();
  if (t === "lite" || t === "turbo") {
    return "accounts/fireworks/models/kimi-k2p5";
  }
  // Default + pro use the latest Kimi K2.6 on Fireworks
  return "accounts/fireworks/models/kimi-k2p6";
}

export interface KimiChatOpts {
  messages: KimiMessage[];
  tier?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" } | { type: "text" };
}

async function callOnce(
  key: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; text: string; content: string }> {
  const res = await fetch(FIREWORKS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, text, content: "" };
  }
  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  return {
    ok: true,
    status: 200,
    text: "",
    content: String(content || "").trim(),
  };
}

export async function kimiChat(opts: KimiChatOpts): Promise<string> {
  const model = pickKimiModel(opts.tier);
  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.6,
    max_tokens: opts.max_tokens ?? 2048,
    stream: false,
  };
  if (opts.response_format) body.response_format = opts.response_format;

  // Try DB-pooled keys first, then env fallback
  const pool = await listFireworksKeys();
  const shuffled = pool
    .map((k) => ({ k, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.k);

  let lastErr = "";
  for (const row of shuffled) {
    const r = await callOnce(row.api_key, body);
    if (r.ok) {
      bumpUsage(row.id).catch(() => {});
      return r.content;
    }
    lastErr = `Fireworks ${r.status}: ${r.text.slice(0, 300)}`;
    bumpError(row.id).catch(() => {});
    if (r.status === 401 || r.status === 402 || r.status === 403) {
      blockKey(row.id, `auto-blocked (${r.status})`).catch(() => {});
    }
    // For 429/5xx try next key
  }

  const env = envKey();
  if (env) {
    const r = await callOnce(env, body);
    if (r.ok) return r.content;
    lastErr = `Fireworks ${r.status}: ${r.text.slice(0, 300)}`;
  }

  if (!pool.length && !env) {
    throw new Error(
      "No Fireworks/Kimi API key configured. Add one to api_keys (service='fireworks') via the Telegram bot, or set FIREWORKS_API_KEY.",
    );
  }
  throw new Error(lastErr || "Kimi call failed");
}

export async function kimiJson<T = unknown>(opts: KimiChatOpts): Promise<T> {
  const text = await kimiChat({
    ...opts,
    response_format: { type: "json_object" },
  });
  // Try to extract JSON if model wrapped it
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  const raw = jsonMatch ? jsonMatch[0] : trimmed;
  return JSON.parse(raw) as T;
}
