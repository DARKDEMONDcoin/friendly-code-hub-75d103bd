/** @doc Translates arbitrary site content (Docs, marketing, legal, FAQ) into all 25 supported languages using Alibaba Qwen-Max, caching results in i18n_translations. */
// i18n-translate
// ─────────────────────────────────────────────────────────────────────────────
// Generic, brand-aware batch translator. Mirrors the proven blog-translate
// pattern but works on ARBITRARY key/value content (Docs sections, marketing
// landing copy, legal pages, FAQ, etc.) and persists each translated value
// into public.i18n_translations keyed by (entry_key, language).
//
// Request:
//   POST  { namespace: "docs" | "marketing" | "legal" | ...,
//           language: "ar",
//           entries: [{ key: "docs:chat:intro", value: <string|object> }],
//           force?: boolean }
//
// Behavior:
//   - For each entry compute SHA-256(source_value). If a row already exists
//     in i18n_translations with the SAME source_hash → skip (cache hit).
//   - Else translate via Qwen-Max (DashScope) → fallback Qwen-Plus → fallback
//     Lovable AI Gateway (Gemini). Save row.
//   - Preserves JSON shape: if value is an object/array we translate its
//     leaf strings only (keys, urls, hex colors, brand names left intact).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  getLLM,
  getLovableGateway,
  lovableEquivalent,
  dashscopeEquivalent,
} from "../_shared/llm-router.ts";
import { getLang } from "../_shared/blog-langs.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Hashing ────────────────────────────────────────────────────────────────
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const stable = (v: unknown): string => JSON.stringify(v, Object.keys(v as object || {}).sort());

// ─── Prompt ─────────────────────────────────────────────────────────────────
const SYSTEM = (langName: string, langCode: string) =>
  `You are a native ${langName} (${langCode}) translator specialized in SEO and product UX copy for "Megsy AI".

Rules:
- Translate fully and naturally into ${langName}; adapt idioms, never word-for-word.
- KEEP these brand/tech names untranslated (Latin letters): Megsy AI, ChatGPT, Claude, Gemini, Qwen, Midjourney, Suno, Stripe, Supabase, GitHub, Lovable, OpenAI, Anthropic, DashScope, Pipedream, Composio, Telegram, WhatsApp, Slack, Discord, iOS, Android, PWA, API, SEO, JSON, URL, FAQ, RAG, LLM, MCP.
- Preserve markdown / inline formatting EXACTLY (**, _, \`, links, lists, headings).
- Preserve placeholders like {var}, {{var}}, %s.
- Preserve URLs, file paths, hex colors (#abc123), CSS classes, numbers, emojis.
- For ${langCode === "ar" || langCode === "he" || langCode === "fa" ? "RTL" : "LTR"} script: use proper punctuation native to the language.
- Return ONE JSON object only — no commentary, no markdown fences.`;

const USER = (langName: string, langCode: string, payload: Record<string, unknown>) =>
  `Translate the values of the following JSON object into ${langName} (${langCode}).
Keep the KEYS exactly as-is. Keep numbers, URLs, hex colors, placeholders, and brand names as-is.
Return a JSON object with the SAME shape and the SAME keys, only values translated.

INPUT:
${JSON.stringify(payload, null, 2)}
`;

// ─── LLM call w/ retry + fallback chain ─────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callOnce(
  endpoint: { url: string; key: string },
  model: string,
  systemMsg: string,
  userMsg: string,
): Promise<Response> {
  return await fetch(endpoint.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${endpoint.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: userMsg },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });
}

async function callWithRetry(
  endpoint: { url: string; key: string },
  model: string,
  systemMsg: string,
  userMsg: string,
  label: string,
): Promise<Response> {
  let res = await callOnce(endpoint, model, systemMsg, userMsg);
  let attempt = 0;
  while ((res.status === 429 || res.status === 503) && attempt < 3) {
    const wait = 4000 * Math.pow(2, attempt);
    console.warn(`${label} ${res.status} → backing off ${wait}ms`);
    await sleep(wait);
    res = await callOnce(endpoint, model, systemMsg, userMsg);
    attempt++;
  }
  return res;
}

