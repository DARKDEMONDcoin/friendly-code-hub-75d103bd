/** @doc Privacy controls — training opt-out, data exports, deletions. */
// Privacy & data settings — cartoon redesign on mobile.
import { useNavigate } from "react-router-dom";
import { ChevronIcon } from "@/components/settings/SettingsIcons";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopSettingsLayout } from "@/components/settings/DesktopSettingsLayout";
import { CleanStack, CleanCard, CleanRow } from "@/components/settings/CleanSettings";
import { ChevronRight } from "lucide-react";
import { CartoonPage, CartoonHero, CartoonCard } from "@/components/settings/CartoonSettingsShell";
import { INK, MINT, PINK, TEXT, MUTED } from "@/pages/billing/ReferralsPage";
import privacySticker from "@/assets/settings/privacy-sticker.png";
import {
  BentoGrid,
  BentoCard,
  BentoHero,
  BentoTitle,
  BentoBody,
  BentoLabel,
  BentoSectionTitle,
} from "@/components/settings/bento/Bento";

const links = [
  {
    title: "Privacy Policy",
    desc: "How we collect and use your data",
    href: "https://privacy.megsyai.com",
    external: true,
  },
  {
    title: "Terms of Service",
    desc: "The rules for using Megsy",
    href: "https://terms.megsyai.com",
    external: true,
  },
  {
    title: "Cookie Policy",
    desc: "Which cookies we use and why",
    href: "/cookies",
    external: false,
  },
];

const actions = [
  { title: "Memory", desc: "View or clear what Megsy remembers", path: "/settings/memory" },
  { title: "Change email", desc: "Update your account email", path: "/settings/change-email" },
  { title: "Change password", desc: "Set a new password", path: "/settings/change-password" },
  {
    title: "Delete account",
    desc: "Permanently delete your data",
    path: "/settings/delete-account",
    danger: true,
  },
];

