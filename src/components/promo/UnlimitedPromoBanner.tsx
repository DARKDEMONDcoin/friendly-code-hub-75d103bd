import { useNavigate } from "react-router-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { usePromoCountdown } from "@/hooks/usePromoCountdown";

const pad = (n: number) => String(n).padStart(2, "0");
// v9 → permanent dismissal (localStorage). Auto-hides after AUTO_HIDE_MS.
const DISMISS_KEY = "promo-banner-dismissed-v9";
const HEIGHT_CACHE_KEY = "promo-banner-h-v9";
const AUTO_HIDE_MS = 60_000;

interface UnlimitedPromoBannerProps {
  chatSurfaceOffset?: number;
}

const UnlimitedPromoBanner = ({ chatSurfaceOffset = 0 }: UnlimitedPromoBannerProps) => {
  const navigate = useNavigate();
  const { active, days, hours, minutes, seconds } = usePromoCountdown();
  const ref = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  const visible = active && !dismissed;

  // Auto-dismiss after 60s — permanent (localStorage) so it never returns.
  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
      setDismissed(true);
    }, AUTO_HIDE_MS);
    return () => window.clearTimeout(t);
  }, [visible]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    if (!visible || chatSurfaceOffset > 0) {
      root.style.setProperty("--promo-banner-h", "0px");
      return;
    }
    try {
      const cached = sessionStorage.getItem(HEIGHT_CACHE_KEY);
      if (cached) root.style.setProperty("--promo-banner-h", `${cached}px`);
    } catch {
      /* ignore */
    }
  }, [visible, chatSurfaceOffset]);

  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!visible || !el || chatSurfaceOffset > 0) {
      root.style.setProperty("--promo-banner-h", "0px");
      return;
    }
    const update = () => {
      const h = el.offsetHeight;
      root.style.setProperty("--promo-banner-h", `${h}px`);
      try {
        sessionStorage.setItem(HEIGHT_CACHE_KEY, String(h));
      } catch {
        /* ignore */
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [visible, chatSurfaceOffset]);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  if (!visible) return null;

  const goPricing = () => navigate("/pricing");

  return (
    <div
      ref={ref}
      role="region"
      aria-label="Limited time offer"
      onClick={goPricing}
      className="group z-40 flex cursor-pointer items-center gap-4 overflow-hidden px-4 sm:px-6 md:px-8 relative animate-in fade-in slide-in-from-top-2 duration-500"
      style={{
        height: 40,
        position: chatSurfaceOffset > 0 ? "fixed" : "relative",
        top: chatSurfaceOffset > 0 ? 0 : undefined,
        left: chatSurfaceOffset > 0 ? chatSurfaceOffset : undefined,
        right: chatSurfaceOffset > 0 ? 0 : undefined,
        width: chatSurfaceOffset > 0 ? "auto" : "100%",
        backgroundColor: "hsl(var(--background))",
        borderBottom: "1px solid hsl(var(--surface-4) / 0.6)",
      }}
    >
      {/* Centered, minimal message */}
      <div className="relative mx-auto flex min-w-0 items-center justify-center gap-3 text-center">
        <span
          className="truncate text-[12.5px] font-medium tracking-[0.02em] text-[hsl(var(--brand-parchment))]/90"
        >
          <span className="sm:hidden">50% off — Unlimited, half price</span>
          <span className="hidden sm:inline">
            Limited offer — <span className="font-semibold text-[hsl(var(--brand-parchment))]">50% off</span> Unlimited Chat, Images &amp; Videos
          </span>
        </span>
        <span
          className="hidden items-center gap-1 text-[11px] tabular-nums text-[hsl(var(--brand-muted))] md:inline-flex"
          style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
          aria-live="polite"
        >
          {days > 0 && <span>{pad(days)}d</span>}
          <span>{pad(hours)}:{pad(minutes)}:<span className="text-[hsl(var(--brand-parchment))]">{pad(seconds)}</span></span>
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goPricing();
          }}
          className="ml-1 inline-flex h-6 items-center whitespace-nowrap rounded-full border border-[hsl(var(--brand-parchment))]/25 px-2.5 text-[11px] font-semibold text-[hsl(var(--brand-parchment))] transition-colors hover:bg-[hsl(var(--brand-parchment))]/10"
        >
          Claim →
        </button>
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[hsl(var(--brand-muted))] transition-colors hover:bg-[hsl(var(--brand-parchment))]/10 hover:text-[hsl(var(--brand-parchment))]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default UnlimitedPromoBanner;
