/** @doc Email, push and in-app notification preferences. */
// Notification settings — cartoon redesign on mobile.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import AppLayout from "@/layouts/AppLayout";
import { toast } from "@/hooks/use-toast";
import { useActiveWorkspaceId } from "@/lib/activeWorkspace";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopSettingsLayout } from "@/components/settings/DesktopSettingsLayout";
import { CleanStack, CleanCard } from "@/components/settings/CleanSettings";
import {
  BentoGrid,
  BentoCard,
  BentoHero,
  BentoTitle,
  BentoLabel,
  BentoToggleRow,
  BentoSectionTitle,
} from "@/components/settings/bento/Bento";
import { CartoonPage, CartoonHero, CartoonCard } from "@/components/settings/CartoonSettingsShell";
import { YELLOW, TEXT, MUTED } from "@/pages/billing/ReferralsPage";
import notificationsSticker from "@/assets/settings/notifications-sticker.png";

interface Preferences {
  email_welcome: boolean;
  email_low_balance: boolean;
  email_transactions: boolean;
  email_newsletter: boolean;
}

const defaults: Preferences = {
  email_welcome: true,
  email_low_balance: true,
  email_transactions: true,
  email_newsletter: false,
};

const groups: Array<{
  title: string;
  items: Array<{ key: keyof Preferences; label: string; desc: string }>;
}> = [
  {
    title: "Account",
    items: [
      { key: "email_welcome", label: "Welcome & onboarding", desc: "Tips to help you get started" },
      {
        key: "email_transactions",
        label: "Transactions & receipts",
        desc: "Payments, refunds and plan changes",
      },
    ],
  },
  {
    title: "Activity",
    items: [
      {
        key: "email_low_balance",
        label: "Low balance",
        desc: "Heads up when your credits run low",
      },
    ],
  },
  {
    title: "From Megsy",
    items: [
      {
        key: "email_newsletter",
        label: "Product newsletter",
        desc: "New features and product updates",
      },
    ],
  },
];

const NotificationSettingsPage = () => {
  const workspaceId = useActiveWorkspaceId();
  const isMobile = useIsMobile();
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPrefs(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [workspaceId]);

  const loadPrefs = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    let q = supabase
      .from("notification_preferences")
      .select("email_welcome, email_low_balance, email_transactions, email_newsletter")
      .eq("user_id", user.id);
    q = workspaceId ? q.eq("workspace_id", workspaceId) : q.is("workspace_id", null);
    const { data } = await q.maybeSingle();
    setPrefs(data ? (data as Preferences) : defaults);
    setLoading(false);
  };

  const updatePref = async (key: keyof Preferences, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    let sel = supabase.from("notification_preferences").select("id").eq("user_id", user.id);
    sel = workspaceId ? sel.eq("workspace_id", workspaceId) : sel.is("workspace_id", null);
    const { data: existing } = await sel.maybeSingle();

    let error;
    if (existing?.id) {
      const res = await supabase
        .from("notification_preferences")
        .update({ ...next, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      error = res.error;
    } else {
      const res = await supabase
        .from("notification_preferences")
        .insert({ user_id: user.id, workspace_id: workspaceId, ...next });
      error = res.error;
    }
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: "Failed to save preferences", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!isMobile) {
    return (
      <DesktopSettingsLayout
        title="Notifications"
        subtitle="Choose which emails you want to receive."
      >
        <div className="space-y-12">
          {/* Status bar */}
          <div className="flex items-center justify-between pb-5 border-b border-border/40">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg border border-border bg-card grid place-items-center text-lg">
                ✉
              </div>
              <div>
                <p className="text-[14px] font-medium text-foreground">Email channel</p>
                <p className="text-[12.5px] text-muted-foreground">
                  {Object.values(prefs).filter(Boolean).length} of{" "}
                  {Object.keys(prefs).length} categories active
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-mono">
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  All changes saved
                </>
              )}
            </div>
          </div>

          {/* Two-column groups: description + controls */}
          {groups.map((group, gi) => (
            <section key={group.title} className="grid grid-cols-12 gap-10">
              <div className="col-span-4">
                <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.16em]">
                  0{gi + 1}
                </p>
                <h2 className="mt-2 text-[18px] font-semibold tracking-tight text-foreground">
                  {group.title}
                </h2>
                <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
                  {group.title === "Account"
                    ? "Operational emails tied to your account — onboarding tips and billing receipts."
                    : group.title === "Activity"
                      ? "Important signals about how you're using Megsy — credits, usage, alerts."
                      : "Optional product updates and stories. We never send promos without consent."}
                </p>
              </div>
              <div className="col-span-8">
                <div className="border border-border/60 rounded-lg overflow-hidden bg-card/40">
                  {group.items.map((it, i) => (
                    <label
                      key={it.key}
                      className={`flex items-start justify-between gap-6 px-5 py-4 cursor-pointer hover:bg-card/80 transition-colors ${
                        i > 0 ? "border-t border-border/40" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-medium text-foreground">{it.label}</p>
                        <p className="text-[12.5px] text-muted-foreground mt-0.5">{it.desc}</p>
                      </div>
                      <Switch
                        checked={prefs[it.key]}
                        onCheckedChange={(v) => updatePref(it.key, v)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      </DesktopSettingsLayout>
    );
  }

  const groupsBody = (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.title}>
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70 mb-2 px-1">
            {group.title}
          </p>
          <div className="rounded-2xl border border-border bg-card divide-y divide-border">
            {group.items.map((it) => (
              <div key={it.key} className="flex items-center justify-between gap-4 px-4 py-4">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-foreground">{it.label}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
                    {it.desc}
                  </p>
                </div>
                <Switch checked={prefs[it.key]} onCheckedChange={(v) => updatePref(it.key, v)} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );

  return (
    <AppLayout>
      <CartoonPage title="Notifications">
        <CartoonHero
          sticker={notificationsSticker}
          bg={YELLOW}
          title="Email preferences"
          subtitle="Choose which emails you want. We never send promos without permission."
          trailing={
            saving ? (
              <div
                className="mt-3 flex items-center gap-2 text-[12px]"
                style={{ color: "#0a0a0a", fontWeight: 700 }}
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Saving…
              </div>
            ) : null
          }
        />

        <div className="space-y-5 mt-2">
          {groups.map((group) => (
            <section key={group.title}>
              <p
                className="text-[11px] uppercase tracking-[0.12em] mb-2 px-2"
                style={{ color: MUTED, fontWeight: 800 }}
              >
                {group.title}
              </p>
              <CartoonCard className="!p-0 overflow-hidden">
                <div className="divide-y" style={{ borderColor: "hsl(var(--surface-4))" }}>
                  {group.items.map((it, idx) => (
                    <div
                      key={it.key}
                      className="flex items-center justify-between gap-4 px-4 py-4"
                      style={{
                        borderColor: "hsl(var(--surface-4))",
                        borderTopWidth: idx === 0 ? 0 : 1,
                      }}
                    >
                      <div className="min-w-0">
                        <p className="text-[14px]" style={{ color: TEXT, fontWeight: 800 }}>
                          {it.label}
                        </p>
                        <p
                          className="text-[12px] mt-0.5 leading-relaxed"
                          style={{ color: MUTED, fontWeight: 600 }}
                        >
                          {it.desc}
                        </p>
                      </div>
                      <Switch
                        checked={prefs[it.key]}
                        onCheckedChange={(v) => updatePref(it.key, v)}
                      />
                    </div>
                  ))}
                </div>
              </CartoonCard>
            </section>
          ))}
        </div>
      </CartoonPage>
    </AppLayout>
  );
};

export default NotificationSettingsPage;
