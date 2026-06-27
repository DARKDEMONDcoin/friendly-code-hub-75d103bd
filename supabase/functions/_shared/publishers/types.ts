// Shared types for marketing publisher adapters.
// Every publisher implements the PublisherAdapter interface so the
// orchestrator (marketing-publish-post / -batch) can stay platform-agnostic.

export interface PublishContent {
  text: string;
  title?: string;
  mediaUrls?: string[];
  hashtags?: string[];
  language?: string;
  canonicalUrl?: string;
  // Optional UTM-tagged link override
  link?: string;
}

export interface PublishAccount {
  id: string;
  user_id: string;
  platform: string;
  handle: string | null;
  display_name: string | null;
  credentials: Record<string, any>;
  config: Record<string, any>;
}

export interface PublishResult {
  success: boolean;
  external_id?: string | null;
  external_url?: string | null;
  error?: string;
  error_code?: string;
  raw?: any;
}

export interface PlatformLimits {
  // Soft per-account rate limits we enforce internally to stay polite.
  perMinute: number;
  perHour: number;
  perDay: number;
  // Maximum text length for a single post (used by validators / truncation).
  maxLength: number;
  // Minimum interval (seconds) between posts on this platform.
  minIntervalSeconds: number;
  // Whether the platform supports images / videos
  supportsMedia: boolean;
}

export interface PlatformMeta {
  id: string;
  label: string;
  enabled: boolean;
  requiresApproval: boolean;
  credentialFields: { key: string; label: string; secret: boolean; required: boolean; help?: string }[];
  limits: PlatformLimits;
  // Human notes shown in dashboard
  notes?: string;
  // Names of Supabase secrets the adapter MAY use as a fallback (optional).
  // Per-account credentials always take priority.
  optionalSecrets?: string[];
}

export interface PublisherAdapter {
  meta: PlatformMeta;
  validateAccount(account: PublishAccount): Promise<{ ok: boolean; error?: string; info?: any }>;
  publishPost(account: PublishAccount, content: PublishContent): Promise<PublishResult>;
  // Optional analytics fetch (returns null if unsupported)
  fetchAnalytics?(
    account: PublishAccount,
    externalId: string,
  ): Promise<{ likes?: number; reshares?: number; comments?: number; impressions?: number; clicks?: number; raw?: any } | null>;
}

// Classify network/API errors into a coarse code so the queue can decide
// whether to retry, back off, or surface the failure to the user.
export function normalizeError(err: unknown): { code: string; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (/401|unauthor/i.test(msg)) return { code: "auth", message: msg };
  if (/403|forbid/i.test(msg)) return { code: "permission", message: msg };
  if (/404/i.test(msg)) return { code: "not_found", message: msg };
  if (/409|duplicat/i.test(msg)) return { code: "duplicate", message: msg };
  if (/429|rate/i.test(msg)) return { code: "rate_limited", message: msg };
  if (/5\d\d|timeout|network|fetch failed/i.test(msg)) return { code: "transient", message: msg };
  return { code: "unknown", message: msg };
}

export function truncate(text: string, max: number): string {
  if (!text) return text;
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)) + "…";
}
