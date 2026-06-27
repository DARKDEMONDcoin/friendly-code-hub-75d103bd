// Rotating key pool for E2B sandboxes — mirrors the alibaba_keys pattern.
// Picks the least-recently-used active key from public.e2b_keys, runs the
// caller's HTTP request, and records success/failure so dead keys get blocked.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  return _admin;
}

export interface E2BKey { id: string; api_key: string }

export async function pickE2BKey(): Promise<E2BKey | null> {
  const { data, error } = await admin()
    .from("e2b_keys")
    .select("id, api_key, last_used_at, failure_count")
    .eq("status", "active")
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(1);
  if (error) {
    console.error("pickE2BKey", error);
    return null;
  }
  const row = data?.[0];
  if (!row) return null;
  await admin().from("e2b_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  return { id: row.id, api_key: row.api_key };
}

export async function reportE2BFailure(id: string, status: number, err: string) {
  const block = status === 401 || status === 402 || status === 403;
  await admin()
    .from("e2b_keys")
    .update({
      failure_count: (await admin().from("e2b_keys").select("failure_count").eq("id", id).maybeSingle()).data?.failure_count + 1 || 1,
      last_error: err.slice(0, 500),
      status: block ? "blocked" : "active",
    })
    .eq("id", id);
}
