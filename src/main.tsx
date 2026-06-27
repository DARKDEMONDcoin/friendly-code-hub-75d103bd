import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import "./styles/claude-chat.css";
import "@fontsource/geist/400.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist/700.css";
import "@fontsource/geist/800.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
// Fonts loaded via Google Fonts <link> in index.html (Space Grotesk, DM Sans,
// Work Sans, Inter, Instrument Serif, Noto Serif Arabic) — @fontsource was
// duplicating those payloads. Slides typography is still loaded lazily by
// the Slides page to keep the initial bundle small.
// Note: slides-typography is loaded lazily by the Slides page to keep the
// initial bundle small. Fontsource Work Sans / Instrument Serif weights are
// served via the Google Fonts link in index.html (display=swap) so we don't
// pay for ~4 extra render-blocking CSS files on first paint.

import { reportError, friendlyUserMessage, sanitizeErrorMessage } from "@/lib/errors";
import { toast as sonnerToast } from "sonner";
import { patchSupabaseAuth } from "@/integrations/supabase/patchAuth";

patchSupabaseAuth();

// Globally sanitize every toast message so we never leak provider names or
// the raw "Edge Function returned a non-2xx status code" string to users.
(() => {
  const cleanArg = (arg: unknown, isError = false): unknown => {
    if (arg == null) return arg;
    if (typeof arg === "string") {
      return isError ? friendlyUserMessage(arg, arg) : sanitizeErrorMessage(arg);
    }
    if (arg instanceof Error) {
      return isError ? friendlyUserMessage(arg) : sanitizeErrorMessage(arg);
    }
    return arg;
  };
  const wrap = <T extends (...a: any[]) => any>(fn: T, isError = false): T =>
    ((...args: any[]) => {
      args[0] = cleanArg(args[0], isError);
      if (args[1] && typeof args[1] === "object" && "description" in args[1]) {
        args[1] = { ...args[1], description: cleanArg(args[1].description, isError) };
      }
      return fn(...args);
    }) as T;
  const t = sonnerToast as any;
  t.error = wrap(t.error.bind(t), true);
  if (t.warning) t.warning = wrap(t.warning.bind(t), true);
  t.success = wrap(t.success.bind(t));
  if (t.info) t.info = wrap(t.info.bind(t));
  if (t.message) t.message = wrap(t.message.bind(t));
})();

// Prevent right-click context menu
// Prevent right-click context menu, except inside editable fields so users can copy/paste normally
document.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement | null;
  if (t && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))
    return;
  e.preventDefault();
});

// Report any unhandled error or promise rejection to the admin (best-effort).
let __lastReport = 0;
const __reportThrottled = (err: unknown, source: string) => {
  const now = Date.now();
  if (now - __lastReport < 2000) return; // throttle bursts
  __lastReport = now;
  void reportError(err, { source });
};

// Transient errors we should silently recover from instead of bubbling up.
const __TRANSIENT_RE =
  /(Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk \d+ failed|ChunkLoadError|Loading CSS chunk|insertBefore|removeChild|is not a child of this node)/i;
const __IGNORED_BROWSER_NOISE_RE = /ResizeObserver loop completed with undelivered notifications/i;
const __RELOAD_KEY = "__megsy_global_reloaded_at";
const __maybeReload = (err: unknown) => {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? "");
  if (!__TRANSIENT_RE.test(msg)) return false;
  try {
    const last = Number(sessionStorage.getItem(__RELOAD_KEY) || 0);
    const now = Date.now();
    if (now - last < 60_000) return false;
    sessionStorage.setItem(__RELOAD_KEY, String(now));
    setTimeout(() => window.location.reload(), 60);
    return true;
  } catch {
    return false;
  }
};

window.addEventListener("error", (e) => {
  const err = e.error ?? e.message;
  if (__IGNORED_BROWSER_NOISE_RE.test(String(err ?? e.message ?? ""))) {
    e.preventDefault();
    return;
  }
  __reportThrottled(err, "window.onerror");
  __maybeReload(err);
});
window.addEventListener("unhandledrejection", (e) => {
  if (__IGNORED_BROWSER_NOISE_RE.test(String(e.reason ?? ""))) return;
  __reportThrottled(e.reason, "unhandledrejection");
  __maybeReload(e.reason);
});

// Apply saved user bubble color
const savedBubble = localStorage.getItem("userBubbleColor");
if (savedBubble) document.documentElement.style.setProperty("--user-bubble", savedBubble);

// Keep `position: fixed` elements pinned to the visual viewport on mobile
// (iOS Safari shifts fixed elements when the URL bar / keyboard show or hide).
// Components can read `--kb-offset` to translate themselves above the keyboard.
(() => {
  const vv = window.visualViewport;
  if (!vv) return;
  let raf = 0;
  const apply = () => {
    raf = 0;
    // True keyboard height = layout viewport bottom - visual viewport bottom.
    // Includes offsetTop so the bar doesn't drift when the visual viewport
    // is scrolled (iOS scrolls focused inputs into view).
    const delta = window.innerHeight - vv.height - vv.offsetTop;
    const offset = delta > 120 ? Math.round(delta) : 0;
    document.documentElement.style.setProperty("--kb-offset", `${offset}px`);
  };
  const update = () => {
    if (raf) return;
    raf = requestAnimationFrame(apply);
  };
  update();
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  window.addEventListener("orientationchange", update);
})();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>,
);
