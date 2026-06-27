/** @doc Receives client-side error reports for triage and alerting. */
import { buildCors } from "../_shared/cors.ts";
// Multi-route Supabase Edge Function.
// Hosts: report-error (default), notify-user, workspace-notify, check-cf-secrets, github-import.
// Routing: client sets `x-fn` header (e.g. "notify-user"); default = error reporting.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = buildCors({ extraHeaders: "x-fn" });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TELEGRAM_BOT_TOKEN =
  Deno.env.get("TELEGRAM_BOT_TOKEN") || Deno.env.get("TELEGRAM_API_KEY");
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "Megsy <noreply@megsyai.com>";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function escapeHtml(s: string): string {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function validEmail(s: unknown): s is string {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length < 255;
}
function validUrl(s: unknown): s is string {
  if (typeof s !== "string" || s.length > 2048) return false;
  try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
}

// ====================== check-cf-secrets ======================
async function handleCheckCfSecrets(): Promise<Response> {
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
  const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  if (!token || !account) return json(200, { verify: null, pagesProjectsCount: 0, error: "cloudflare_not_configured" });
  const h = { Authorization: `Bearer ${token}` };
  const verify = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", { headers: h }).then((r) => r.json()).catch(() => null);
  const pages = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects`, { headers: h }).then((r) => r.json()).catch(() => null);
  return json(200, {
    verify,
    pagesProjectsCount: pages?.result?.length ?? 0,
    pagesProjects: (pages?.result ?? []).map((p: any) => ({ name: p.name, subdomain: p.subdomain, domains: p.domains })),
    pagesError: pages?.errors,
  });
}

// ====================== github-import (stub) ======================
function handleGithubImport(): Response {
  return json(503, { error: "GitHub import isn't configured yet. Connect a GitHub account first." });
}

// ====================== notify-user ======================
async function handleNotifyUser(req: Request): Promise<Response> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "unauthorized" });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: ud } = await admin.auth.getUser(token);
  const user = ud?.user;
  if (!user) return json(401, { error: "unauthorized" });

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const action = body.action || "status";

  const { data: row } = await admin.from("user_integrations").select("*").eq("user_id", user.id).maybeSingle();

  if (action === "status") {
    return json(200, {
      email: {
        available: !!RESEND_API_KEY,
        connected: !!row?.email_enabled && !!row?.email_address,
        email_address: row?.email_address ?? user.email ?? null,
      },
      telegram: {
        available: !!TELEGRAM_BOT_TOKEN,
        connected: !!row?.telegram_chat_id,
        telegram_chat_id: row?.telegram_chat_id ?? null,
        telegram_username: row?.telegram_username ?? null,
      },
    });
  }

  if (action === "connect") {
    if (body.app === "email") {
      const email_address = (body.email_address || user.email || "").trim();
      if (!email_address || !email_address.includes("@")) return json(400, { error: "valid email_address required" });
      await admin.from("user_integrations").upsert({
        user_id: user.id, email_enabled: true, email_address,
        telegram_chat_id: row?.telegram_chat_id ?? null,
        telegram_username: row?.telegram_username ?? null,
      });
      return json(200, { ok: true });
    }
    if (body.app === "telegram") {
      const chat_id = (body.telegram_chat_id || "").trim();
      if (!chat_id) return json(400, { error: "telegram_chat_id required" });
      await admin.from("user_integrations").upsert({
        user_id: user.id,
        email_enabled: row?.email_enabled ?? false,
        email_address: row?.email_address ?? null,
        telegram_chat_id: chat_id,
        telegram_username: body.telegram_username ?? null,
      });
      return json(200, { ok: true });
    }
    return json(400, { error: "unknown app" });
  }

  if (action === "disconnect") {
    if (body.app === "email") {
      await admin.from("user_integrations").update({ email_enabled: false, email_address: null }).eq("user_id", user.id);
      return json(200, { ok: true });
    }
    if (body.app === "telegram") {
      await admin.from("user_integrations").update({ telegram_chat_id: null, telegram_username: null }).eq("user_id", user.id);
      return json(200, { ok: true });
    }
    return json(400, { error: "unknown app" });
  }

  if (action === "send_email") {
    if (!RESEND_API_KEY) return json(400, { error: "RESEND_API_KEY not configured" });
    const to = row?.email_address || user.email;
    if (!to || !row?.email_enabled) return json(400, { error: "email not connected" });
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Notifications <onboarding@resend.dev>",
        to: [to],
        subject: body.subject || "Notification",
        html: body.html || `<p>${body.text || body.message || ""}</p>`,
      }),
    });
    const data = await r.json();
    if (!r.ok) return json(r.status, { error: data });
    return json(200, { ok: true, id: data.id });
  }

  if (action === "send_telegram") {
    if (!TELEGRAM_BOT_TOKEN) return json(400, { error: "TELEGRAM_BOT_TOKEN not configured" });
    if (!row?.telegram_chat_id) return json(400, { error: "telegram not connected" });
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: row.telegram_chat_id, text: body.message || body.text || "Notification", parse_mode: "HTML" }),
    });
    const data = await r.json();
    if (!r.ok) return json(r.status, { error: data });
    return json(200, { ok: true });
  }

  return json(400, { error: `unknown action: ${action}` });
}

// ====================== workspace-notify ======================
async function handleWorkspaceNotify(req: Request): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "unauthorized" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return json(401, { error: "unauthorized" });
  const userId = userData.user.id;

  const body = await req.json().catch(() => ({}));
  const type = typeof body?.type === "string" ? body.type : "";
  const workspace_id = typeof body?.workspace_id === "string" ? body.workspace_id : "";
  const workspace_name = typeof body?.workspace_name === "string" ? body.workspace_name.slice(0, 120) : "Workspace";
  const to = body?.to;
  const link = body?.link;

  const IN_APP_TYPES = new Set(["task_assigned", "task_comment", "task_mentioned", "member_added"]);
  if (type !== "invite" && !IN_APP_TYPES.has(type)) return json(400, { error: "invalid_type" });
  if (!workspace_id) return json(400, { error: "workspace_id_required" });
  if (type === "invite") {
    if (!validEmail(to)) return json(400, { error: "invalid_email" });
    if (!validUrl(link)) return json(400, { error: "invalid_link" });
  }

  const { data: ws } = await admin.from("workspaces").select("id, owner_id, name").eq("id", workspace_id).maybeSingle();
  if (!ws) return json(404, { error: "workspace_not_found" });

  let isAdmin = ws.owner_id === userId;
  let isMember = isAdmin;
  if (!isAdmin) {
    const { data: mem } = await admin.from("workspace_members").select("role").eq("workspace_id", workspace_id).eq("user_id", userId).maybeSingle();
    isAdmin = mem?.role === "admin";
    isMember = !!mem;
  }
  if (type === "invite" && !isAdmin) return json(403, { error: "forbidden" });
  if (IN_APP_TYPES.has(type) && !isMember) return json(403, { error: "forbidden" });

  if (IN_APP_TYPES.has(type)) {
    const target = typeof body?.assignee_id === "string" ? body.assignee_id
      : typeof body?.user_id === "string" ? body.user_id : "";
    if (!target) return json(400, { error: "target_user_required" });
    if (target === userId) return json(200, { ok: true, skipped: "self" });
    const { data: tm } = await admin.from("workspace_members").select("user_id").eq("workspace_id", workspace_id).eq("user_id", target).maybeSingle();
    if (!tm) return json(403, { error: "target_not_member" });

    const safeTitle = String(body?.title ?? "").slice(0, 200);
    const wsName = ws.name || workspace_name;
    const titleMap: Record<string, string> = {
      task_assigned: `New task in ${wsName}`,
      task_comment: `New comment in ${wsName}`,
      task_mentioned: `You were mentioned in ${wsName}`,
      member_added: `Added to ${wsName}`,
    };
    const messageMap: Record<string, string> = {
      task_assigned: safeTitle ? `Assigned: ${safeTitle}` : "You have a new task",
      task_comment: safeTitle ? `On: ${safeTitle}` : "New comment on a task",
      task_mentioned: safeTitle ? `In: ${safeTitle}` : "You were mentioned",
      member_added: `You've been added to ${wsName}`,
    };
    const { error: nerr } = await admin.from("notifications").insert({
      user_id: target, type, title: titleMap[type], message: messageMap[type],
      read: false, metadata: { workspace_id, task_title: safeTitle },
    });
    if (nerr) return json(500, { error: "notify_failed", detail: nerr.message });
    return json(200, { ok: true });
  }

  if (!RESEND_API_KEY) return json(502, { ok: false, error: "resend_not_configured" });
  const safeName = escapeHtml(workspace_name || ws.name || "Workspace");
  const safeLink = escapeHtml(link);
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111">
      <h1 style="font-size:20px;margin:0 0 12px">You're invited to ${safeName}</h1>
      <p style="font-size:14px;color:#555;margin:0 0 24px">Click the button below to join the workspace and start collaborating.</p>
      <p style="margin:0 0 24px"><a href="${safeLink}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block;font-size:14px">Accept invite</a></p>
      <p style="font-size:12px;color:#888;margin:0">Or open this link: <br><a href="${safeLink}" style="color:#555;word-break:break-all">${safeLink}</a></p>
    </div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject: `You're invited to ${workspace_name}`, html }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return json(502, { ok: false, error: `resend_${r.status}`, detail: t.slice(0, 200) });
  }
  return json(200, { ok: true });
}

