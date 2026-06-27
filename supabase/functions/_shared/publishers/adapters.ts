// Concrete publisher adapters. Each one is intentionally small and
// self-contained: validateAccount() does the cheapest read-only auth check
// the platform allows, and publishPost() performs a single legitimate post
// using the account owner's own credentials.
//
// Required secrets are stored per-account in marketing_accounts.credentials.
// We never fall back to broadcasting from a shared service account.

import type {
  PlatformMeta,
  PublishAccount,
  PublishContent,
  PublisherAdapter,
  PublishResult,
} from "./types.ts";
import { normalizeError, truncate } from "./types.ts";

const ua = "MegsyMarketingBot/1.0 (+https://megsyai.com)";

function buildText(content: PublishContent, max: number, withHashtags = true): string {
  const tags = withHashtags && content.hashtags?.length
    ? "\n\n" + content.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ")
    : "";
  const body = content.text || content.title || "";
  return truncate(body + tags, max);
}

async function jsonFetch(url: string, init: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, headers: { "User-Agent": ua, ...(init.headers || {}) } });
  const text = await res.text();
  let data: any = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    const msg = typeof data === "string" ? data : (data?.error_description || data?.error?.message || data?.message || data?.error || res.statusText);
    throw new Error(`${res.status} ${msg}`);
  }
  return data;
}

// ---------- Telegram ----------
const telegram: PublisherAdapter = {
  meta: {
    id: "telegram",
    label: "Telegram",
    enabled: true,
    requiresApproval: false,
    credentialFields: [
      { key: "bot_token", label: "Bot Token", secret: true, required: true, help: "From @BotFather" },
      { key: "chat_id", label: "Chat / Channel ID", secret: false, required: true, help: "@channelusername or numeric id (bot must be admin)" },
    ],
    limits: { perMinute: 20, perHour: 60, perDay: 200, maxLength: 4096, minIntervalSeconds: 3, supportsMedia: true },
  },
  async validateAccount(acc) {
    try {
      const data = await jsonFetch(`https://api.telegram.org/bot${acc.credentials.bot_token}/getMe`, { method: "GET" });
      return { ok: !!data.ok, info: data.result };
    } catch (e) { return { ok: false, error: normalizeError(e).message }; }
  },
  async publishPost(acc, content): Promise<PublishResult> {
    try {
      const token = acc.credentials.bot_token;
      const chat = acc.credentials.chat_id;
      const text = buildText(content, 4096);
      const photo = content.mediaUrls?.[0];
      const endpoint = photo ? "sendPhoto" : "sendMessage";
      const body: any = photo
        ? { chat_id: chat, photo, caption: truncate(text, 1024) }
        : { chat_id: chat, text, disable_web_page_preview: false };
      const data = await jsonFetch(`https://api.telegram.org/bot${token}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const messageId = data.result?.message_id;
      const handle = typeof chat === "string" && chat.startsWith("@") ? chat.slice(1) : null;
      return {
        success: true,
        external_id: messageId ? String(messageId) : null,
        external_url: handle && messageId ? `https://t.me/${handle}/${messageId}` : null,
        raw: data.result,
      };
    } catch (e) {
      const n = normalizeError(e);
      return { success: false, error: n.message, error_code: n.code };
    }
  },
};

// ---------- Bluesky (AT Protocol) ----------
const bluesky: PublisherAdapter = {
  meta: {
    id: "bluesky",
    label: "Bluesky",
    enabled: true,
    requiresApproval: false,
    credentialFields: [
      { key: "identifier", label: "Handle / Email", secret: false, required: true },
      { key: "app_password", label: "App Password", secret: true, required: true, help: "Create from Bluesky → Settings → App passwords" },
      { key: "service", label: "PDS URL (optional)", secret: false, required: false, help: "Default: https://bsky.social" },
    ],
    limits: { perMinute: 10, perHour: 100, perDay: 300, maxLength: 300, minIntervalSeconds: 6, supportsMedia: false },
  },
  async validateAccount(acc) {
    try {
      const svc = acc.credentials.service || "https://bsky.social";
      const data = await jsonFetch(`${svc}/xrpc/com.atproto.server.createSession`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: acc.credentials.identifier, password: acc.credentials.app_password }),
      });
      return { ok: true, info: { did: data.did, handle: data.handle } };
    } catch (e) { return { ok: false, error: normalizeError(e).message }; }
  },
  async publishPost(acc, content): Promise<PublishResult> {
    try {
      const svc = acc.credentials.service || "https://bsky.social";
      const session = await jsonFetch(`${svc}/xrpc/com.atproto.server.createSession`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: acc.credentials.identifier, password: acc.credentials.app_password }),
      });
      const text = buildText(content, 300);
      const record = {
        $type: "app.bsky.feed.post",
        text,
        createdAt: new Date().toISOString(),
        langs: content.language ? [content.language] : undefined,
      };
      const data = await jsonFetch(`${svc}/xrpc/com.atproto.repo.createRecord`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessJwt}` },
        body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", record }),
      });
      const rkey = data.uri?.split("/").pop();
      return {
        success: true,
        external_id: data.uri || null,
        external_url: rkey ? `https://bsky.app/profile/${session.handle}/post/${rkey}` : null,
        raw: data,
      };
    } catch (e) { const n = normalizeError(e); return { success: false, error: n.message, error_code: n.code }; }
  },
};

