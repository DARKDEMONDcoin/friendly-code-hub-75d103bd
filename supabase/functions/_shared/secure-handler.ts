/** @doc Unified secure wrapper for Edge Functions: CORS, JWT, internal-secret, rate-limit, Zod validation, audit logging, error containment. */
// Compose existing primitives (auth.ts, cors.ts, rate-limit.ts) into ONE
// handler wrapper that every sensitive edge function can use:
//
//   serve(secureHandler({
//     bucket: "chat",
//     requireAuth: true,
//     schema: z.object({ message: z.string().min(1).max(8000) }),
//   }, async ({ user, body, req }) => { ... }))
//
// Goals: zero new infra, additive, opt-in per function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { ZodSchema } from "https://esm.sh/zod@3.23.8";
import { corsHeaders, jsonResponse } from "./cors.ts";
import { getAuthUser, isInternalCaller } from "./auth.ts";
import { checkRateLimit, getClientIp, rateLimitResponse } from "./rate-limit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

export interface SecureContext<T = unknown> {
  req: Request;
  user: { id: string; email?: string } | null;
  internal: boolean;
  body: T;
  locale: string;
  ipHash: string | null;
}

export interface SecureOptions<T = unknown> {
  /** rate-limit bucket name (see rate-limit.ts defaults) */
  bucket?: string;
  /** require a valid JWT (or internal secret) */
  requireAuth?: boolean;
  /** allow internal service-to-service calls to bypass JWT */
  allowInternal?: boolean;
  /** Zod schema for body validation; ignored on GET/OPTIONS */
  schema?: ZodSchema<T>;
  /** function name used for audit log */
  functionName?: string;
  /** override default rate-limit numbers */
  rateLimit?: { perMinute?: number; perHour?: number; blockSeconds?: number };
  /** prompt-injection guard on free-text fields (default true if requireAuth) */
  guardPrompts?: boolean;
}

const INJECTION_PATTERNS = [
  /ignore (all )?(previous|above|prior) (instructions|prompts)/i,
  /system prompt[:=]/i,
  /you are now/i,
  /<\|im_start\|>/i,
  /\bjailbreak\b/i,
];

function hasPromptInjection(value: unknown): boolean {
  if (typeof value === "string") {
    return INJECTION_PATTERNS.some((re) => re.test(value));
  }
  if (Array.isArray(value)) return value.some(hasPromptInjection);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasPromptInjection);
  }
  return false;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function logAudit(params: {
  event_type: string;
  severity?: "info" | "warn" | "critical";
  actor_user_id?: string | null;
  target_id?: string | null;
  function_name?: string | null;
  provider?: string | null;
  details?: Record<string, unknown>;
  ip_hash?: string | null;
}): Promise<void> {
  if (!admin) return;
  try {
    await admin.rpc("log_security_event", {
      p_event_type: params.event_type,
      p_severity: params.severity ?? "info",
      p_actor_user_id: params.actor_user_id ?? null,
      p_target_id: params.target_id ?? null,
      p_function_name: params.function_name ?? null,
      p_provider: params.provider ?? null,
      p_details: params.details ?? {},
      p_ip_hash: params.ip_hash ?? null,
    });
  } catch {
    // fail-silent; audit must never break the request
  }
}

type Handler<T> = (ctx: SecureContext<T>) => Promise<Response> | Response;

export function secureHandler<T = unknown>(
  opts: SecureOptions<T>,
  handler: Handler<T>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    const fnName = opts.functionName || "unknown";
    const ip = getClientIp(req);
    const ipHash = ip ? await sha256(ip) : null;
    const locale = (req.headers.get("accept-language") || "en").split(/[-,;]/)[0];

    // Internal call?
    const internal = !!opts.allowInternal && isInternalCaller(req);

    // Auth
    let user: { id: string; email?: string } | null = null;
    if (!internal) {
      user = await getAuthUser(req);
      if (opts.requireAuth && !user) {
        await logAudit({
          event_type: "auth_rejected",
          severity: "warn",
          function_name: fnName,
          ip_hash: ipHash,
        });
        return jsonResponse({ error: "unauthorized" }, 401);
      }
    }

    // Rate limit
    if (opts.bucket) {
      const rl = await checkRateLimit(req, opts.bucket, user?.id ?? null, opts.rateLimit);
      if (!rl.allowed) {
        await logAudit({
          event_type: "rate_limited",
          severity: "warn",
          actor_user_id: user?.id ?? null,
          function_name: fnName,
          details: { bucket: opts.bucket, reason: rl.reason },
          ip_hash: ipHash,
        });
        return rateLimitResponse(rl.retryAfter, locale, corsHeaders);
      }
    }

    // Body parse + Zod
    let body: T = undefined as unknown as T;
    if (req.method !== "GET" && req.method !== "HEAD") {
      try {
        const text = await req.text();
        const json = text ? JSON.parse(text) : {};
        if (opts.schema) {
          const parsed = opts.schema.safeParse(json);
          if (!parsed.success) {
            return jsonResponse(
              { error: "validation_error", details: parsed.error.flatten() },
              400,
            );
          }
          body = parsed.data;
        } else {
          body = json as T;
        }
      } catch {
        return jsonResponse({ error: "invalid_json" }, 400);
      }
    }

    // Prompt-injection guard (opt-in by default for authenticated endpoints)
    const guard = opts.guardPrompts ?? !!opts.requireAuth;
    if (guard && body && hasPromptInjection(body)) {
      await logAudit({
        event_type: "prompt_injection_blocked",
        severity: "warn",
        actor_user_id: user?.id ?? null,
        function_name: fnName,
        ip_hash: ipHash,
      });
      return jsonResponse({ error: "input_rejected", reason: "unsafe_content" }, 400);
    }

    // Execute handler with full containment
    try {
      const res = await handler({ req, user, internal, body, locale, ipHash });
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logAudit({
        event_type: "handler_error",
        severity: "critical",
        actor_user_id: user?.id ?? null,
        function_name: fnName,
        details: { message: message.slice(0, 500) },
        ip_hash: ipHash,
      });
      // No stack trace, no secrets leakage
      return jsonResponse(
        { error: "internal_error", message: "حدث خطأ غير متوقع. حاول مرة أخرى." },
        500,
      );
    }
  };
}

// Re-export common helpers so functions only need to import this file.
export { corsHeaders, jsonResponse } from "./cors.ts";