// ====================== report-error (default) ======================
const ADMIN_EMAIL = "elgiza0v1@gmail.com";
const MAX_LEN = 4000;
const PROVIDER_PATTERNS: Array<[RegExp, string]> = [
  [/lovable\s*ai\s*gateway/gi, "the service"],
  [/lovable\s*ai/gi, "the service"],
  [/lovable\.dev/gi, "the service"],
  [/openai|gpt-?\d+(\.\d+)?|chatgpt/gi, "the service"],
  [/anthropic|claude(-[a-z0-9.-]+)?/gi, "the service"],
  [/gemini|google\s*ai|vertex/gi, "the service"],
  [/mistral|llama|grok|xai/gi, "the service"],
  [/supabase/gi, "the database"],
  [/resend|sendgrid|mailgun/gi, "the email service"],
  [/e2b|sandbox\.dev/gi, "the runtime"],
  [/sk-[a-z0-9-]{20,}/gi, "[redacted]"],
  [/bearer\s+[a-z0-9._-]+/gi, "[redacted]"],
];
function sanitize(text: string): string {
  let out = (text ?? "").toString().slice(0, MAX_LEN);
  for (const [re, rep] of PROVIDER_PATTERNS) out = out.replace(re, rep);
  return out;
}
async function handleReportError(req: Request): Promise<Response> {
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    let userId: string | null = null;
    let userEmail: string | null = null;
    const auth = req.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      try {
        const { data } = await sb.auth.getUser(auth.slice(7));
        if (data?.user) { userId = data.user.id; userEmail = data.user.email ?? null; }
      } catch { /* ignore */ }
    }

    const body = await req.json().catch(() => ({}));
    const source = String(body.source ?? "client").slice(0, 200);
    const route = body.route ? String(body.route).slice(0, 500) : null;
    const rawMsg = String(body.message ?? "Unknown error");
    const rawErr = body.raw_error ? String(body.raw_error) : null;
    const userAgent = body.user_agent ? String(body.user_agent).slice(0, 500) : null;
    const ctx = (body.context && typeof body.context === "object") ? body.context : {};

    const safeMessage = sanitize(rawMsg);
    const safeRaw = rawErr ? sanitize(rawErr) : null;

    const { data: row, error: insErr } = await sb.from("admin_error_log").insert({
      user_id: userId, user_email: userEmail, source, route,
      message: safeMessage, raw_error: safeRaw, context: ctx, user_agent: userAgent,
    }).select("id").maybeSingle();
    if (insErr) console.error("[report-error] insert failed", insErr);

    let emailed = false;
    if (RESEND_API_KEY) {
      try {
        const html = `
          <h2>New error on the site</h2>
          <p><b>Source:</b> ${escapeHtml(source)}</p>
          <p><b>Route:</b> ${escapeHtml(route ?? "-")}</p>
          <p><b>User:</b> ${escapeHtml(userEmail ?? userId ?? "anonymous")}</p>
          <p><b>Message:</b> ${escapeHtml(safeMessage)}</p>
          ${safeRaw ? `<pre style="white-space:pre-wrap;background:#f6f6f6;padding:8px;border-radius:6px;">${escapeHtml(safeRaw)}</pre>` : ""}
          <p><small>Logged at ${new Date().toISOString()}</small></p>`;
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "Site Alerts <onboarding@resend.dev>",
            to: [ADMIN_EMAIL],
            subject: `⚠️ Site error: ${safeMessage.slice(0, 80)}`,
            html,
          }),
        });
        emailed = resp.ok;
        if (emailed && row?.id) await sb.from("admin_error_log").update({ notified: true }).eq("id", row.id);
      } catch (e) { console.error("[report-error] resend exception", e); }
    }
    return json(200, { ok: true, id: row?.id ?? null, emailed });
  } catch (e) {
    console.error("[report-error] fatal", e);
    return json(200, { ok: false });
  }
}

// ====================== router ======================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const fn = (req.headers.get("x-fn") || "").toLowerCase();
  try {
    switch (fn) {
      case "check-cf-secrets": return await handleCheckCfSecrets();
      case "github-import":    return handleGithubImport();
      case "notify-user":      return await handleNotifyUser(req);
      case "workspace-notify": return await handleWorkspaceNotify(req);
      default:                 return await handleReportError(req);
    }
  } catch (e) {
    console.error(`[report-error/${fn || "default"}] fatal`, e);
    return json(500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
