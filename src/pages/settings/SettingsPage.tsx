/** @doc Settings home — entry to every personalization sub-page. */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronRight, LogOut, Gift } from "lucide-react";
import MegsyStar from "@/components/branding/MegsyStar";
// WorkspaceSwitcher popover replaced by dedicated /settings/switch page
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import OliveAvatar from "@/components/branding/OliveAvatar";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { DesktopSettingsLayout } from "@/components/settings/DesktopSettingsLayout";
import { DesktopSettingsHome } from "@/components/settings/DesktopSettingsHome";
import {
  AccountIcon,
  WorkspacesIcon,
  BillingIcon,
  ThemeIcon,
  IntegrationsIcon,
  MemoryIcon,
  SkillsIcon,
  LanguageIcon,
  NotificationsIcon,
  StatusIcon,
  SwitchIcon,
  BackIcon,
  AiPersonalizationIcon,
  SupportIcon,
  PrivacyIcon,
} from "@/components/settings/SettingsIcons";
import {
  INK,
  YELLOW,
  PINK,
  MINT,
  LAVENDER,
  PEACH,
  BLUE,
  SURFACE,
  SURFACE_2,
  BORDER,
  TEXT,
  MUTED,
  PAGE_BG,
} from "@/pages/billing/ReferralsPage";

