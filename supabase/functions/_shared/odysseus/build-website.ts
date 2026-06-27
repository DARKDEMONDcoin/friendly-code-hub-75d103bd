// build_website tool — async React 18 + Vite + Tailwind site generator.
//
// The tool returns IMMEDIATELY with {site_id, preview_url, status:"building"}
// so the chat SSE never times out. The actual plan→build→publish pipeline
// runs in the background via EdgeRuntime.waitUntil and writes progress into
// `generated_sites` (realtime-enabled) so the UI can show live status.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const DASHSCOPE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";

export type ProgressFn = (event: {
  step: string;
  label: string;
  status: "running" | "done" | "error";
  index?: number;
  total?: number;
  detail?: string;
}) => void;

export interface BuildWebsiteCtx {
  dashscopeKey: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  emitProgress?: ProgressFn;
}

export interface BuildKickoffResult {
  site_id: string;
  preview_url: string;
  status: "building";
  message: string;
}

function admin(ctx: BuildWebsiteCtx) {
  return createClient(ctx.supabaseUrl, ctx.serviceRoleKey, { auth: { persistSession: false } });
}

function extractJson(raw: string): string {
  const m = raw.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  return (m ? m[1] : raw).trim();
}

function publicSiteUrl(supabaseUrl: string, userId: string, siteId: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/published-sites/${userId}/${siteId}/index.html`;
}

/**
 * Public entry. Inserts a placeholder row, kicks the build off in the
 * background, and returns the deterministic preview_url instantly so the
 * model can share it. The URL becomes live ~60-120s later when the upload
 * finishes; until then it 404s.
 */
export async function kickoffBuildWebsite(
  ctx: BuildWebsiteCtx,
  brief: string,
): Promise<BuildKickoffResult> {
  const site_id = crypto.randomUUID();
  const preview_url = publicSiteUrl(ctx.supabaseUrl, ctx.userId, site_id);
  const sb = admin(ctx);
  try {
    await sb.from("generated_sites").insert({
      id: site_id,
      user_id: ctx.userId,
      title: brief.slice(0, 80) || "Generated Website",
      prompt: brief.slice(0, 4000),
      preview_url,
      status: "building",
      progress: 1,
      tasks: [{ step: "queued", label: "بدأ التنفيذ", status: "running" }],
      is_public: true,
    });
  } catch (e) {
    // If insert fails the tool still returns — but the user will see no progress.
    console.error("[build_website] insert generated_sites failed:", e);
  }

  // @ts-ignore EdgeRuntime is provided by Supabase
  const er: any = typeof EdgeRuntime !== "undefined" ? (EdgeRuntime as any) : null;
  const task = runFullBuild(ctx, brief, site_id, preview_url).catch(async (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[build_website] background build failed:", msg);
    try {
      await sb.from("generated_sites").update({
        status: "failed",
        progress: 100,
        error_message: msg.slice(0, 1000),
      }).eq("id", site_id);
    } catch { /* noop */ }
  });
  if (er?.waitUntil) er.waitUntil(task);

  return {
    site_id,
    preview_url,
    status: "building",
    message:
      `Build started. The site will be live at ${preview_url} in about 60-120 seconds. ` +
      `Tell the user clearly: I'm building your site now, share the URL as a clickable link, ` +
      `and mention it'll be ready in ~1-2 minutes. The UI shows live progress.`,
  };
}

