/** @doc Provider fallback chain: try a list of providers in order with per-call timeout; advance on timeout/error. */
// Use this to wrap any model call so a single provider's outage or slowness
// never kills a long-running job. The wrapper records every failure via the
// caller-supplied onError hook (typically wired to DurableCtx.recordProviderError).

export interface ProviderAttempt<T> {
  name: string;
  /** Maximum time to wait for this provider before moving on. */
  timeoutMs?: number;
  run: (signal: AbortSignal) => Promise<T>;
}

export interface FallbackOptions {
  /** Default per-provider timeout when an attempt doesn't set its own. */
  defaultTimeoutMs?: number;
  /** Called for each provider failure (also when it times out). */
  onError?: (provider: string, error: unknown) => void | Promise<void>;
  /** Abort the whole chain (user cancel etc). */
  signal?: AbortSignal;
}

export class ProviderChainError extends Error {
  constructor(public errors: Array<{ provider: string; error: string }>) {
    super(
      `All providers failed: ${errors.map((e) => `${e.provider}=${e.error}`).join("; ")}`,
    );
    this.name = "ProviderChainError";
  }
}

export async function runWithFallback<T>(
  attempts: ProviderAttempt<T>[],
  opts: FallbackOptions = {},
): Promise<{ provider: string; result: T }> {
  const errors: Array<{ provider: string; error: string }> = [];
  const defaultTimeout = opts.defaultTimeoutMs ?? 120_000;

  for (const attempt of attempts) {
    if (opts.signal?.aborted) throw new Error("aborted");
    const ac = new AbortController();
    const onParentAbort = () => ac.abort();
    opts.signal?.addEventListener("abort", onParentAbort, { once: true });
    const timeout = attempt.timeoutMs ?? defaultTimeout;
    const timer = setTimeout(() => ac.abort(new Error(`timeout after ${timeout}ms`)), timeout);
    try {
      const result = await attempt.run(ac.signal);
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onParentAbort);
      return { provider: attempt.name, result };
    } catch (e) {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onParentAbort);
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ provider: attempt.name, error: msg });
      try {
        await opts.onError?.(attempt.name, e);
      } catch {
        /* ignore reporter errors */
      }
      // continue to next provider
    }
  }
  throw new ProviderChainError(errors);
}