async function translatePayload(
  langCode: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const lang = getLang(langCode);
  if (!lang) throw new Error(`unknown lang ${langCode}`);
  const systemMsg = SYSTEM(lang.name, langCode);
  const userMsg = USER(lang.name, langCode, payload);

  // 1) Primary — Qwen-Max via DashScope (best Qwen for quality / SEO copy)
  const llm = await getLLM();
  let lastErr = "";
  if (llm) {
    const model =
      typeof (llm as any).mapModel === "function"
        ? (llm as any).mapModel("qwen-max")
        : dashscopeEquivalent("qwen-max");
    const r = await callWithRetry(llm, model, systemMsg, userMsg, `qwen-max ${langCode}`);
    if (r.ok) return parseJson(await r.text());
    lastErr = `qwen-max ${r.status}: ${(await r.text()).slice(0, 200)}`;
    console.warn(lastErr);

    // 2) Qwen-Plus as a cheaper retry on the same DashScope endpoint
    const r2 = await callWithRetry(
      llm,
      typeof (llm as any).mapModel === "function" ? (llm as any).mapModel("qwen-plus") : "qwen-plus",
      systemMsg,
      userMsg,
      `qwen-plus ${langCode}`,
    );
    if (r2.ok) return parseJson(await r2.text());
    lastErr = `qwen-plus ${r2.status}: ${(await r2.text()).slice(0, 200)}`;
    console.warn(lastErr);
  }

  // 3) Fallback — Lovable Gateway (Gemini) if Qwen is unavailable
  const lov = getLovableGateway();
  if (lov) {
    const r3 = await callWithRetry(
      lov,
      lovableEquivalent("qwen-max"),
      systemMsg,
      userMsg,
      `gemini ${langCode}`,
    );
    if (r3.ok) return parseJson(await r3.text());
    lastErr = `gemini ${r3.status}: ${(await r3.text()).slice(0, 200)}`;
  }

  throw new Error(`all translators failed for ${langCode}: ${lastErr}`);
}

function parseJson(raw: string): Record<string, unknown> {
  const data = JSON.parse(raw);
  const text: string = data?.choices?.[0]?.message?.content ?? "{}";
  const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Some models wrap the object — try to find the first {...} block.
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error(`bad JSON from LLM: ${cleaned.slice(0, 200)}`);
  }
}

// ─── Handler ────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: cors });
  }

  const startedAt = Date.now();
  try {
    const body = await req.json();
    const namespace: string = body.namespace || "docs";
    const language: string = body.language;
    const entries: Array<{ key: string; value: unknown }> = body.entries || [];
    const force: boolean = Boolean(body.force);

    if (!language || !getLang(language)) {
      return new Response(JSON.stringify({ error: "valid `language` required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return new Response(JSON.stringify({ error: "`entries` array required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // English: trivially store source = translation. No model call.
    if (language === "en") {
      const rows = await Promise.all(
        entries.map(async (e) => ({
          entry_key: e.key,
          language: "en",
          namespace,
          source_hash: await sha256(stable(e.value)),
          source_value: e.value as any,
          translated_value: e.value as any,
        })),
      );
      await supabase.from("i18n_translations").upsert(rows, {
        onConflict: "entry_key,language",
      });
      return Response.json(
        { ok: true, language, written: rows.length, skipped: 0, errors: [] },
        { headers: cors },
      );
    }

    // Fetch existing rows for this language to short-circuit unchanged entries.
    const keys = entries.map((e) => e.key);
    const { data: existing } = await supabase
      .from("i18n_translations")
      .select("entry_key, source_hash")
      .eq("language", language)
      .in("entry_key", keys);
    const have = new Map((existing || []).map((r: any) => [r.entry_key, r.source_hash]));

    let translated = 0;
    let skipped = 0;
    const errors: Array<{ key: string; error: string }> = [];

    // Translate sequentially to respect rate limits.
    for (const e of entries) {
      const src = stable(e.value);
      const hash = await sha256(src);
      if (!force && have.get(e.key) === hash) {
        skipped++;
        continue;
      }
      try {
        // Wrap as object so LLM returns a predictable JSON shape.
        const payload =
          typeof e.value === "object" && e.value !== null
            ? (e.value as Record<string, unknown>)
            : { value: e.value };
        const out = await translatePayload(language, payload);
        const translated_value =
          typeof e.value === "object" && e.value !== null ? out : (out as any).value;

        await supabase.from("i18n_translations").upsert(
          {
            entry_key: e.key,
            language,
            namespace,
            source_hash: hash,
            source_value: e.value as any,
            translated_value: translated_value as any,
          },
          { onConflict: "entry_key,language" },
        );
        translated++;
      } catch (err) {
        const msg = String((err as Error)?.message || err);
        console.error(`[i18n-translate] ${e.key} → ${language} failed:`, msg);
        errors.push({ key: e.key, error: msg.slice(0, 300) });
      }
    }

    // Log the run (best-effort, fire-and-forget).
    await supabase.from("i18n_sync_runs").insert({
      namespace,
      trigger: body.trigger || "api",
      entries_scanned: entries.length,
      entries_translated: translated,
      entries_skipped: skipped,
      errors: errors.length ? errors : null,
      finished_at: new Date().toISOString(),
    });

    return Response.json(
      {
        ok: true,
        language,
        scanned: entries.length,
        translated,
        skipped,
        errors,
        duration_ms: Date.now() - startedAt,
      },
      { headers: cors },
    );
  } catch (e) {
    console.error("[i18n-translate] error", e);
    return new Response(
      JSON.stringify({ error: String((e as Error)?.message || e) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