/** Full plan + sandbox + build + publish pipeline. Updates generated_sites. */
async function runFullBuild(
  ctx: BuildWebsiteCtx,
  brief: string,
  site_id: string,
  preview_url: string,
): Promise<void> {
  const sb = admin(ctx);
  const tasks: Array<{ step: string; label: string; status: string }> = [];

  const emit = async (
    step: string,
    label: string,
    status: "running" | "done" | "error",
    progress: number,
    extra: any = {},
  ) => {
    // Replace last entry if same step
    const last = tasks[tasks.length - 1];
    if (last && last.step === step) last.status = status, last.label = label;
    else tasks.push({ step, label, status });
    ctx.emitProgress?.({ step, label, status, ...extra });
    try {
      await sb.from("generated_sites").update({
        progress: Math.max(1, Math.min(99, Math.round(progress))),
        tasks,
        ...(status === "error" ? { status: "failed", error_message: extra?.detail || label } : {}),
      }).eq("id", site_id);
    } catch { /* noop */ }
  };

  // ── 1. PLAN + GENERATE files ─────────────────────────────────────────────
  await emit("plan", "تحليل الطلب وتقسيمه لمهام", "running", 5);
  const planPrompt = `You are a senior React engineer building a production-ready website.

USER BRIEF: ${brief}

Generate a complete Vite + React 18 + TypeScript + Tailwind CSS v3 single-page site.

Rules:
- Use React 18, react-router-dom v6 if multiple pages are needed (else a single page is fine).
- Use Tailwind CSS only (no other CSS frameworks). Modern, beautiful, responsive.
- Use lucide-react icons if needed. Add it to package.json deps.
- All content must be RELEVANT to the brief (real copy, not lorem ipsum).
- Pick a tasteful color palette that matches the brief (NOT generic purple).
- Mobile-first. Smooth animations with Tailwind transitions.
- NO server, NO database, NO API calls. Pure static React.
- Files must be small (≤200 lines each). Split into components under src/components/.

Return STRICT JSON (no commentary outside) with this shape:
{
  "title": "site title for <title>",
  "tasks": ["short label of each major step you took"],
  "files": [
    { "path": "package.json", "content": "..." },
    { "path": "vite.config.ts", "content": "..." },
    { "path": "tailwind.config.js", "content": "..." },
    { "path": "postcss.config.js", "content": "..." },
    { "path": "index.html", "content": "..." },
    { "path": "src/main.tsx", "content": "..." },
    { "path": "src/App.tsx", "content": "..." },
    { "path": "src/index.css", "content": "@tailwind base;\\n@tailwind components;\\n@tailwind utilities;" }
  ]
}

package.json MUST have:
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1", "lucide-react": "^0.460.0" }
  "devDependencies": { "vite": "^5.4.10", "@vitejs/plugin-react": "^4.3.3", "typescript": "^5.6.3", "tailwindcss": "^3.4.14", "postcss": "^8.4.47", "autoprefixer": "^10.4.20", "@types/react": "^18.3.12", "@types/react-dom": "^18.3.1" }
  "scripts": { "build": "vite build", "preview": "vite preview" }

vite.config.ts MUST set base: './' so the built bundle works from any subpath.

Output JSON only. No prose.`;

  const callPlanner = async (model: string) => {
    const r = await fetch(DASHSCOPE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.dashscopeKey}` },
      body: JSON.stringify({
        model, stream: false, temperature: 0.4, max_tokens: 16000,
        messages: [{ role: "user", content: planPrompt }],
      }),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, text: j?.choices?.[0]?.message?.content || "" };
  };
  let planText = "";
  const p1 = await callPlanner("claude-sonnet-4-5");
  planText = p1.ok ? p1.text : "";
  if (!planText) planText = (await callPlanner("qwen3-coder-plus")).text;
  if (!planText) { await emit("plan", "فشل التخطيط", "error", 5); throw new Error("planner empty"); }
  let plan: any;
  try { plan = JSON.parse(extractJson(planText)); }
  catch (e) { await emit("plan", "نتيجة JSON غير صالحة", "error", 5); throw new Error(`planner JSON: ${e instanceof Error ? e.message : String(e)}`); }
  const files: Array<{ path: string; content: string }> = Array.isArray(plan?.files) ? plan.files : [];
  if (files.length < 5) { await emit("plan", "خطة الملفات غير مكتملة", "error", 5); throw new Error("too few files"); }
  await emit("plan", `تم التخطيط (${files.length} ملف)`, "done", 20);

  // Persist the planned source files so the chat can list & view them.
  // Truncate per-file at 200 KB, cap total at ~2 MB to keep the row small.
  try {
    const MAX_FILE = 200 * 1024;
    const MAX_TOTAL = 2 * 1024 * 1024;
    let used = 0;
    const slim: Array<{ path: string; content: string; truncated?: boolean }> = [];
    for (const f of files) {
      const raw = String(f.content ?? "");
      const trimmed = raw.length > MAX_FILE ? raw.slice(0, MAX_FILE) : raw;
      if (used + trimmed.length > MAX_TOTAL) {
        slim.push({ path: f.path, content: "// [truncated — file too large to preview]", truncated: true });
      } else {
        slim.push(raw.length > MAX_FILE ? { path: f.path, content: trimmed, truncated: true } : { path: f.path, content: raw });
        used += trimmed.length;
      }
    }
    await sb.from("generated_sites").update({
      files: slim as any,
      title: String(plan?.title || "Generated Website").slice(0, 200),
    }).eq("id", site_id);
  } catch { /* noop */ }

  // ── 2. Boot E2B sandbox ──────────────────────────────────────────────────
  await emit("sandbox", "تشغيل بيئة البناء (E2B)", "running", 25);
  const { pickE2BKey, reportE2BFailure } = await import("../e2b-keys.ts");
  const key = await pickE2BKey();
  if (!key) { await emit("sandbox", "لا يوجد مفتاح E2B متاح", "error", 25); throw new Error("no_active_e2b_key"); }
  const { Sandbox } = await import("https://esm.sh/@e2b/code-interpreter@2.6.1");
  let sbx: any;
  try {
    sbx = await Sandbox.create({ apiKey: key.api_key, timeoutMs: 300_000 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const m = /\b(401|402|403|429)\b/.exec(msg);
    await reportE2BFailure(key.id, m ? Number(m[1]) : 500, msg);
    await emit("sandbox", "فشل فتح الـ sandbox", "error", 25);
    throw new Error(`e2b: ${msg}`);
  }
  await emit("sandbox", "تم تجهيز البيئة", "done", 35);

  try {
    // ── 3. Write files ──────────────────────────────────────────────────
    await emit("write", `كتابة ${files.length} ملف`, "running", 40);
    const root = "/home/user/site";
    await sbx.commands.run(`mkdir -p ${root}`, { timeoutMs: 10_000 });

    const lenientTsconfig = JSON.stringify({
      compilerOptions: {
        target: "ES2020", useDefineForClassFields: true,
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        module: "ESNext", skipLibCheck: true, moduleResolution: "bundler",
        resolveJsonModule: true, isolatedModules: true, noEmit: true,
        jsx: "react-jsx", strict: false, noUnusedLocals: false,
        noUnusedParameters: false, allowJs: true, esModuleInterop: true,
      },
      include: ["src"],
    }, null, 2);

    const pkgFile = files.find((f) => f.path === "package.json");
    if (pkgFile) {
      try {
        const pkg = JSON.parse(pkgFile.content);
        pkg.scripts = pkg.scripts || {};
        pkg.scripts.build = "vite build";
        pkg.scripts.preview = "vite preview";
        pkgFile.content = JSON.stringify(pkg, null, 2);
      } catch { /* noop */ }
    }

    const filtered = files.filter((f) => !["tsconfig.json", "tsconfig.node.json", "tsconfig.app.json"].includes(f.path));
    filtered.push({ path: "tsconfig.json", content: lenientTsconfig });

    await Promise.all(filtered.map(async (f) => {
      const full = `${root}/${f.path}`;
      const dir = full.substring(0, full.lastIndexOf("/"));
      if (dir) await sbx.commands.run(`mkdir -p ${JSON.stringify(dir)}`, { timeoutMs: 10_000 });
      await sbx.files.write(full, f.content);
    }));
    await emit("write", `تم كتابة ${filtered.length} ملف`, "done", 50);

    // ── 4. npm install ───────────────────────────────────────────────────
    await emit("install", "تثبيت الحزم", "running", 55);
    const inst = await sbx.commands.run("cd /home/user/site && npm install --no-audit --no-fund --prefer-offline --loglevel=error", { timeoutMs: 240_000 });
    if (inst.exitCode !== 0) {
      await emit("install", "فشل npm install", "error", 55, { detail: (inst.stderr || "").slice(0, 400) });
      throw new Error(`npm install exit ${inst.exitCode}: ${(inst.stderr || "").slice(0, 400)}`);
    }
    await emit("install", "تم تثبيت الحزم", "done", 70);

    // ── 5. vite build ────────────────────────────────────────────────────
    await emit("build", "بناء الإنتاج (vite build)", "running", 75);
    const bld = await sbx.commands.run("cd /home/user/site && ./node_modules/.bin/vite build --logLevel=error", { timeoutMs: 180_000 });
    if (bld.exitCode !== 0) {
      await emit("build", "فشل البناء", "error", 75, { detail: (bld.stderr || bld.stdout || "").slice(0, 600) });
      throw new Error(`vite build exit ${bld.exitCode}: ${(bld.stderr || bld.stdout || "").slice(0, 600)}`);
    }
    await emit("build", "تم البناء بنجاح", "done", 85);

    // ── 6. Read dist/ ────────────────────────────────────────────────────
    await emit("publish", "نشر الموقع", "running", 90);
    const dist = `${root}/dist`;
    const lsRes = await sbx.commands.run(`cd ${dist} && find . -type f -printf "%P\\n"`, { timeoutMs: 15_000 });
    if (lsRes.exitCode !== 0) throw new Error(`list dist: ${lsRes.stderr}`);
    const relPaths = (lsRes.stdout || "").split("\n").map((s: string) => s.trim()).filter(Boolean);
    const distFiles: Array<{ path: string; bytes: Uint8Array }> = [];
    for (const rel of relPaths) {
      const buf = await sbx.files.read(`${dist}/${rel}`, { format: "bytes" });
      distFiles.push({ path: rel, bytes: buf as Uint8Array });
    }

    // ── 7. Upload ────────────────────────────────────────────────────────
    const basePath = `${ctx.userId}/${site_id}`;
    const mimeFor = (p: string) => {
      const ext = p.split(".").pop()?.toLowerCase();
      switch (ext) {
        case "html": return "text/html; charset=utf-8";
        case "css":  return "text/css; charset=utf-8";
        case "js": case "mjs": return "application/javascript; charset=utf-8";
        case "json": return "application/json; charset=utf-8";
        case "svg":  return "image/svg+xml";
        case "png":  return "image/png";
        case "jpg": case "jpeg": return "image/jpeg";
        case "webp": return "image/webp";
        case "woff": return "font/woff";
        case "woff2": return "font/woff2";
        case "ico":  return "image/x-icon";
        case "map":  return "application/json";
        default:     return "application/octet-stream";
      }
    };
    let uploaded = 0;
    for (const f of distFiles) {
      const { error } = await sb.storage.from("published-sites").upload(`${basePath}/${f.path}`, f.bytes, {
        contentType: mimeFor(f.path), upsert: true,
      });
      if (error) {
        await emit("publish", `فشل رفع ${f.path}`, "error", 90, { detail: error.message });
        throw new Error(`upload ${f.path}: ${error.message}`);
      }
      uploaded++;
    }

    await emit("publish", `تم نشر ${uploaded} ملف`, "done", 100);
    // Final state — flip to published.
    try {
      await sb.from("generated_sites").update({
        status: "published",
        progress: 100,
        preview_url,
        published_url: preview_url,
      }).eq("id", site_id);
    } catch { /* noop */ }
    ctx.emitProgress?.({ step: "done", label: "الموقع جاهز", status: "done", detail: preview_url });
  } finally {
    try { await sbx.kill(); } catch { /* noop */ }
  }
}

/** Back-compat synchronous wrapper — DO NOT use in chat (will time out). */
export const buildWebsite = kickoffBuildWebsite;
