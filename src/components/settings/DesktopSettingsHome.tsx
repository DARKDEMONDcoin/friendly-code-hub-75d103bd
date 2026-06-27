import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import OliveAvatar from "@/components/branding/OliveAvatar";

type Row = { title: string; desc: string; path: string };

export function DesktopSettingsHome() {
  const navigate = useNavigate();
  const account = useActiveAccount();
  const credits = account.credits;
  const userName = account.name || "User";
  const avatarUrl = account.avatarUrl;
  const [userEmail, setUserEmail] = useState("");
  const [plan, setPlan] = useState("free");

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
  }, [account.kind]);

  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);

  const groups: { label: string; items: Row[] }[] = [
    {
      label: "Account",
      items: [
        { title: "Profile", desc: "Name, avatar, public details", path: "/settings/profile" },
        {
          title: "Plan & billing",
          desc: `${planLabel} plan · manage subscription`,
          path: "/settings/billing",
        },
      ],
    },
    {
      label: "AI",
      items: [
        {
          title: "Personalization",
          desc: "Tune AI behavior, tone & traits",
          path: "/settings/ai-personalization",
        },
        {
          title: "Memory",
          desc: `${credits !== null ? credits.toFixed(0) : "—"} MC stored`,
          path: "/settings/memory",
        },
        { title: "Skills", desc: "Custom skills & capabilities", path: "/settings/skills" },
      ],
    },
    {
      label: "Workspace",
      items: [
        { title: "Workspaces", desc: "Switch or manage workspaces", path: "/settings/workspaces" },
        { title: "Integrations", desc: "Slack, Discord, Google & more", path: "/settings/integrations" },
      ],
    },
    {
      label: "System",
      items: [
        { title: "Appearance", desc: "Theme, density & accent", path: "/settings/customization" },
        { title: "Language", desc: "UI & AI reply language", path: "/settings/language" },
        { title: "Notifications", desc: "Email, mentions & news", path: "/settings/notifications" },
        { title: "Privacy & data", desc: "Data sharing, export & deletion", path: "/settings/privacy" },
      ],
    },
  ];

  const stats = [
    { label: "Plan", value: planLabel },
    { label: "Credits", value: credits !== null ? credits.toFixed(0) : "—" },
    { label: "AI setup", value: "Ready" },
    { label: "Privacy", value: "Locked" },
  ];

  return (
    <div className="space-y-6">
      {/* Top row: identity + mode card with video background */}
      <section className="grid grid-cols-12 gap-5">
        {/* Identity */}
        <div className="col-span-8 rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-5 flex items-center justify-between gap-4 border-b border-border/60">
            <div className="flex items-center gap-4 min-w-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-12 w-12 rounded-lg object-cover border border-border" />
              ) : (
                <OliveAvatar seed={userEmail || userName} className="h-12 w-12 rounded-lg border border-border" />
              )}
              <div className="min-w-0">
                <h2 className="text-[16px] font-semibold text-foreground truncate leading-tight">{userName}</h2>
                <p className="text-[12px] text-muted-foreground truncate mt-0.5">{userEmail || "—"}</p>
              </div>
            </div>
            <button
              onClick={() => navigate("/settings/profile")}
              className="h-9 shrink-0 whitespace-nowrap rounded-lg border border-border bg-background px-4 text-[12px] font-semibold text-foreground hover:bg-accent transition-colors"
            >
              Edit profile
            </button>
          </div>
          <div className="grid grid-cols-4">
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className={`px-6 py-5 ${i > 0 ? "border-l border-border/60" : ""}`}
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                <p className="mt-2 text-[20px] font-semibold text-foreground truncate leading-none">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Mode card with video background */}
        <div className="col-span-4 relative rounded-xl border border-border overflow-hidden min-h-[200px]">
          <video
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260602_150901_c45b90ec-18d7-42ff-90e2-b95d7109e330.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/30" />
          <div className="relative h-full p-6 flex flex-col justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Account mode</p>
            <div>
              <p className="text-[34px] leading-none font-semibold text-white">
                {account.kind === "workspace" ? "Workspace" : "Personal"}
              </p>
              <p className="mt-3 text-[12px] leading-5 text-white/75 max-w-[260px]">
                Focused control surfaces, one calm surface per concern.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Uniform 2×2 group grid */}
      <section className="grid grid-cols-2 gap-5">
        {groups.map((group, groupIndex) => (
          <div
            key={group.label}
            className="flex flex-col rounded-xl border border-border bg-card overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-foreground">{group.label}</h2>
              <span className="text-[11px] text-muted-foreground tabular-nums">0{groupIndex + 1}</span>
            </div>
            <div className="flex-1 divide-y divide-border/50">
              {group.items.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="group w-full h-16 px-5 flex items-center justify-between gap-4 text-left hover:bg-secondary/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate">{item.title}</p>
                    <p className="text-[12px] text-muted-foreground truncate mt-0.5">{item.desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

export default DesktopSettingsHome;