// ---------- Mastodon ----------
const mastodon: PublisherAdapter = {
  meta: {
    id: "mastodon",
    label: "Mastodon",
    enabled: true,
    requiresApproval: false,
    credentialFields: [
      { key: "instance_url", label: "Instance URL", secret: false, required: true, help: "e.g. https://mastodon.social" },
      { key: "access_token", label: "Access Token", secret: true, required: true, help: "Settings → Development → New application" },
    ],
    limits: { perMinute: 5, perHour: 60, perDay: 300, maxLength: 500, minIntervalSeconds: 10, supportsMedia: true },
  },
  async validateAccount(acc) {
    try {
      const data = await jsonFetch(`${acc.credentials.instance_url}/api/v1/accounts/verify_credentials`, {
        headers: { Authorization: `Bearer ${acc.credentials.access_token}` },
      });
      return { ok: true, info: { id: data.id, acct: data.acct } };
    } catch (e) { return { ok: false, error: normalizeError(e).message }; }
  },
  async publishPost(acc, content): Promise<PublishResult> {
    try {
      const data = await jsonFetch(`${acc.credentials.instance_url}/api/v1/statuses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${acc.credentials.access_token}` },
        body: JSON.stringify({ status: buildText(content, 500), language: content.language, visibility: acc.config?.visibility || "public" }),
      });
      return { success: true, external_id: data.id, external_url: data.url, raw: data };
    } catch (e) { const n = normalizeError(e); return { success: false, error: n.message, error_code: n.code }; }
  },
};

// ---------- Dev.to ----------
const devto: PublisherAdapter = {
  meta: {
    id: "devto",
    label: "Dev.to",
    enabled: true,
    requiresApproval: false,
    credentialFields: [
      { key: "api_key", label: "API Key", secret: true, required: true, help: "Settings → Extensions → DEV API Keys" },
    ],
    limits: { perMinute: 1, perHour: 10, perDay: 30, maxLength: 100000, minIntervalSeconds: 60, supportsMedia: false },
  },
  async validateAccount(acc) {
    try {
      const data = await jsonFetch("https://dev.to/api/users/me", { headers: { "api-key": acc.credentials.api_key } });
      return { ok: true, info: { id: data.id, username: data.username } };
    } catch (e) { return { ok: false, error: normalizeError(e).message }; }
  },
  async publishPost(acc, content): Promise<PublishResult> {
    try {
      const article = {
        article: {
          title: content.title || (content.text || "").split("\n")[0].slice(0, 80) || "Untitled",
          body_markdown: content.text,
          published: true,
          tags: (content.hashtags || []).slice(0, 4).map((t) => t.replace(/^#/, "")),
          canonical_url: content.canonicalUrl,
        },
      };
      const data = await jsonFetch("https://dev.to/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": acc.credentials.api_key },
        body: JSON.stringify(article),
      });
      return { success: true, external_id: String(data.id), external_url: data.url, raw: data };
    } catch (e) { const n = normalizeError(e); return { success: false, error: n.message, error_code: n.code }; }
  },
};

