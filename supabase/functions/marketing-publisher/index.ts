/** @doc Marketing publisher: unified edge function routing actions (publish-post, publish-batch, test-account, sync-analytics, platforms) to stay within the project's edge-function limit. */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { getAdapter, listAdapterMeta } from "../_shared/publishers/adapters.ts";
import type { PublishContent } from "../_shared/publishers/types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const RETRYABLE = new Set(["transient", "rate_limited", "unknown"]);

async function requireUser(req: Request) {
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  return user;
}

// ---------- Actions ----------
async function actionPublishPost(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const body = await req.json();
  if (!body.post_id || !body.account_id) return json({ error: "post_id and account_id required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const [{ data: post }, { data: account }] = await Promise.all([
    admin.from("marketing_posts").select("*").eq("id", body.post_id).eq("user_id", user.id).maybeSingle(),
    admin.from("marketing_accounts").select("*").eq("id", body.account_id).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!post) return json({ error: "Post not found" }, 404);
  if (!account) return json({ error: "Account not found" }, 404);
  if (account.enabled === false) return json({ error: "Account disabled" }, 400);

  const adapter = getAdapter(account.platform);
  if (!adapter) return json({ error: `No adapter for ${account.platform}` }, 400);
  if (!adapter.meta.enabled) return json({ error: `${adapter.meta.label} adapter disabled (needs approval).`, code: "disabled" }, 400);

  // Rate limit (per minute)
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin.from("marketing_publish_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id).eq("account_id", account.id).eq("success", true)
    .gte("created_at", since);
  if ((count || 0) >= adapter.meta.limits.perMinute) {
    return json({ error: `rate_limit_minute (${count}/${adapter.meta.limits.perMinute})`, retry_after: 60 }, 429);
  }

  const variantText = body.variant || (post.platform_variants || {})[account.platform] || post.content;
  const hash = await sha256(`${account.platform}:${variantText}`);
  if (!body.force) {
    const { data: dup } = await admin.from("marketing_posts")
      .select("id").eq("user_id", user.id).eq("content_hash", hash).neq("id", post.id).limit(1);
    if (dup && dup.length) return json({ error: "Duplicate content detected within dedup window.", code: "duplicate" }, 409);
  }

  const content: PublishContent = {
    text: variantText,
    title: post.title || undefined,
    mediaUrls: post.media_urls || [],
    hashtags: post.hashtags || [],
    language: post.language || undefined,
  };
  const result = await adapter.publishPost(account as any, content);
  const completed = new Date().toISOString();

  await admin.from("marketing_publish_log").insert({
    user_id: user.id, post_id: post.id, account_id: account.id, platform: account.platform,
    external_id: result.external_id || null, external_url: result.external_url || null,
    success: result.success, error: result.error || null,
  } as any);

  if (result.success) {
    await admin.from("marketing_posts")
      .update({ status: "published", published_at: completed, content_hash: hash }).eq("id", post.id);
    await admin.from("marketing_accounts").update({ last_used_at: completed }).eq("id", account.id);
  }

  return json({
    success: result.success,
    external_id: result.external_id, external_url: result.external_url,
    error: result.error, error_code: result.error_code,
  }, result.success ? 200 : 502);
}

async function actionPublishBatch(_req: Request) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const now = new Date();
  const { data: items, error } = await admin.from("marketing_publish_queue")
    .select("*").in("status", ["queued", "retrying"])
    .lte("next_attempt_at", now.toISOString())
    .order("next_attempt_at", { ascending: true }).limit(20);
  if (error) return json({ error: error.message }, 500);
  if (!items?.length) return json({ processed: 0 });

  const results: any[] = [];
  for (const item of items) {
    await admin.from("marketing_publish_queue").update({
      status: "publishing", started_at: new Date().toISOString(), attempts: (item.attempts || 0) + 1,
    }).eq("id", item.id);
    try {
      const [{ data: post }, { data: account }] = await Promise.all([
        admin.from("marketing_posts").select("*").eq("id", item.post_id).maybeSingle(),
        admin.from("marketing_accounts").select("*").eq("id", item.account_id).maybeSingle(),
      ]);
      if (!post || !account) throw new Error("post or account missing");
      if (account.enabled === false) throw new Error("account disabled");
      const adapter = getAdapter(account.platform);
      if (!adapter || !adapter.meta.enabled) throw new Error("adapter disabled");

      const variant = (post.platform_variants || {})[account.platform] || post.content;
      const result = await adapter.publishPost(account as any, {
        text: variant, title: post.title || undefined,
        mediaUrls: post.media_urls || [], hashtags: post.hashtags || [], language: post.language || undefined,
      });
      const completed = new Date().toISOString();
      await admin.from("marketing_publish_log").insert({
        user_id: item.user_id, post_id: post.id, account_id: account.id, platform: account.platform,
        external_id: result.external_id, external_url: result.external_url,
        success: result.success, error: result.error,
      } as any);
      if (result.success) {
        await admin.from("marketing_publish_queue").update({
          status: "published", completed_at: completed,
          external_id: result.external_id, external_url: result.external_url, last_error: null,
        }).eq("id", item.id);
        await admin.from("marketing_posts").update({ status: "published", published_at: completed }).eq("id", post.id);
        await admin.from("marketing_accounts").update({ last_used_at: completed }).eq("id", account.id);
        results.push({ id: item.id, ok: true });
      } else {
        const attempts = (item.attempts || 0) + 1;
        const retryable = RETRYABLE.has(result.error_code || "unknown");
        const giveUp = !retryable || attempts >= (item.max_attempts || 5);
        const backoff = Math.min(60 * Math.pow(2, attempts), 3600);
        await admin.from("marketing_publish_queue").update({
          status: giveUp ? "failed" : "retrying",
          last_error: result.error, last_error_code: result.error_code,
          next_attempt_at: new Date(Date.now() + backoff * 1000).toISOString(),
          completed_at: giveUp ? completed : null,
        }).eq("id", item.id);
        results.push({ id: item.id, ok: false, retry: !giveUp });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const attempts = (item.attempts || 0) + 1;
      const giveUp = attempts >= (item.max_attempts || 5);
      const backoff = Math.min(60 * Math.pow(2, attempts), 3600);
      await admin.from("marketing_publish_queue").update({
        status: giveUp ? "failed" : "retrying",
        last_error: msg, last_error_code: "exception",
        next_attempt_at: new Date(Date.now() + backoff * 1000).toISOString(),
        completed_at: giveUp ? new Date().toISOString() : null,
      }).eq("id", item.id);
      results.push({ id: item.id, ok: false, error: msg });
    }
  }
  return json({ processed: results.length, results });
}

async function actionTestAccount(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const body = await req.json();
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  let account: any;
  if (body.account_id) {
    const { data } = await admin.from("marketing_accounts").select("*").eq("id", body.account_id).eq("user_id", user.id).maybeSingle();
    account = data;
    if (!account) return json({ error: "Account not found" }, 404);
  } else if (body.platform && body.credentials) {
    account = { platform: body.platform, credentials: body.credentials, config: body.config || {}, user_id: user.id };
  } else {
    return json({ error: "Provide account_id or {platform, credentials}" }, 400);
  }
  const adapter = getAdapter(account.platform);
  if (!adapter) return json({ error: `No adapter for ${account.platform}` }, 400);
  const result = await adapter.validateAccount(account);
  if (body.account_id) {
    await admin.from("marketing_accounts").update({
      last_test_at: new Date().toISOString(),
      last_test_ok: result.ok, last_test_error: result.error || null,
      status: result.ok ? "connected" : "error",
    }).eq("id", body.account_id);
  }
  return json(result, result.ok ? 200 : 400);
}

async function actionSyncAnalytics() {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: logs } = await admin.from("marketing_publish_log")
    .select("id, user_id, post_id, account_id, platform, external_id, created_at")
    .eq("success", true).not("external_id", "is", null)
    .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString())
    .limit(100);
  if (!logs?.length) return json({ processed: 0 });
  const results: any[] = [];
  for (const log of logs) {
    const adapter = getAdapter(log.platform);
    if (!adapter?.fetchAnalytics) continue;
    const { data: account } = await admin.from("marketing_accounts").select("*").eq("id", log.account_id).maybeSingle();
    if (!account) continue;
    try {
      const stats = await adapter.fetchAnalytics(account as any, log.external_id!);
      if (!stats) continue;
      await admin.from("marketing_analytics").insert({
        user_id: log.user_id, post_id: log.post_id, account_id: log.account_id,
        platform: log.platform, external_id: log.external_id,
        likes: stats.likes ?? null, reshares: stats.reshares ?? null,
        comments: stats.comments ?? null, impressions: stats.impressions ?? null, clicks: stats.clicks ?? null,
        raw: stats.raw || {},
      } as any);
      results.push({ id: log.id, ok: true });
    } catch (e) {
      results.push({ id: log.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return json({ processed: results.length, results });
}

// ---------- Router ----------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  // Action from query string, URL last segment, or JSON body { action }
  let action = url.searchParams.get("action") || url.pathname.split("/").filter(Boolean).pop() || "";
  if (action === "marketing-publisher") action = "";

  // GET → platform registry
  if (req.method === "GET" && (action === "platforms" || !action)) {
    return json({ platforms: listAdapterMeta() });
  }

  // Allow action via body for clients that can't easily set query strings
  if (!action && req.method === "POST") {
    try {
      const cloned = req.clone();
      const body = await cloned.json();
      if (body?.action) action = body.action;
    } catch { /* ignore */ }
  }

  try {
    switch (action) {
      case "publish-post": return await actionPublishPost(req);
      case "publish-batch": return await actionPublishBatch(req);
      case "test-account": return await actionTestAccount(req);
      case "sync-analytics": return await actionSyncAnalytics();
      case "platforms": return json({ platforms: listAdapterMeta() });
      default: return json({ error: "Unknown action. Use: platforms | publish-post | publish-batch | test-account | sync-analytics" }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
