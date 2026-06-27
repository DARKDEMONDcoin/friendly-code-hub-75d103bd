/** @doc Plans, yearly toggle, MC top-up packs and the official pricing FAQ. */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Loader2, Info, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "@/lib/supabaseFunction";
import GlowButton from "@/components/branding/GlowButton";
import { goBackOr } from "@/lib/navigation";
import { WORKSPACE_PRODUCT_MAP } from "@/lib/workspacePlans";
import SEOHead from "@/components/common/SEOHead";
import MegsyStar from "@/components/branding/MegsyStar";
import UnlimitedPromoCard from "@/components/promo/UnlimitedPromoCard";

import {
  PLANS,
  ENTERPRISE_FEATURES,
  SERVICES_GUIDE,
  FAQS,
  type PlanTier,
} from "@/data/pricingData";

const PRODUCT_MAP: Record<PlanTier, { monthly: string; yearly: string }> = WORKSPACE_PRODUCT_MAP;

const BUBBLES = Array.from({ length: 14 });

const PricingPage = () => {
  const navigate = useNavigate();
  const [isYearly, setIsYearly] = useState(false);
  const [loadingTier, setLoadingTier] = useState<PlanTier | null>(null);
  // Current plan on the user's primary workspace — used to toggle the Starter
  // card between "Start free trial" and "Subscribe now & end trial".
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: ws } = await supabase
        .from("workspaces")
        .select("plan")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setCurrentPlan((ws as any)?.plan ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isStarterTrialActive = (currentPlan ?? "").toLowerCase() === "starter";

  const handleSubscribe = async (
    tier: PlanTier,
    opts: { trial?: boolean; interval?: "monthly" | "yearly" } = {},
  ) => {
    // Hard double-click guard — block if ANY tier is already processing
    if (loadingTier) return;
    setLoadingTier(tier);

    const interval: "monthly" | "yearly" = opts.interval ?? (isYearly ? "yearly" : "monthly");

    // Validate session and try to refresh if expired — prevents 502 from stale tokens
    let {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      session = refreshed.session;
    }
    if (!session?.access_token) {
      setLoadingTier(null);
      await supabase.auth.signOut().catch(() => {});
      toast.error("Please sign in again to continue.");
      navigate("/auth?redirect=/pricing");
      return;
    }

    try {
      // Server resolves the actual product_id from {tier, interval} — never trust
      // the client to choose which Dodo product to charge against.
      const { data, error } = await invokeFunction("openrouter-media", {
        body: { kind: "checkout", tier, interval, trial: opts.trial === true },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) {
        // Auth issue → force re-login instead of showing a confusing gateway error
        const msg = (error as any)?.message?.toLowerCase?.() || "";
        if (msg.includes("unauthorized") || msg.includes("401") || msg.includes("jwt")) {
          await supabase.auth.signOut().catch(() => {});
          toast.error("Your session expired. Please sign in again.");
          navigate("/auth?redirect=/pricing");
          return;
        }
        throw error;
      }
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data?.error || "Checkout failed");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to open checkout. Please try again.");
      setLoadingTier(null);
    }
  };

  const handleStartEmpire = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    navigate(session ? "/chat" : "/auth?redirect=/chat");
  };

  return (
    <div className="min-h-dvh w-full overflow-x-hidden bg-background text-foreground">
      <SEOHead
        title="Pricing — Megsy AI Plans & Credits"
        description="Simple plans for Megsy AI. Pay-as-you-go credits or monthly subscriptions for chat, images, video, slides and full-stack builds."
        path="/pricing"
      />
      {/* Bubble + utility CSS scoped to page */}
      <style>{`
        @keyframes pricing-bubble-rise {
          0%   { transform: translateY(0) scale(0.8); opacity: 0; }
          10%  { opacity: 0.9; }
          80%  { opacity: 0.6; }
          100% { transform: translateY(-180px) scale(1.1); opacity: 0; }
        }
        .pricing-bubble {
          position: absolute;
          border-radius: 9999px;
          pointer-events: none;
          animation: pricing-bubble-rise 5s ease-in-out infinite;
        }
        /* Phones: halve animated bubbles + let the browser skip offscreen cards entirely */
        @media (hover: none) and (pointer: coarse) {
          .pricing-bubble:nth-child(odd) { display: none; }
        }
        @keyframes gold-pulse {
          0%, 100% { box-shadow: 0 0 24px rgba(255,215,0,0.55), 0 0 60px rgba(255,215,0,0.25); }
          50%      { box-shadow: 0 0 38px rgba(255,215,0,0.85), 0 0 90px rgba(255,215,0,0.45); }
        }
        @keyframes infinity-shine {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .infinity-shine {
          background-image: linear-gradient(
            95deg,
            #a855f7 0%,
            #d946ef 20%,
            #ec4899 40%,
            #ffffff 50%,
            #ec4899 60%,
            #f97316 80%,
            #a855f7 100%
          );
          background-size: 200% 100%;
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
          -webkit-text-fill-color: transparent;
          animation: infinity-shine 6s linear infinite;
          filter: drop-shadow(0 4px 24px rgba(217,70,239,0.35));
        }
      `}</style>

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 max-w-7xl mx-auto">
        <button
          onClick={() => goBackOr(navigate, "/")}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold tracking-tight">Pricing</h1>
      </div>

      {/* Exclusive personal discount card — 50% off + Unlimited */}

      <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-8 sm:pt-14 pb-10 sm:pb-14 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="font-black tracking-tight leading-[1.05] text-foreground break-words"
          style={{ fontSize: "clamp(1.75rem, 6vw, 4.75rem)", letterSpacing: "-0.03em" }}
        >
          One AI Platform.
          <br />
          <span className="infinity-shine">Infinite Possibilities.</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mx-auto mt-5 max-w-2xl font-medium text-muted-foreground"
          style={{ fontSize: "clamp(0.95rem, 1.6vw, 1.125rem)" }}
        >
          Simple, transparent pricing. No hidden fees. Pay only for real usage across the entire AI
          ecosystem.
        </motion.p>

        {/* Toggle */}
        <div className="mt-8 inline-flex items-center gap-1 p-1 rounded-full bg-muted border border-border">
          <button
            onClick={() => setIsYearly(false)}
            className={`px-5 sm:px-7 py-2.5 rounded-full text-sm transition-all ${
              !isYearly
                ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                : "text-muted-foreground hover:text-foreground font-medium"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setIsYearly(true)}
            className={`inline-flex items-center gap-2 px-5 sm:px-7 py-2.5 rounded-full text-sm transition-all ${
              isYearly
                ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                : "text-muted-foreground hover:text-foreground font-medium"
            }`}
          >
            Yearly
          </button>
        </div>

        {/* Compare plans — pill link */}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          onClick={() => navigate("/features-guide")}
          className="group mt-7 mx-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border bg-card hover:bg-foreground/[0.04] hover:border-foreground/30 transition-all text-sm font-semibold text-foreground"
        >
          Want to know more about Megsy's services?
          <span className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all">
            →
          </span>
        </motion.button>
      </section>

      <UnlimitedPromoCard />

      {/* Plans grid */}
      <section id="plans-grid" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 scroll-mt-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 items-stretch max-w-6xl mx-auto">
          {PLANS.map((p, i) => {
            const price = isYearly ? p.yearlyPrice : p.monthlyPrice;
            const credits = isYearly ? p.yearlyCredits : p.monthlyCredits;
            const isElite = p.tier === "elite";

            return (
              <motion.div
                key={p.tier}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: i * 0.07 }}
                className={`relative rounded-ios-lg flex flex-col ${
                  isElite || p.tier === "business" ? "lg:-translate-y-3 z-10" : ""
                } ${p.tier === "business" ? "ring-1 ring-[#c9a84c]/70" : ""} ${isElite ? "ring-1 ring-[#a78bfa]/70" : ""}`}
                style={{
                  background: p.bg,
                  color: p.text,
                  minHeight: 540,
                  boxShadow:
                    p.tier === "business"
                      ? "0 30px 80px -20px rgba(201,168,76,0.35), 0 0 0 1px rgba(245,215,107,0.25) inset"
                      : isElite
                        ? "0 30px 80px -20px rgba(124,58,237,0.55), 0 0 0 1px rgba(167,139,250,0.35) inset"
                        : undefined,
                }}
              >
                {/* MOST POPULAR — clean centered tab above the card */}
                {p.topBadge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                    <div
                      className="px-4 py-1.5 rounded-full text-[10px] font-black tracking-[0.24em]"
                      style={{
                        background:
                          p.tier === "elite"
                            ? "linear-gradient(135deg,#c4b5fd,#7c3aed 55%,#5b21b6)"
                            : "#1a1a1a",
                        color: "#fff",
                        boxShadow:
                          p.tier === "elite"
                            ? "0 8px 24px -8px rgba(124,58,237,0.75), 0 0 0 1px rgba(196,181,253,0.4) inset"
                            : undefined,
                      }}
                    >
                      MOST POPULAR
                    </div>
                  </div>
                )}

                {/* BEST VALUE — gold tab for business */}
                {p.tier === "business" && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                    <div
                      className="px-4 py-1.5 rounded-full text-[10px] font-black tracking-[0.28em]"
                      style={{
                        background: "linear-gradient(135deg,#f7e08a,#c9a84c 55%,#7a5e1a)",
                        color: "#0a0805",
                        boxShadow:
                          "0 8px 24px -8px rgba(201,168,76,0.75), 0 0 0 1px rgba(247,224,138,0.4) inset",
                      }}
                    >
                      BEST VALUE
                    </div>
                  </div>
                )}

                {/* Bubbles (small & subtle, clipped to card) */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-ios-lg">
                  {BUBBLES.map((_, b) => {
                    const size = 3 + ((b * 2) % 5); // 3px - 7px tiny bubbles
                    const left = (b * 13) % 95;
                    const delay = (b * 0.4) % 6;
                    return (
                      <span
                        key={b}
                        className="pricing-bubble"
                        style={{
                          width: size,
                          height: size,
                          left: `${left}%`,
                          bottom: `-${size}px`,
                          background: p.bubbleColor,
                          animationDelay: `${delay}s`,
                          animationDuration: `${5 + (b % 4)}s`,
                        }}
                      />
                    );
                  })}
                </div>

                {/* Content */}
                <div className="relative z-10 p-7 sm:p-8 flex flex-col flex-1">
                  {/* Label (glass frame) */}
                  {!p.topBadge && p.label && p.tier !== "business" ? (
                    <span
                      className="self-start inline-block text-[10px] sm:text-[11px] font-bold tracking-[0.18em] px-3 py-1 rounded-full mb-5"
                      style={{
                        background: p.isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)",
                        color: p.text,
                      }}
                    >
                      {p.label}
                    </span>
                  ) : (
                    <span
                      className="self-start inline-block h-6 mb-5 pointer-events-none"
                      aria-hidden="true"
                    />
                  )}

                  {/* Plan name + price + credits — tidy grouped block */}
                  <div className="flex flex-col gap-1.5">
                    <h3
                      className="font-black leading-none"
                      style={{ fontSize: "clamp(1.25rem, 2vw, 1.5rem)", color: p.text }}
                    >
                      {p.name}
                    </h3>
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className="font-black leading-none"
                        style={{ fontSize: "clamp(2.25rem, 4.5vw, 3rem)" }}
                      >
                        ${price.toLocaleString("en-US")}
                      </span>
                      <span className="text-sm font-semibold" style={{ color: p.subText }}>
                        USD / {isYearly ? "year" : "month"}
                      </span>
                    </div>
                    {/* 50% OFF visual promo — strikethrough fake original + badge.
                        Prices themselves remain unchanged (no real discount). */}
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="text-sm font-semibold line-through"
                        style={{ color: p.subText, opacity: 0.75 }}
                      >
                        ${(price * 2).toLocaleString("en-US")}
                      </span>
                      <span
                        className="inline-flex items-center text-[10px] font-black tracking-wider px-2 py-0.5 rounded-full"
                        style={{
                          background:
                            "linear-gradient(135deg, #f5d76b 0%, #c9a84c 50%, #8a6d22 100%)",
                          color: "#1a1408",
                          boxShadow: "0 4px 12px -2px rgba(201,168,76,0.55)",
                        }}
                      >
                        50% OFF
                      </span>
                    </div>
                    {credits && (
                      <span
                        className="self-start inline-block text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-full mt-1"
                        style={{
                          background: p.isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.07)",
                          color: p.text,
                        }}
                      >
                        {credits}
                      </span>
                    )}
                  </div>

                  {/* CTA — hide on Free plan (no checkout needed) */}
                  {p.tier !== "starter" &&
                    (() => {
                      const order: PlanTier[] = ["starter", "pro", "elite", "business"];
                      const cur = (currentPlan ?? "starter").toLowerCase() as PlanTier;
                      const curIdx = order.indexOf(cur);
                      const thisIdx = order.indexOf(p.tier);
                      const isCurrent = curIdx === thisIdx;
                      const isLower = thisIdx < curIdx;
                      const label = isCurrent
                        ? "Current plan"
                        : isLower
                          ? `Downgrade to ${p.name}`
                          : `Get ${p.name}`;
                      return (
                        <GlowButton
                          variant={p.tier as "starter" | "pro" | "elite" | "business"}
                          onClick={() => handleSubscribe(p.tier)}
                          disabled={loadingTier !== null || isCurrent}
                          className="mt-6 w-full"
                        >
                          {loadingTier === p.tier ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            label
                          )}
                        </GlowButton>
                      );
                    })()}

                  {/* Features */}
                  <ul className="mt-6 flex-1 flex flex-col">
                    {p.features.map((f, idx) => {
                      const isUnlimited = /unlimited/i.test(f);
                      const isStarter = p.tier === "starter";
                      const dividerColor = p.isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
                      return (
                        <li
                          key={f}
                          className="flex items-start gap-3 text-[13.5px] leading-snug py-3"
                          style={{
                            color: isUnlimited ? p.text : p.subText,
                            fontWeight: isUnlimited ? 700 : 500,
                            borderTop: idx === 0 ? "none" : `1px solid ${dividerColor}`,
                          }}
                        >
                          <span className="shrink-0 mt-0.5 inline-flex items-center justify-center">
                            {isUnlimited && !isStarter ? (
                              <MegsyStar className="w-3.5 h-3.5" />
                            ) : (
                              <Check
                                className="w-3 h-3"
                                style={{
                                  color: isUnlimited && isStarter ? "hsl(var(--primary))" : p.text,
                                }}
                                strokeWidth={3}
                              />
                            )}
                          </span>
                          <span className="flex-1">{f}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
          className="text-center mb-10"
        >
          <h3
            className="font-black text-foreground leading-tight"
            style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}
          >
            Frequently asked questions
          </h3>
          <p className="mt-3 text-muted-foreground text-base">
            Everything you need to know before picking a plan.
          </p>
        </motion.div>

        <div className="space-y-3">
          {FAQS.map((item, i) => (
            <motion.details
              key={item.q}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              className="group rounded-2xl border border-border bg-card overflow-hidden"
            >
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none px-5 py-4 sm:px-6 sm:py-5 hover:bg-muted/40 transition-colors">
                <span className="font-semibold text-foreground text-sm sm:text-base">{item.q}</span>
                <ChevronDown className="w-5 h-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-5 pb-5 sm:px-6 sm:pb-6 text-sm text-muted-foreground leading-relaxed">
                {item.a}
              </div>
            </motion.details>
          ))}
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-5 text-sm">
          <a
            href="mailto:support@megsyai.com"
            className="inline-flex items-center gap-2 font-medium text-foreground hover:underline transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            support@megsyai.com
          </a>
          <span className="hidden sm:inline text-border/80" aria-hidden>
            ·
          </span>
          <a
            href="tel:+201098821812"
            className="inline-flex items-center gap-2 font-medium text-foreground hover:underline transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            +20 109 882 1812
          </a>
          <span className="hidden sm:inline text-border/80" aria-hidden>
            ·
          </span>
          <a
            href="/refund"
            onClick={(e) => {
              e.preventDefault();
              navigate("/refund");
            }}
            className="inline-flex items-center gap-2 font-medium text-foreground hover:underline transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m15 9-6 6" />
              <path d="m9 9 6 6" />
            </svg>
            Refund Policy
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-xs text-muted-foreground/70 order-2 sm:order-1">
              © 2026 Megsy AI. All Rights Reserved.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground order-1 sm:order-2">
              <a
                href="/terms"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/terms");
                }}
                className="hover:text-foreground transition-colors"
              >
                Terms of Service
              </a>
              <span className="text-border/80" aria-hidden>
                ·
              </span>
              <a
                href="/privacy"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/privacy");
                }}
                className="hover:text-foreground transition-colors"
              >
                Privacy Policy
              </a>
              <span className="text-border/80" aria-hidden>
                ·
              </span>
              <a
                href="/refund"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/refund");
                }}
                className="hover:text-foreground transition-colors"
              >
                Refund Policy
              </a>
              <span className="text-border/80" aria-hidden>
                ·
              </span>
              <a
                href="/cookies"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/cookies");
                }}
                className="hover:text-foreground transition-colors"
              >
                Cookie Policy
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PricingPage;