// ---------- Hashnode (GraphQL) ----------
const hashnode: PublisherAdapter = {
  meta: {
    id: "hashnode",
    label: "Hashnode",
    enabled: true,
    requiresApproval: false,
    credentialFields: [
      { key: "pat", label: "Personal Access Token", secret: true, required: true, help: "Account → Developer → Generate Token" },
      { key: "publication_id", label: "Publication ID", secret: false, required: true, help: "From your blog dashboard URL" },
    ],
    limits: { perMinute: 1, perHour: 10, perDay: 20, maxLength: 100000, minIntervalSeconds: 60, supportsMedia: false },
  },
  async validateAccount(acc) {
    try {
      const data = await jsonFetch("https://gql.hashnode.com/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: acc.credentials.pat },
        body: JSON.stringify({ query: "{ me { id username } }" }),
      });
      if (data.errors) throw new Error(JSON.stringify(data.errors));
      return { ok: true, info: data.data?.me };
    } catch (e) { return { ok: false, error: normalizeError(e).message }; }
  },
  async publishPost(acc, content): Promise<PublishResult> {
    try {
      const mutation = `mutation Pub($i:PublishPostInput!){ publishPost(input:$i){ post{ id slug url } } }`;
      const input = {
        title: content.title || (content.text || "").split("\n")[0].slice(0, 80) || "Untitled",
        contentMarkdown: content.text,
        publicationId: acc.credentials.publication_id,
        tags: (content.hashtags || []).slice(0, 5).map((name) => ({ slug: name.replace(/^#/, "").toLowerCase(), name: name.replace(/^#/, "") })),
        originalArticleURL: content.canonicalUrl,
      };
      const data = await jsonFetch("https://gql.hashnode.com/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: acc.credentials.pat },
        body: JSON.stringify({ query: mutation, variables: { i: input } }),
      });
      if (data.errors) throw new Error(JSON.stringify(data.errors));
      const post = data.data?.publishPost?.post;
      return { success: true, external_id: post?.id, external_url: post?.url, raw: data };
    } catch (e) { const n = normalizeError(e); return { success: false, error: n.message, error_code: n.code }; }
  },
};

// ---------- WordPress (self-hosted REST + WP.com basic) ----------
const wordpress: PublisherAdapter = {
  meta: {
    id: "wordpress",
    label: "WordPress",
    enabled: true,
    requiresApproval: false,
    credentialFields: [
      { key: "site_url", label: "Site URL", secret: false, required: true, help: "https://yourblog.com" },
      { key: "username", label: "Username", secret: false, required: true },
      { key: "app_password", label: "Application Password", secret: true, required: true, help: "Users → Profile → Application Passwords" },
    ],
    limits: { perMinute: 1, perHour: 10, perDay: 40, maxLength: 200000, minIntervalSeconds: 30, supportsMedia: false },
  },
  async validateAccount(acc) {
    try {
      const auth = btoa(`${acc.credentials.username}:${acc.credentials.app_password}`);
      const data = await jsonFetch(`${acc.credentials.site_url.replace(/\/$/, "")}/wp-json/wp/v2/users/me`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      return { ok: true, info: { id: data.id, name: data.name } };
    } catch (e) { return { ok: false, error: normalizeError(e).message }; }
  },
  async publishPost(acc, content): Promise<PublishResult> {
    try {
      const auth = btoa(`${acc.credentials.username}:${acc.credentials.app_password}`);
      const data = await jsonFetch(`${acc.credentials.site_url.replace(/\/$/, "")}/wp-json/wp/v2/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
        body: JSON.stringify({
          title: content.title || (content.text || "").split("\n")[0].slice(0, 80),
          content: content.text,
          status: "publish",
        }),
      });
      return { success: true, external_id: String(data.id), external_url: data.link, raw: data };
    } catch (e) { const n = normalizeError(e); return { success: false, error: n.message, error_code: n.code }; }
  },
};

// ---------- Ghost Admin API ----------
async function ghostJwt(adminKey: string): Promise<string> {
  const [id, secret] = adminKey.split(":");
  const header = { alg: "HS256", typ: "JWT", kid: id };
  const iat = Math.floor(Date.now() / 1000);
  const payload = { iat, exp: iat + 5 * 60, aud: "/admin/" };
  const enc = (o: any) =>
    btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const data = `${enc(header)}.${enc(payload)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(secret.match(/.{2}/g)!.map((b) => parseInt(b, 16))),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${data}.${sigB64}`;
}

const ghost: PublisherAdapter = {
  meta: {
    id: "ghost",
    label: "Ghost",
    enabled: true,
    requiresApproval: false,
    credentialFields: [
      { key: "admin_url", label: "Admin URL", secret: false, required: true, help: "https://yourblog.ghost.io" },
      { key: "admin_api_key", label: "Admin API Key", secret: true, required: true, help: "Settings → Integrations → Custom integration" },
    ],
    limits: { perMinute: 1, perHour: 10, perDay: 40, maxLength: 200000, minIntervalSeconds: 30, supportsMedia: false },
  },
  async validateAccount(acc) {
    try {
      const token = await ghostJwt(acc.credentials.admin_api_key);
      const data = await jsonFetch(`${acc.credentials.admin_url.replace(/\/$/, "")}/ghost/api/admin/site/`, {
        headers: { Authorization: `Ghost ${token}` },
      });
      return { ok: true, info: data.site };
    } catch (e) { return { ok: false, error: normalizeError(e).message }; }
  },
  async publishPost(acc, content): Promise<PublishResult> {
    try {
      const token = await ghostJwt(acc.credentials.admin_api_key);
      const body = {
        posts: [{
          title: content.title || (content.text || "").split("\n")[0].slice(0, 80),
          html: `<p>${(content.text || "").replace(/\n/g, "<br/>")}</p>`,
          status: "published",
        }],
      };
      const data = await jsonFetch(`${acc.credentials.admin_url.replace(/\/$/, "")}/ghost/api/admin/posts/?source=html`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Ghost ${token}` },
        body: JSON.stringify(body),
      });
      const post = data.posts?.[0];
      return { success: true, external_id: post?.id, external_url: post?.url, raw: data };
    } catch (e) { const n = normalizeError(e); return { success: false, error: n.message, error_code: n.code }; }
  },
};

// ---------- Discord Webhooks ----------
const discord: PublisherAdapter = {
  meta: {
    id: "discord",
    label: "Discord (Webhook)",
    enabled: true,
    requiresApproval: false,
    credentialFields: [
      { key: "webhook_url", label: "Webhook URL", secret: true, required: true, help: "Channel Settings → Integrations → Webhooks" },
    ],
    limits: { perMinute: 5, perHour: 60, perDay: 300, maxLength: 2000, minIntervalSeconds: 6, supportsMedia: true },
  },
  async validateAccount(acc) {
    try {
      // GET on webhook URL returns webhook metadata
      const res = await fetch(acc.credentials.webhook_url, { headers: { "User-Agent": ua } });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const data = await res.json();
      return { ok: true, info: { id: data.id, channel_id: data.channel_id, name: data.name } };
    } catch (e) { return { ok: false, error: normalizeError(e).message }; }
  },
  async publishPost(acc, content): Promise<PublishResult> {
    try {
      const text = buildText(content, 2000);
      const res = await fetch(`${acc.credentials.webhook_url}?wait=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": ua },
        body: JSON.stringify({ content: text, embeds: content.mediaUrls?.length ? [{ image: { url: content.mediaUrls[0] } }] : undefined }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const data = await res.json();
      return { success: true, external_id: data.id, external_url: null, raw: data };
    } catch (e) { const n = normalizeError(e); return { success: false, error: n.message, error_code: n.code }; }
  },
};

// ---------- Tumblr ----------
const tumblr: PublisherAdapter = {
  meta: {
    id: "tumblr",
    label: "Tumblr",
    enabled: true,
    requiresApproval: false,
    credentialFields: [
      { key: "blog_identifier", label: "Blog (e.g. myblog.tumblr.com)", secret: false, required: true },
      { key: "oauth2_token", label: "OAuth2 Access Token", secret: true, required: true, help: "Obtain via Tumblr OAuth2 flow" },
    ],
    limits: { perMinute: 2, perHour: 30, perDay: 250, maxLength: 4096, minIntervalSeconds: 15, supportsMedia: true },
  },
  async validateAccount(acc) {
    try {
      const data = await jsonFetch("https://api.tumblr.com/v2/user/info", {
        headers: { Authorization: `Bearer ${acc.credentials.oauth2_token}` },
      });
      return { ok: true, info: data.response?.user };
    } catch (e) { return { ok: false, error: normalizeError(e).message }; }
  },
  async publishPost(acc, content): Promise<PublishResult> {
    try {
      const data = await jsonFetch(`https://api.tumblr.com/v2/blog/${acc.credentials.blog_identifier}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${acc.credentials.oauth2_token}` },
        body: JSON.stringify({
          content: [{ type: "text", text: buildText(content, 4096) }],
          tags: (content.hashtags || []).map((t) => t.replace(/^#/, "")),
        }),
      });
      return { success: true, external_id: data.response?.id_string || String(data.response?.id), external_url: data.response?.display_text, raw: data };
    } catch (e) { const n = normalizeError(e); return { success: false, error: n.message, error_code: n.code }; }
  },
};

// ---------- Pinterest ----------
const pinterest: PublisherAdapter = {
  meta: {
    id: "pinterest",
    label: "Pinterest",
    enabled: true,
    requiresApproval: false,
    credentialFields: [
      { key: "access_token", label: "Access Token", secret: true, required: true, help: "Pinterest Developer → My Apps" },
      { key: "board_id", label: "Board ID", secret: false, required: true },
    ],
    limits: { perMinute: 2, perHour: 30, perDay: 100, maxLength: 500, minIntervalSeconds: 20, supportsMedia: true },
  },
  async validateAccount(acc) {
    try {
      const data = await jsonFetch("https://api.pinterest.com/v5/user_account", {
        headers: { Authorization: `Bearer ${acc.credentials.access_token}` },
      });
      return { ok: true, info: data };
    } catch (e) { return { ok: false, error: normalizeError(e).message }; }
  },
  async publishPost(acc, content): Promise<PublishResult> {
    try {
      if (!content.mediaUrls?.length) throw new Error("Pinterest requires at least one image URL");
      const data = await jsonFetch("https://api.pinterest.com/v5/pins", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${acc.credentials.access_token}` },
        body: JSON.stringify({
          board_id: acc.credentials.board_id,
          title: truncate(content.title || content.text, 100),
          description: truncate(content.text, 500),
          link: content.link || content.canonicalUrl,
          media_source: { source_type: "image_url", url: content.mediaUrls[0] },
        }),
      });
      return { success: true, external_id: data.id, external_url: `https://www.pinterest.com/pin/${data.id}/`, raw: data };
    } catch (e) { const n = normalizeError(e); return { success: false, error: n.message, error_code: n.code }; }
  },
};

// ---------- GitHub Gist ----------
const github: PublisherAdapter = {
  meta: {
    id: "github",
    label: "GitHub Gist",
    enabled: true,
    requiresApproval: false,
    credentialFields: [
      { key: "token", label: "Personal Access Token (gist scope)", secret: true, required: true },
      { key: "filename", label: "Default filename", secret: false, required: false, help: "default: post.md" },
    ],
    limits: { perMinute: 5, perHour: 60, perDay: 200, maxLength: 100000, minIntervalSeconds: 10, supportsMedia: false },
  },
  async validateAccount(acc) {
    try {
      const data = await jsonFetch("https://api.github.com/user", {
        headers: { Authorization: `token ${acc.credentials.token}`, Accept: "application/vnd.github+json" },
      });
      return { ok: true, info: { login: data.login, id: data.id } };
    } catch (e) { return { ok: false, error: normalizeError(e).message }; }
  },
  async publishPost(acc, content): Promise<PublishResult> {
    try {
      const filename = acc.credentials.filename || "post.md";
      const data = await jsonFetch("https://api.github.com/gists", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `token ${acc.credentials.token}`,
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({
          description: content.title || (content.text || "").split("\n")[0].slice(0, 80),
          public: true,
          files: { [filename]: { content: content.text } },
        }),
      });
      return { success: true, external_id: data.id, external_url: data.html_url, raw: data };
    } catch (e) { const n = normalizeError(e); return { success: false, error: n.message, error_code: n.code }; }
  },
};

// ---------- Blogger ----------
const blogger: PublisherAdapter = {
  meta: {
    id: "blogger",
    label: "Blogger",
    enabled: true,
    requiresApproval: false,
    credentialFields: [
      { key: "blog_id", label: "Blog ID", secret: false, required: true },
      { key: "access_token", label: "OAuth Access Token", secret: true, required: true, help: "Google OAuth (scope blogger)" },
    ],
    limits: { perMinute: 1, perHour: 10, perDay: 50, maxLength: 100000, minIntervalSeconds: 30, supportsMedia: false },
  },
  async validateAccount(acc) {
    try {
      const data = await jsonFetch(`https://www.googleapis.com/blogger/v3/blogs/${acc.credentials.blog_id}`, {
        headers: { Authorization: `Bearer ${acc.credentials.access_token}` },
      });
      return { ok: true, info: { name: data.name, url: data.url } };
    } catch (e) { return { ok: false, error: normalizeError(e).message }; }
  },
  async publishPost(acc, content): Promise<PublishResult> {
    try {
      const data = await jsonFetch(`https://www.googleapis.com/blogger/v3/blogs/${acc.credentials.blog_id}/posts/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${acc.credentials.access_token}` },
        body: JSON.stringify({
          title: content.title || (content.text || "").split("\n")[0].slice(0, 80),
          content: (content.text || "").replace(/\n/g, "<br/>"),
          labels: (content.hashtags || []).map((t) => t.replace(/^#/, "")),
        }),
      });
      return { success: true, external_id: data.id, external_url: data.url, raw: data };
    } catch (e) { const n = normalizeError(e); return { success: false, error: n.message, error_code: n.code }; }
  },
};

// ---------- Disabled / approval-gated adapters ----------
// These are stubbed but registered so the dashboard can show them as
// "requires approval / credentials". They will not attempt to publish.
function approvalStub(id: string, label: string, fields: PlatformMeta["credentialFields"], limits: PlatformMeta["limits"], notes: string): PublisherAdapter {
  return {
    meta: { id, label, enabled: false, requiresApproval: true, credentialFields: fields, limits, notes },
    async validateAccount() { return { ok: false, error: `${label} requires platform approval — adapter disabled by default.` }; },
    async publishPost() { return { success: false, error: `${label} adapter is disabled. Enable it manually after platform approval.`, error_code: "disabled" }; },
  };
}

const linkedin = approvalStub("linkedin", "LinkedIn",
  [
    { key: "access_token", label: "OAuth Access Token (w_member_social)", secret: true, required: true },
    { key: "author_urn", label: "Author URN (urn:li:person:...)", secret: false, required: true },
  ],
  { perMinute: 1, perHour: 10, perDay: 25, maxLength: 3000, minIntervalSeconds: 60, supportsMedia: true },
  "Requires LinkedIn Marketing Developer Platform approval for w_member_social scope.");

const facebook = approvalStub("facebook", "Facebook Page",
  [
    { key: "page_id", label: "Page ID", secret: false, required: true },
    { key: "page_access_token", label: "Page Access Token", secret: true, required: true },
  ],
  { perMinute: 1, perHour: 25, perDay: 100, maxLength: 63206, minIntervalSeconds: 60, supportsMedia: true },
  "Requires Meta App Review for pages_manage_posts scope.");

const instagram = approvalStub("instagram", "Instagram (Graph API)",
  [
    { key: "ig_user_id", label: "IG Business User ID", secret: false, required: true },
    { key: "page_access_token", label: "Page Access Token", secret: true, required: true },
  ],
  { perMinute: 1, perHour: 25, perDay: 50, maxLength: 2200, minIntervalSeconds: 60, supportsMedia: true },
  "Requires Meta App Review + IG Business account linked to a FB Page.");

const threads = approvalStub("threads", "Threads",
  [
    { key: "user_id", label: "Threads User ID", secret: false, required: true },
    { key: "access_token", label: "Access Token", secret: true, required: true },
  ],
  { perMinute: 1, perHour: 25, perDay: 250, maxLength: 500, minIntervalSeconds: 60, supportsMedia: true },
  "Requires Meta Threads API access (rolling out).");

const tiktok = approvalStub("tiktok", "TikTok",
  [{ key: "access_token", label: "OAuth Access Token", secret: true, required: true }],
  { perMinute: 1, perHour: 10, perDay: 25, maxLength: 2200, minIntervalSeconds: 60, supportsMedia: true },
  "Requires TikTok for Developers content posting API approval.");

const youtube = approvalStub("youtube", "YouTube Community",
  [{ key: "access_token", label: "OAuth Access Token", secret: true, required: true }],
  { perMinute: 1, perHour: 6, perDay: 20, maxLength: 1500, minIntervalSeconds: 60, supportsMedia: true },
  "Community posts API limited; channels need 500+ subscribers.");

const twitter = approvalStub("twitter", "X / Twitter",
  [
    { key: "api_key", label: "API Key", secret: true, required: true },
    { key: "api_secret", label: "API Secret", secret: true, required: true },
    { key: "access_token", label: "Access Token", secret: true, required: true },
    { key: "access_secret", label: "Access Token Secret", secret: true, required: true },
  ],
  { perMinute: 1, perHour: 17, perDay: 50, maxLength: 280, minIntervalSeconds: 60, supportsMedia: true },
  "Requires paid X API plan. Adapter disabled by default.");

// ---------- Registry ----------
export const ADAPTERS: Record<string, PublisherAdapter> = {
  telegram, bluesky, mastodon, devto, hashnode, wordpress, ghost, discord, tumblr,
  pinterest, github, blogger,
  linkedin, facebook, instagram, threads, tiktok, youtube, twitter,
};

export function getAdapter(platform: string): PublisherAdapter | null {
  return ADAPTERS[platform] || null;
}

export function listAdapterMeta(): PlatformMeta[] {
  return Object.values(ADAPTERS).map((a) => a.meta);
}
