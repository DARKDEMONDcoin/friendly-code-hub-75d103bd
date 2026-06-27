/** @doc Open a support ticket from within settings. */
// Support hub — cartoon redesign on mobile.
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ChevronIcon,
  FAQIcon,
  HumanSupportIcon,
  AISupportIcon,
} from "@/components/settings/SettingsIcons";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopSettingsLayout } from "@/components/settings/DesktopSettingsLayout";
import { CartoonPage, CartoonHero, CartoonCard } from "@/components/settings/CartoonSettingsShell";
import { INK, PINK, YELLOW, MINT, LAVENDER, TEXT, MUTED } from "@/pages/billing/ReferralsPage";
import supportSticker from "@/assets/settings/support-sticker.png";
import {
  BentoGrid,
  BentoCard,
  BentoHero,
  BentoTitle,
  BentoBody,
  BentoLabel,
} from "@/components/settings/bento/Bento";

const options = [
  {
    icon: FAQIcon,
    title: "Help Center",
    desc: "Browse FAQs and a guide for every page and section.",
    path: "/settings/support/help",
    tone: YELLOW,
  },
  {
    icon: AISupportIcon,
    title: "Ask AI",
    desc: "Instant answers from Megsy's AI support assistant.",
    path: "/support",
    tone: MINT,
  },
  {
    icon: HumanSupportIcon,
    title: "Contact our team",
    desc: "Write your issue and a human will reply by email.",
    path: "/settings/support/contact",
    tone: LAVENDER,
  },
];

export default function SettingsSupportPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const desktopList = (
    <div className="grid grid-cols-12 gap-10">
      <aside className="col-span-4">
        <div className="sticky top-6 space-y-6">
          <div className="rounded-2xl border border-border/60 p-5">
            <span className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> All systems normal
            </span>
            <p className="mt-4 text-[10.5px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Reply SLA</p>
            <p className="mt-1 text-[40px] font-semibold tabular-nums tracking-tight text-foreground leading-none">
              &lt; 24<span className="text-[18px] font-mono text-muted-foreground ml-1">h</span>
            </p>
            <p className="text-[12.5px] text-muted-foreground mt-2 leading-relaxed">
              Average reply time across all support channels in the last 30 days.
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 p-5">
            <p className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">Quick links</p>
            <div className="space-y-1.5">
              <a href="mailto:support@megsyai.com" className="block text-[13px] text-muted-foreground hover:text-foreground transition-colors">→ support@megsyai.com</a>
              <button onClick={() => navigate("/settings/support/help")} className="block text-left text-[13px] text-muted-foreground hover:text-foreground transition-colors">→ Status page</button>
              <button onClick={() => navigate("/docs")} className="block text-left text-[13px] text-muted-foreground hover:text-foreground transition-colors">→ Documentation</button>
            </div>
          </div>
        </div>
      </aside>

      <section className="col-span-8 space-y-3">
        <h2 className="text-[13px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-2">How can we help?</h2>
        {options.map((opt, i) => {
          const Icon = opt.icon;
          return (
            <motion.button
              key={opt.title}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.05 }}
              onClick={() => navigate(opt.path)}
              className="group w-full rounded-xl border border-border/60 p-5 text-left hover:border-foreground/30 hover:bg-secondary/20 transition-all flex items-start gap-5"
            >
              <div className="w-11 h-11 rounded-lg border border-border bg-secondary/40 grid place-items-center text-foreground shrink-0 group-hover:bg-foreground group-hover:text-background group-hover:border-foreground transition-all">
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold tracking-tight text-foreground">{opt.title}</p>
                  <span className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground">0{i + 1}</span>
                </div>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{opt.desc}</p>
              </div>
              <ChevronIcon className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0 mt-1" />
            </motion.button>
          );
        })}
      </section>
    </div>
  );

  if (!isMobile) {
    return (
      <DesktopSettingsLayout title="Help & Support" subtitle="Choose how you'd like to get help.">
        {desktopList}
      </DesktopSettingsLayout>
    );
  }

  return (
    <CartoonPage title="Help & Support">
      <CartoonHero
        sticker={supportSticker}
        bg={PINK}
        title="How can we help?"
        subtitle="Pick the option that fits — we reply fast."
      />

      <div className="space-y-3 mt-2">
        {options.map((opt, i) => {
          const Icon = opt.icon;
          return (
            <motion.button
              key={opt.title}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.06 }}
              onClick={() => navigate(opt.path)}
              className="w-full flex items-center gap-4 p-4 rounded-[22px] text-left transition active:translate-x-[1px] active:translate-y-[1px]"
              style={{
                backgroundColor: "hsl(var(--surface-1))",
                border: `2px solid ${INK}`,
                boxShadow: `3px 3px 0 ${INK}`,
              }}
            >
              <div
                className="w-12 h-12 rounded-[14px] grid place-items-center shrink-0"
                style={{ backgroundColor: opt.tone, border: `2px solid ${INK}`, color: INK }}
              >
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px]" style={{ color: TEXT, fontWeight: 900 }}>
                  {opt.title}
                </p>
                <p
                  className="text-[12px] mt-0.5 leading-relaxed"
                  style={{ color: MUTED, fontWeight: 600 }}
                >
                  {opt.desc}
                </p>
              </div>
              <ChevronIcon className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
            </motion.button>
          );
        })}
      </div>

      <p className="text-center text-[11px] mt-8" style={{ color: MUTED, fontWeight: 700 }}>
        Typical reply time · under 24 hours
      </p>
    </CartoonPage>
  );
}