export default function SettingsPrivacyPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const trustStats = [
    { label: "Encrypted at rest", value: "AES-256" },
    { label: "Encrypted in transit", value: "TLS 1.3" },
    { label: "Data residency", value: "EU + US" },
    { label: "Training opt-out", value: "Default on" },
  ];
  const safeActions = actions.filter((a) => !a.danger);
  const dangerActions = actions.filter((a) => a.danger);

  const desktopBody = (
    <div className="space-y-14">
      {/* Trust hero with stats strip */}
      <section className="rounded-2xl border border-border/60 bg-gradient-to-br from-card/60 via-card/30 to-transparent p-8">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Your data is protected
        </div>
        <h2 className="mt-3 text-[24px] font-semibold tracking-tight text-foreground">
          Privacy you can verify
        </h2>
        <p className="mt-2 text-[13.5px] text-muted-foreground max-w-xl leading-relaxed">
          Review what we collect, control what we store, export everything, and exit at any time.
          No dark patterns — every switch lives on this page.
        </p>
        <div className="mt-7 grid grid-cols-4 gap-px bg-border/40 rounded-lg overflow-hidden border border-border/40">
          {trustStats.map((s) => (
            <div key={s.label} className="bg-card/40 p-4">
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                {s.label}
              </p>
              <p className="mt-1 text-[15px] font-mono text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Policies — inline link rail */}
      <section>
        <div className="flex items-end justify-between mb-4 pb-3 border-b border-border/40">
          <div>
            <h2 className="text-[13px] font-semibold tracking-tight text-foreground">Policies</h2>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">
              How we collect, use and protect your data.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {links.map((l) => (
            <button
              key={l.title}
              onClick={() => (l.external ? window.open(l.href, "_blank") : navigate(l.href))}
              className="group text-left rounded-lg border border-border/60 bg-card/40 p-5 hover:border-border hover:bg-card/70 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
                  {l.external ? "External ↗" : "Internal"}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
              <p className="text-[14px] font-medium text-foreground">{l.title}</p>
              <p className="text-[12.5px] text-muted-foreground mt-1">{l.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Your data — action rows */}
      <section>
        <div className="flex items-end justify-between mb-4 pb-3 border-b border-border/40">
          <div>
            <h2 className="text-[13px] font-semibold tracking-tight text-foreground">Your data</h2>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">
              Manage what we store about you.
            </p>
          </div>
        </div>
        <div className="border border-border/60 rounded-lg overflow-hidden bg-card/40">
          {safeActions.map((a, i) => (
            <button
              key={a.title}
              onClick={() => navigate(a.path)}
              className={`w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-card/80 transition-colors ${
                i > 0 ? "border-t border-border/40" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-foreground">{a.title}</p>
                <p className="text-[12.5px] text-muted-foreground mt-0.5">{a.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      </section>

      {/* Danger zone — distinct treatment */}
      {dangerActions.length > 0 && (
        <section>
          <div className="flex items-end justify-between mb-4 pb-3 border-b border-destructive/30">
            <div>
              <h2 className="text-[13px] font-semibold tracking-tight text-destructive uppercase tracking-[0.12em]">
                Danger zone
              </h2>
              <p className="text-[12.5px] text-muted-foreground mt-1">
                Irreversible actions. We'll always ask for confirmation.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {dangerActions.map((a) => (
              <div
                key={a.title}
                className="flex items-center justify-between gap-6 rounded-lg border border-destructive/30 bg-destructive/[0.04] px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-destructive">{a.title}</p>
                  <p className="text-[12.5px] text-muted-foreground mt-0.5">{a.desc}</p>
                </div>
                <button
                  onClick={() => navigate(a.path)}
                  className="shrink-0 h-9 px-4 text-[13px] font-medium border border-destructive/40 text-destructive rounded-md hover:bg-destructive/10 transition-colors"
                >
                  Continue
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );

  if (!isMobile) {
    return (
      <DesktopSettingsLayout
        title="Privacy & Data"
        subtitle="Control your data and review our policies."
      >
        {desktopBody}
      </DesktopSettingsLayout>
    );
  }

  const SectionList = ({
    title,
    items,
  }: {
    title: string;
    items: Array<{ title: string; desc: string; danger?: boolean; onClick: () => void }>;
  }) => (
    <section>
      <p
        className="text-[11px] uppercase tracking-[0.12em] mb-2 px-2"
        style={{ color: MUTED, fontWeight: 800 }}
      >
        {title}
      </p>
      <CartoonCard className="!p-0 overflow-hidden">
        {items.map((it, idx) => (
          <button
            key={it.title}
            onClick={it.onClick}
            className="w-full flex items-center gap-3 px-4 py-4 text-left transition active:bg-white/5"
            style={{ borderTop: idx === 0 ? "none" : `1px solid hsl(var(--surface-4))` }}
          >
            <div className="flex-1 min-w-0">
              <p
                className="text-[14px]"
                style={{ color: it.danger ? "hsl(var(--brand-blush))" : TEXT, fontWeight: 800 }}
              >
                {it.title}
              </p>
              <p className="text-[12px] mt-0.5" style={{ color: MUTED, fontWeight: 600 }}>
                {it.desc}
              </p>
            </div>
            <ChevronIcon className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
          </button>
        ))}
      </CartoonCard>
    </section>
  );

  return (
    <CartoonPage title="Privacy & Data">
      <CartoonHero
        sticker={privacySticker}
        bg={MINT}
        title="Your data, your call"
        subtitle="Review our policies and control your data at any time."
      />
      <div className="space-y-5 mt-2">
        <SectionList
          title="Policies"
          items={links.map((l) => ({
            title: l.title,
            desc: l.desc,
            onClick: () => (l.external ? window.open(l.href, "_blank") : navigate(l.href)),
          }))}
        />
        <SectionList
          title="Your data"
          items={actions.map((a) => ({
            title: a.title,
            desc: a.desc,
            danger: a.danger,
            onClick: () => navigate(a.path),
          }))}
        />
      </div>
    </CartoonPage>
  );
}
