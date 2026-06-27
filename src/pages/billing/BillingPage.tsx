/** @doc Billing dashboard — current plan, invoices, payment methods, MC usage. */
// Billing — cartoon redesign. Mobile uses cartoon shell + sticker hero.
import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Clock, Sparkles, Wallet, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopSettingsLayout } from "@/components/settings/DesktopSettingsLayout";
import visaBg from "@/assets/visa-bg.webp";
import MegsyStar from "@/components/branding/MegsyStar";
import { CartoonPage, CartoonHero, CartoonCard } from "@/components/settings/CartoonSettingsShell";
import { INK, MINT, YELLOW, PINK, LAVENDER, TEXT, MUTED } from "@/pages/billing/ReferralsPage";
import billingSticker from "@/assets/settings/billing-sticker.png";
import CardCarousel3D from "@/components/billing/CardCarousel3D";

const planTone = (plan: string) => {
  const p = plan.toLowerCase();
  if (p === "free") return "bg-white/10 text-foreground/80";
  if (p === "starter") return "bg-white/15 text-foreground";
  if (p === "pro") return "bg-white/20 text-foreground";
  if (p === "elite") return "bg-white/25 text-foreground";
  return "bg-white/30 text-foreground";
};

const BillingPage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [credits, setCredits] = useState(0);
  const [plan, setPlan] = useState("Free");
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("credits, plan")
        .eq("id", user.id)
        .single();
      if (profile) {
        setCredits(Number(profile.credits) || 0);
        setPlan(profile.plan || "Free");
      }
      const { data: txns } = await supabase
        .from("credit_transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (txns) setTransactions(txns);
    };
    load();
  }, []);

  const EARNED_ACTIONS = new Set([
    "credit_addition",
    "admin_topup",
    "code_build_refund",
    "subscription_purchase",
    "referral_bonus",
    "reward",
  ]);
  const isEarnedTx = (t: any) => {
    const amt = Number(t.amount) || 0;
    if (amt < 0) return false;
    if (EARNED_ACTIONS.has(String(t.action_type || "").toLowerCase())) return true;
    // Fallback heuristics on description
    const d = String(t.description || "").toLowerCase();
    return (
      d.startsWith("reward") ||
      d.includes("bonus") ||
      d.includes("refund") ||
      d.includes("top-up") ||
      d.includes("topup")
    );
  };
  const totalEarned = transactions
    .filter(isEarnedTx)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const totalSpent = transactions
    .filter((t) => !isEarnedTx(t))
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const recentTransactions = transactions;

  // Spend last 14 days, bucketed
  const today = new Date();
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (13 - i));
    return d;
  });
  const dailySpend = days.map((d) => {
    const dayKey = d.toDateString();
    return transactions
      .filter((t) => !isEarnedTx(t) && new Date(t.created_at).toDateString() === dayKey)
      .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  });
  const maxSpend = Math.max(1, ...dailySpend);

  const desktopContent = (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-12 gap-10">
      {/* Balance ledger column */}
      <aside className="col-span-5">
        <div className="sticky top-6 space-y-6">
          <div className="rounded-2xl border border-border/60 p-6 bg-gradient-to-br from-secondary/30 via-background to-background">
            <div className="flex items-center justify-between mb-5">
              <span className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                <Wallet className="w-3 h-3" /> Balance
              </span>
              <span className="inline-flex items-center h-6 px-2 rounded-md border border-border bg-secondary/40 text-[11px] font-mono uppercase tracking-wider text-foreground/80 capitalize">
                {plan}
              </span>
            </div>
            <p className="text-[56px] leading-none font-semibold tabular-nums tracking-tight text-foreground">
              {credits.toLocaleString()}
              <span className="text-[18px] font-mono text-muted-foreground ml-2">MC</span>
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <button onClick={() => navigate("/pricing")} className="inline-flex items-center justify-center gap-2 h-10 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity">
                <Sparkles className="w-3.5 h-3.5" /> Top up
              </button>
              <button onClick={() => navigate("/settings/referrals")} className="inline-flex items-center justify-center gap-2 h-10 rounded-lg border border-border text-foreground text-[13px] font-medium hover:border-foreground/40 transition-colors">
                Earn MC <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <CardCarousel3D height={360} />

          <div className="rounded-2xl border border-border/60">
            <div className="grid grid-cols-2">
              <div className="p-4 border-r border-border/60">
                <p className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Spent</p>
                <p className="mt-1 text-[18px] font-semibold tabular-nums text-foreground">{totalSpent.toLocaleString()}</p>
              </div>
              <div className="p-4">
                <p className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Earned</p>
                <p className="mt-1 text-[18px] font-semibold tabular-nums text-foreground">{totalEarned.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Ledger feed */}
      <section className="col-span-7">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[13px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Ledger</h2>
          <span className="text-[11px] font-mono text-muted-foreground">{transactions.length} entries</span>
        </div>
        {transactions.length === 0 ? (
          <div className="text-center py-20 rounded-xl border border-dashed border-border/60">
            <Clock className="w-7 h-7 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-[14px] font-semibold text-foreground">No transactions yet</p>
            <p className="text-[12.5px] text-muted-foreground mt-1">Your MC history will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60 border-y border-border/60">
            {recentTransactions.map((tx) => {
              const isDeduction = !isEarnedTx(tx);
              return (
                <div key={tx.id} className="grid grid-cols-[auto_1fr_auto] gap-4 py-3.5 items-center">
                  <span className={`grid h-8 w-8 place-items-center rounded-md border ${isDeduction ? "border-border bg-secondary/40 text-foreground" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"}`}>
                    {isDeduction ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13.5px] text-foreground truncate">{tx.description || tx.action_type}</p>
                    <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                      {new Date(tx.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <span className={`text-[13.5px] font-semibold tabular-nums tracking-tight ${isDeduction ? "text-foreground" : "text-emerald-500"}`}>
                    {isDeduction ? "−" : "+"}{Math.abs(tx.amount)}
                    <span className="text-muted-foreground font-mono font-normal ml-1 text-[11px]">MC</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </motion.div>
  );

  if (!isMobile) {
    return (
      <DesktopSettingsLayout
        title="Billing"
        subtitle="Manage your MC balance and view transaction history"
      >
        {desktopContent}
      </DesktopSettingsLayout>
    );
  }

  const StatCard = ({ label, value, tone }: { label: string; value: string; tone: string }) => (
    <div
      className="rounded-[18px] p-3"
      style={{ backgroundColor: tone, border: `2px solid ${INK}`, boxShadow: `3px 3px 0 ${INK}` }}
    >
      <p
        className="text-[10px] uppercase tracking-[0.12em]"
        style={{ color: INK, fontWeight: 800, opacity: 0.7 }}
      >
        {label}
      </p>
      <p
        className="text-[20px] mt-0.5"
        style={{ color: INK, fontWeight: 900, letterSpacing: "-0.02em" }}
      >
        {value}
      </p>
    </div>
  );

  return (
    <CartoonPage title="Billing">
      <CartoonHero
        sticker={billingSticker}
        bg={MINT}
        title={`${credits.toLocaleString()} MC`}
        subtitle={`You're on the ${plan} plan.`}
        trailing={
          <div className="mt-4 grid grid-cols-2 gap-2 w-full">
            <button
              onClick={() => navigate("/pricing")}
              className="py-2.5 rounded-full text-[13px] active:translate-x-[1px] active:translate-y-[1px] transition"
              style={{
                background: INK,
                color: "#fff",
                border: `2px solid ${INK}`,
                fontWeight: 800,
                boxShadow: `2px 2px 0 ${INK}`,
              }}
            >
              Add MC
            </button>
            <button
              onClick={() => navigate("/settings/referrals")}
              className="py-2.5 rounded-full text-[13px] active:translate-x-[1px] active:translate-y-[1px] transition"
              style={{
                background: YELLOW,
                color: INK,
                border: `2px solid ${INK}`,
                fontWeight: 800,
                boxShadow: `2px 2px 0 ${INK}`,
              }}
            >
              Earn MC
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-2 mt-3">
        <StatCard label="Left" value={credits.toLocaleString()} tone={YELLOW} />
        <StatCard label="Spent" value={totalSpent.toLocaleString()} tone={PINK} />
        <StatCard label="Earned" value={totalEarned.toLocaleString()} tone={LAVENDER} />
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between mb-2 px-2">
          <p
            className="text-[11px] uppercase tracking-[0.12em]"
            style={{ color: MUTED, fontWeight: 800 }}
          >
            Recent activity
          </p>
          <p className="text-[11px]" style={{ color: MUTED, fontWeight: 700 }}>
            {transactions.length} entries
          </p>
        </div>
        {transactions.length === 0 ? (
          <CartoonCard className="text-center py-10">
            <Clock className="w-7 h-7 mx-auto mb-3" style={{ color: MUTED }} />
            <p className="text-sm" style={{ color: TEXT, fontWeight: 800 }}>
              No transactions yet
            </p>
            <p className="text-[11px] mt-1" style={{ color: MUTED }}>
              Your MC history will appear here
            </p>
          </CartoonCard>
        ) : (
          <CartoonCard className="!p-0 overflow-hidden">
            {recentTransactions.map((tx, idx) => {
              const isDeduction = !isEarnedTx(tx);
              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 py-3.5 px-4"
                  style={{ borderTop: idx === 0 ? "none" : `1px solid hsl(var(--surface-4))` }}
                >
                  <div
                    className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
                    style={{
                      background: isDeduction ? PINK : MINT,
                      color: INK,
                      border: `2px solid ${INK}`,
                    }}
                  >
                    {isDeduction ? (
                      <TrendingDown className="w-3.5 h-3.5" strokeWidth={3} />
                    ) : (
                      <TrendingUp className="w-3.5 h-3.5" strokeWidth={3} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] truncate" style={{ color: TEXT, fontWeight: 700 }}>
                      {tx.description || tx.action_type}
                    </p>
                    <p className="text-[11px]" style={{ color: MUTED, fontWeight: 600 }}>
                      {new Date(tx.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span
                    className="text-[13.5px] tabular-nums"
                    style={{ color: TEXT, fontWeight: 800 }}
                  >
                    {isDeduction ? "-" : "+"}
                    {Math.abs(tx.amount)} <span style={{ color: MUTED, fontWeight: 600 }}>MC</span>
                  </span>
                </div>
              );
            })}
          </CartoonCard>
        )}
      </div>
    </CartoonPage>
  );
};

function DesktopRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-[13.5px] text-muted-foreground">{label}</span>
      <span className="text-[14px] font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  );
}

export default BillingPage;
