/** @doc Provider/key circuit breaker backed by public.provider_circuit_state. Open after N failures, half-open after cooldown, auto-close on success. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const FAILURE_THRESHOLD = 5;          // open after 5 failures in a row
const COOLDOWN_SECONDS = 60;          // try again after 60s (half-open)
const HALF_OPEN_SUCCESS = 2;          // close after 2 successes

export type CircuitScope = "provider" | "key";

export interface CircuitState {
  state: "closed" | "open" | "half_open";
  reopens_at?: string | null;
}

async function fetchState(scope: CircuitScope, scopeId: string): Promise<CircuitState | null> {
  const { data } = await admin
    .from("provider_circuit_state")
    .select("state, reopens_at")
    .eq("scope", scope)
    .eq("scope_id", scopeId)
    .maybeSingle();
  return data as CircuitState | null;
}

/** Returns true if the call should be allowed. */
export async function canCall(scope: CircuitScope, scopeId: string): Promise<boolean> {
  const s = await fetchState(scope, scopeId);
  if (!s || s.state === "closed") return true;
  if (s.state === "open") {
    if (s.reopens_at && new Date(s.reopens_at) <= new Date()) {
      // promote to half-open
      await admin
        .from("provider_circuit_state")
        .update({ state: "half_open", success_count: 0, updated_at: new Date().toISOString() })
        .eq("scope", scope).eq("scope_id", scopeId);
      return true;
    }
    return false;
  }
  return true; // half_open: probe
}

export async function recordSuccess(scope: CircuitScope, scopeId: string): Promise<void> {
  const s = await fetchState(scope, scopeId);
  if (!s || s.state === "closed") {
    await admin.from("provider_circuit_state").upsert({
      scope, scope_id: scopeId,
      state: "closed", failure_count: 0, success_count: 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: "scope,scope_id" });
    return;
  }
  if (s.state === "half_open") {
    // count probes; close after threshold
    await admin.rpc("exec", { sql: "" }).catch(() => null); // no-op fallback
    const { data: cur } = await admin
      .from("provider_circuit_state")
      .select("success_count")
      .eq("scope", scope).eq("scope_id", scopeId).maybeSingle();
    const next = ((cur?.success_count as number) ?? 0) + 1;
    if (next >= HALF_OPEN_SUCCESS) {
      await admin.from("provider_circuit_state").update({
        state: "closed", failure_count: 0, success_count: 0,
        opened_at: null, reopens_at: null,
        updated_at: new Date().toISOString(),
      }).eq("scope", scope).eq("scope_id", scopeId);
    } else {
      await admin.from("provider_circuit_state").update({
        success_count: next,
        updated_at: new Date().toISOString(),
      }).eq("scope", scope).eq("scope_id", scopeId);
    }
  }
}

export async function recordFailure(
  scope: CircuitScope, scopeId: string, error: string,
): Promise<void> {
  const s = await fetchState(scope, scopeId);
  const now = new Date();
  const failures = ((s as { failure_count?: number } | null)?.failure_count ?? 0) + 1;
  const shouldOpen = failures >= FAILURE_THRESHOLD || s?.state === "half_open";
  await admin.from("provider_circuit_state").upsert({
    scope, scope_id: scopeId,
    state: shouldOpen ? "open" : "closed",
    failure_count: failures,
    success_count: 0,
    opened_at: shouldOpen ? now.toISOString() : null,
    reopens_at: shouldOpen ? new Date(now.getTime() + COOLDOWN_SECONDS * 1000).toISOString() : null,
    last_error: error.slice(0, 500),
    updated_at: now.toISOString(),
  }, { onConflict: "scope,scope_id" });

  if (shouldOpen) {
    await admin.rpc("log_security_event", {
      p_event_type: "circuit_opened",
      p_severity: "critical",
      p_provider: scope === "provider" ? scopeId : null,
      p_target_id: scope === "key" ? scopeId : null,
      p_details: { failures, error: error.slice(0, 200) },
    }).catch(() => null);
  }
}

/** Wrap an async call with breaker semantics. */
export async function withCircuit<T>(
  scope: CircuitScope,
  scopeId: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!(await canCall(scope, scopeId))) {
    throw new Error(`circuit_open:${scope}:${scopeId}`);
  }
  try {
    const result = await fn();
    await recordSuccess(scope, scopeId);
    return result;
  } catch (err) {
    await recordFailure(scope, scopeId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