const SettingsPage = () => {
  const navigate = useNavigate();
  const account = useActiveAccount();
  // Bypass the global /settings "force mobile" rule — we now have a real desktop design
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false,
  );
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  const [userEmail, setUserEmail] = useState("user@email.com");
  const [plan, setPlan] = useState("free");
  const userName = account.name || "User";
  const avatarUrl = account.avatarUrl;
  const credits = account.credits;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setUserEmail(user.email || "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", user.id)
        .single();
      if (profile && !cancelled) setPlan(profile.plan || "free");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  // Desktop gets the new clean layout (sidebar + glow), mobile keeps the sticker design untouched
  if (isDesktop) {
    return (
      <DesktopSettingsLayout title="Overview" subtitle="Your account at a glance">
        <DesktopSettingsHome />
      </DesktopSettingsLayout>
    );
  }

  type Tone = string;
  type Item = {
    icon: typeof AccountIcon;
    label: string;
    desc?: string;
    path: string;
    external?: boolean;
    tone: Tone;
    trailing?: string;
  };

  const sections: Array<{ title: string; items: Item[] }> = [
    {
      title: "Plan & Usage",
      items: [
        {
          icon: BillingIcon,
          label: "Billing & MC",
          desc: "Plan, invoices & credits",
          path: "/settings/billing",
          tone: YELLOW,
          trailing: `${Math.floor(credits)} MC`,
        },
      ],
    },
    {
      title: "Workspace",
      items: [
        {
          icon: AccountIcon,
          label: "Account",
          desc: "Profile & security",
          path: "/settings/profile",
          tone: PINK,
        },
        {
          icon: WorkspacesIcon,
          label: "Workspaces",
          desc: "Team & shared credits",
          path: "/settings/workspaces",
          tone: LAVENDER,
        },
      ],
    },
    {
      title: "AI",
      items: [
        {
          icon: AiPersonalizationIcon,
          label: "AI Personalization",
          desc: "Customize AI behavior",
          path: "/settings/ai-personalization",
          tone: MINT,
        },
        {
          icon: MemoryIcon,
          label: "Memory",
          desc: "AI memory & data",
          path: "/settings/memory",
          tone: PEACH,
        },
        {
          icon: SkillsIcon,
          label: "Skills",
          desc: "Custom & library skills",
          path: "/settings/skills",
          tone: YELLOW,
        },
      ],
    },
    {
      title: "App",
      items: [
        {
          icon: ThemeIcon,
          label: "Theme",
          desc: "Colors & style",
          path: "/settings/customization",
          tone: PINK,
        },
        {
          icon: LanguageIcon,
          label: "Language",
          desc: "Auto-translate UI",
          path: "/settings/language",
          tone: BLUE,
        },
        {
          icon: NotificationsIcon,
          label: "Notifications",
          desc: "Alerts & email prefs",
          path: "/settings/notifications",
          tone: PEACH,
        },
        {
          icon: IntegrationsIcon,
          label: "Integrations",
          desc: "Connect external tools",
          path: "/settings/integrations",
          tone: LAVENDER,
        },
      ],
    },
    {
      title: "Support",
      items: [
        {
          icon: SupportIcon,
          label: "Help & Support",
          desc: "FAQs, guides & contact",
          path: "/settings/support",
          tone: MINT,
        },
        {
          icon: PrivacyIcon,
          label: "Privacy & Data",
          desc: "Control your data",
          path: "/settings/privacy",
          tone: YELLOW,
        },
        {
          icon: StatusIcon,
          label: "System Status",
          desc: "Live uptime & incidents",
          path: "/settings/system-status",
          tone: PINK,
        },
      ],
    },
  ];

  const order = ["free", "starter", "pro", "elite", "business", "enterprise"];
  const cur = (plan || "free").toLowerCase();
  const atTop = Math.max(0, order.indexOf(cur)) >= order.length - 1;
  const target = atTop ? "/settings/credits" : "/pricing";

  return (
    <div
      className="relative min-h-[100dvh] overflow-y-auto"
      style={{ backgroundColor: PAGE_BG, color: TEXT }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-10"
        style={{
          backgroundColor: `${PAGE_BG}E6`,
          backdropFilter: "saturate(160%) blur(18px)",
          WebkitBackdropFilter: "saturate(160%) blur(18px)",
          borderBottom: `1.5px solid ${BORDER}`,
        }}
      >
        <div className="max-w-lg mx-auto px-5 flex items-center justify-between py-3 safe-top">
          <button
            onClick={() => navigate("/")}
            className="grid h-10 w-10 place-items-center rounded-full active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition"
            style={{ backgroundColor: SURFACE, border: `2px solid ${BORDER}`, color: TEXT }}
            aria-label="Back"
          >
            <BackIcon className="w-5 h-5" />
          </button>
          <h1
            className="text-[17px]"
            style={{ fontWeight: 900, letterSpacing: "-0.02em", color: TEXT }}
          >
            Settings
          </h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="max-w-lg mx-auto pb-12 px-4 safe-bottom">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Profile sticker card */}
          <button
            onClick={() => navigate("/settings/profile")}
            className="mt-4 w-full text-left rounded-[28px] p-5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition"
            style={{
              backgroundColor: YELLOW,
              border: `2.5px solid ${INK}`,
              boxShadow: `4px 4px 0 ${INK}`,
            }}
          >
            <div className="flex items-center gap-4">
              <div
                className="shrink-0 rounded-2xl overflow-hidden"
                style={{ border: `2.5px solid ${INK}`, backgroundColor: SURFACE }}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="block w-[64px] h-[64px] object-cover" />
                ) : (
                  <OliveAvatar seed={userEmail || userName} className="w-[64px] h-[64px]" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[18px] truncate"
                  style={{ fontWeight: 900, color: INK, letterSpacing: "-0.02em" }}
                >
                  {userName}
                </p>
                <p
                  className="text-[12.5px] truncate"
                  style={{ fontWeight: 700, color: INK, opacity: 0.7 }}
                >
                  {userEmail}
                </p>
                <span
                  className="inline-block mt-2 rounded-full px-2.5 py-0.5 text-[10.5px] uppercase tracking-wider"
                  style={{ backgroundColor: INK, color: YELLOW, fontWeight: 800 }}
                >
                  {plan}
                </span>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0" strokeWidth={3} style={{ color: INK }} />
            </div>
          </button>

          {/* Hero: Get more Credits */}
          <div
            className="mt-3 rounded-[28px] p-5"
            style={{
              backgroundColor: MINT,
              border: `2.5px solid ${INK}`,
              boxShadow: `4px 4px 0 ${INK}`,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className="text-[11px] uppercase tracking-wider"
                  style={{ fontWeight: 800, color: INK, opacity: 0.7 }}
                >
                  Credits
                </p>
                <p
                  className="mt-1 text-[36px] leading-none tabular-nums"
                  style={{ fontWeight: 900, color: INK, letterSpacing: "-0.03em" }}
                >
                  {Math.floor(credits)}{" "}
                  <span className="text-[16px]" style={{ fontWeight: 800 }}>
                    MC
                  </span>
                </p>
                <p
                  className="mt-2 text-[12.5px]"
                  style={{ fontWeight: 700, color: INK, opacity: 0.75 }}
                >
                  Unlock extra features by upgrading.
                </p>
              </div>
              <span
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
                style={{ backgroundColor: YELLOW, border: `2.5px solid ${INK}`, color: INK }}
              >
                <MegsyStar className="w-6 h-6" />
              </span>
            </div>
            <button
              onClick={() => navigate(target)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              style={{
                backgroundColor: INK,
                color: YELLOW,
                fontWeight: 800,
                border: `2px solid ${INK}`,
                boxShadow: `3px 3px 0 ${INK}`,
              }}
            >
              {atTop ? "Top up" : "Upgrade plan"}
              <ChevronRight className="h-4 w-4" strokeWidth={3} />
            </button>
          </div>

          {/* Quick row: Referrals + Switch */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate("/settings/referrals")}
              className="rounded-[22px] p-4 text-left active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition"
              style={{
                backgroundColor: PINK,
                border: `2.5px solid ${INK}`,
                boxShadow: `3px 3px 0 ${INK}`,
              }}
            >
              <span
                className="grid h-9 w-9 place-items-center rounded-xl"
                style={{ backgroundColor: INK, color: PINK }}
              >
                <Gift className="h-4.5 w-4.5" strokeWidth={2.5} />
              </span>
              <p className="mt-3 text-[14px]" style={{ fontWeight: 900, color: INK }}>
                Referrals
              </p>
              <p className="text-[11px]" style={{ fontWeight: 700, color: INK, opacity: 0.7 }}>
                Earn 20% per signup
              </p>
            </button>

            <button
              onClick={() => navigate("/settings/switch")}
              className="w-full h-full rounded-[22px] p-4 text-left active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition"
              style={{
                backgroundColor: LAVENDER,
                border: `2.5px solid ${INK}`,
                boxShadow: `3px 3px 0 ${INK}`,
              }}
            >
              <span
                className="grid h-9 w-9 place-items-center rounded-xl"
                style={{ backgroundColor: INK, color: LAVENDER }}
              >
                <SwitchIcon className="h-4 w-4" />
              </span>
              <p className="mt-3 text-[14px]" style={{ fontWeight: 900, color: INK }}>
                Switch
              </p>
              <p className="text-[11px]" style={{ fontWeight: 700, color: INK, opacity: 0.7 }}>
                Personal & teams
              </p>
            </button>
          </div>

          {/* Sections */}
          {sections.map((section, sIdx) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + sIdx * 0.04 }}
              className="mt-6"
            >
              <p
                className="px-2 mb-2.5 text-[10.5px] uppercase"
                style={{ color: MUTED, fontWeight: 800, letterSpacing: "0.18em" }}
              >
                {section.title}
              </p>
              <div
                className="rounded-[22px] overflow-hidden"
                style={{ backgroundColor: SURFACE, border: `1.5px solid ${BORDER}` }}
              >
                {section.items.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      onClick={() =>
                        item.external ? window.open(item.path, "_blank") : navigate(item.path)
                      }
                      className="w-full flex items-center gap-3 py-3 px-3.5 text-left transition"
                      style={{
                        borderTop: idx === 0 ? "none" : `1px solid ${BORDER}`,
                      }}
                    >
                      <span
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                        style={{ backgroundColor: item.tone, border: `2px solid ${INK}` }}
                      >
                        <Icon className="w-4 h-4" style={{ color: INK }} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px]" style={{ fontWeight: 800, color: TEXT }}>
                          {item.label}
                        </p>
                        {item.desc && (
                          <p
                            className="text-[11.5px] mt-0.5"
                            style={{ color: MUTED, fontWeight: 600 }}
                          >
                            {item.desc}
                          </p>
                        )}
                      </div>
                      {item.trailing && (
                        <span
                          className="text-[11px] tabular-nums shrink-0 rounded-full px-2.5 py-1"
                          style={{
                            backgroundColor: YELLOW,
                            color: INK,
                            border: `1.5px solid ${INK}`,
                            fontWeight: 900,
                          }}
                        >
                          {item.trailing}
                        </span>
                      )}
                      <ChevronRight
                        className="h-4 w-4 shrink-0"
                        strokeWidth={2.5}
                        style={{ color: MUTED }}
                      />
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ))}

          {/* Sign Out */}
          <button
            onClick={handleLogout}
            className="mt-6 w-full rounded-[22px] py-3.5 inline-flex items-center justify-center gap-2 transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            style={{
              backgroundColor: SURFACE,
              color: "#FF6B6B",
              border: `2px solid ${BORDER}`,
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            <LogOut className="h-4 w-4" strokeWidth={2.5} />
            Sign out
          </button>
        </motion.div>
      </div>
    </div>
  );
};

export default SettingsPage;
