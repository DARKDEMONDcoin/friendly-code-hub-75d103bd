/** @doc Durable execution helpers: automatic heartbeat loop, checkpointing, and resume support on top of background_jobs. */
// Builds on top of `_shared/jobs.ts`. Use `runDurable` instead of
// `runInBackground` for any long-running task that must survive edge function
// restarts. It:
//   - emits a heartbeat every 10s automatically
//   - exposes ctx.checkpoint(stage, data) so retries can resume mid-flight
//   - reads previous checkpoint on retries (attempt > 0)
//   - records provider errors into provider_errors JSONB
//
// Used together with `jobs-watchdog` which re-queues stale jobs and increments
// `attempt`.

import { admin, JobWriter, type JobRow } from "./jobs.ts";

const HEARTBEAT_MS = 10_000;

export interface DurableCtx {
  writer: JobWriter;
  jobId: string;
  attempt: number;
  /** Last persisted checkpoint payload, or `{}` on first run. */
  checkpoint: Record<string, unknown>;
  /** Persist a checkpoint so a retry can resume from this stage. */
  setCheckpoint: (stage: string, data?: Record<string, unknown>) => Promise<void>;
  /** Force an immediate heartbeat (in addition to the 10s loop). */
  heartbeat: () => Promise<void>;
  /** Append a provider failure to provider_errors[]. */
  recordProviderError: (provider: string, error: unknown) => Promise<void>;
}

export async function loadJob(jobId: string): Promise<JobRow & {
  attempt: number;
  checkpoint: Record<string, unknown>;
  resumable: boolean;
} | null> {
  const sb = admin();
  const { data } = await sb
    .from("background_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  return (data as any) ?? null;
}

/** Run fn with automatic heartbeat + checkpoint helpers. */
export function runDurable(
  jobId: string,
  runner: string,
  fn: (ctx: DurableCtx) => Promise<void>,
): void {
  const writer = new JobWriter(jobId);
  const sb = admin();

  const beat = setInterval(() => {
    sb.from("background_jobs")
      .update({ last_heartbeat_at: new Date().toISOString() })
      .eq("id", jobId)
      .then(() => {}, () => {});
  }, HEARTBEAT_MS);

  const task = (async () => {
    try {
      const row = await loadJob(jobId);
      const attempt = row?.attempt ?? 0;
      const checkpoint = (row?.checkpoint as Record<string, unknown>) ?? {};
      await sb
        .from("background_jobs")
        .update({
          runner,
          last_heartbeat_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      const ctx: DurableCtx = {
        writer,
        jobId,
        attempt,
        checkpoint,
        setCheckpoint: async (stage, data = {}) => {
          await sb
            .from("background_jobs")
            .update({
              checkpoint: { stage, data, at: new Date().toISOString() },
              last_heartbeat_at: new Date().toISOString(),
            })
            .eq("id", jobId);
        },
        heartbeat: async () => {
          await sb
            .from("background_jobs")
            .update({ last_heartbeat_at: new Date().toISOString() })
            .eq("id", jobId);
        },
        recordProviderError: async (provider, error) => {
          const msg = error instanceof Error ? error.message : String(error);
          const { data: cur } = await sb
            .from("background_jobs")
            .select("provider_errors")
            .eq("id", jobId)
            .single();
          const arr = Array.isArray(cur?.provider_errors) ? cur!.provider_errors : [];
          arr.push({ provider, error: msg.slice(0, 500), at: new Date().toISOString() });
          await sb
            .from("background_jobs")
            .update({ provider_errors: arr })
            .eq("id", jobId);
        },
      };

      await fn(ctx);
      await writer.complete();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "canceled") return;
      // Don't mark as failed if the job was re-claimed by watchdog mid-flight
      // — let the next attempt take over.
      const row = await loadJob(jobId);
      if (row && (row.status === "queued" || row.status === "running") && (row.attempt ?? 0) < (row as any).max_attempts) {
        // Another attempt will be dispatched; just exit.
        return;
      }
      await writer.fail(msg);
    } finally {
      clearInterval(beat);
    }
  })();

  // @ts-ignore EdgeRuntime is provided by Supabase
  if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
    // @ts-ignore
    (EdgeRuntime as any).waitUntil(task);
  } else {
    task.catch(() => {});
  }
}
