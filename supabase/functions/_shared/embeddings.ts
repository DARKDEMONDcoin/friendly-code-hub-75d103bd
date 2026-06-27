// Shared helper to generate embeddings via Alibaba DashScope text-embedding-v4.
// Uses the same DashScope key resolver as chat (getDashscopeKey).
import { getDashscopeKey } from "./llm-router.ts";

const DASHSCOPE_EMBEDDINGS_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/embeddings";

export const EMBED_MODEL = "text-embedding-v4";
export const EMBED_DIMS = 1024;

// Module-level circuit breaker: once DashScope says the free tier is exhausted
// (or the key is unauthorized), stop calling the API for the rest of this isolate's
// lifetime. Otherwise every chat message floods edge-function logs and adds latency
// while still failing. Memory features that depend on embeddings degrade gracefully.
let embeddingsDisabledUntil = 0;
function embeddingsDisabled(): boolean {
  return Date.now() < embeddingsDisabledUntil;
}
function tripBreaker(minutes: number) {
  embeddingsDisabledUntil = Date.now() + minutes * 60_000;
}

export interface EmbedResult {
  embeddings: number[][];
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

/** Generate embeddings for one or more strings. Returns same order as input.
 *  DashScope caps batch size at 10, so we chunk automatically. */
export async function embedTexts(inputs: string[]): Promise<EmbedResult> {
  const trimmed = inputs.map((s) => (s ?? "").toString().trim()).filter((s) => s.length > 0);
  if (trimmed.length === 0) return { embeddings: [] };
  if (embeddingsDisabled()) return { embeddings: [] };

  const creds = await getDashscopeKey();
  if (!creds) return { embeddings: [] };

  const BATCH = 10;
  const all: number[][] = [];
  let totalTokens = 0;
  for (let i = 0; i < trimmed.length; i += BATCH) {
    const slice = trimmed.slice(i, i + BATCH);
    const r = await fetch(DASHSCOPE_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: slice,
        dimensions: EMBED_DIMS,
        encoding_format: "float",
      }),
    });
    const data = await r.json().catch(() => ({}) as any);
    if (!r.ok) {
      const msg: string = data?.error?.message || JSON.stringify(data).slice(0, 200);
      // Trip breaker on permanent / quota errors so we stop hammering the API.
      // 401/403 = bad key; 429 = rate/quota; "free tier" message from DashScope.
      const isQuota =
        r.status === 401 ||
        r.status === 403 ||
        r.status === 429 ||
        /free tier|exhaust|quota|insufficient/i.test(msg);
      if (isQuota) {
        tripBreaker(60); // pause for 1h
        console.warn(`[embeddings] disabled for 60min: ${r.status} ${msg.slice(0, 120)}`);
      } else {
        console.warn(`[embeddings] transient ${r.status}: ${msg.slice(0, 120)}`);
      }
      return { embeddings: [] };
    }
    const part: number[][] = (data?.data ?? [])
      .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
      .map((d: any) => d.embedding as number[]);
    all.push(...part);
    totalTokens += data?.usage?.total_tokens ?? 0;
  }
  return { embeddings: all, usage: { total_tokens: totalTokens } };
}

/** Convenience for a single string. Returns null when embeddings are unavailable. */
export async function embedText(input: string): Promise<number[] | null> {
  const { embeddings } = await embedTexts([input]);
  return embeddings[0] ?? null;
}

/** Convert a number[] into the Postgres `vector` literal string. */
export function toPgVector(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
