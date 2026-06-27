/** @doc Edit profile name, avatar, bio and public details. */
import { useState, useEffect, useRef } from "react";
import {
  MailCheck,
  ShieldEllipsis,
  ShieldCheck,
  UserRoundX,
  Gem,
  Camera,
  ChevronRight,
  Pencil,
  Check,
  X,
  LogOut,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopSettingsLayout } from "@/components/settings/DesktopSettingsLayout";
import { toast } from "sonner";
import OliveAvatar from "@/components/branding/OliveAvatar";
import { BackIcon } from "@/components/settings/SettingsIcons";
import {
  BentoGrid,
  BentoCard,
  BentoHero,
  BentoLabel,
  BentoTitle,
  BentoBody,
  BentoStat,
  BentoSectionTitle,
} from "@/components/settings/bento/Bento";
import {
  INK,
  YELLOW,
  PINK,
  MINT,
  LAVENDER,
  PEACH,
  SURFACE,
  BORDER,
  TEXT,
  MUTED,
  PAGE_BG,
} from "@/pages/billing/ReferralsPage";
import { sanitizeErrorMessage } from "@/lib/sanitizeError";
import { cn } from "@/lib/utils";

const ProfileSettingsPage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [credits, setCredits] = useState(0);
  const [plan, setPlan] = useState("free");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [toggling2FA, setToggling2FA] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setUserId(user.id);
      setUserName(user.user_metadata?.full_name || user.email?.split("@")[0] || "");
      setUserEmail(user.email || "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("credits, plan, display_name, avatar_url, two_factor_enabled")
        .eq("id", user.id)
        .single();
      if (profile && !cancelled) {
        setCredits(Number(profile.credits) || 0);
        setPlan(profile.plan || "free");
        if (profile.display_name) setUserName(profile.display_name);
        setAvatarUrl(profile.avatar_url || user.user_metadata?.avatar_url || null);
        setTwoFactorEnabled((profile as any).two_factor_enabled ?? false);
      }
      // Authoritative 2FA state from Supabase Auth
      try {
        const { data: f } = await supabase.auth.mfa.listFactors();
        if (!cancelled) {
          const verified = (f?.totp || []).some((x: any) => x.status === "verified");
          setTwoFactorEnabled(verified);
        }
      } catch {}
    };
    loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image too large. Max 5MB.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${userId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);
      setAvatarUrl(publicUrl);
      await supabase.rpc("update_profile_safe", { p_user_id: userId, p_avatar_url: publicUrl });
      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
      toast.success("Profile photo updated");
    } catch (err: any) {
      toast.error(sanitizeErrorMessage(err, "Failed to upload photo"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSaveName = async () => {
    if (!nameInput.trim() || !userId) return;
    try {
      await supabase.rpc("update_profile_safe", {
        p_user_id: userId,
        p_display_name: nameInput.trim(),
      });
      await supabase.auth.updateUser({ data: { full_name: nameInput.trim() } });
      setUserName(nameInput.trim());
      setEditingName(false);
      toast.success("Name updated");
    } catch {
      toast.error("Failed to update name");
    }
  };

  const handleToggle2FA = async () => {
    if (!userId) return;
    setToggling2FA(true);
    try {
      const newVal = !twoFactorEnabled;
      await supabase.rpc("update_profile_safe", {
        p_user_id: userId,
        p_two_factor_enabled: newVal,
      });
      setTwoFactorEnabled(newVal);
      toast.success(
        newVal ? "Two-factor authentication enabled" : "Two-factor authentication disabled",
      );
    } catch {
      toast.error("Failed to update 2FA setting");
    } finally {
      setToggling2FA(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const securityItems = [
    {
      id: "email",
      icon: MailCheck,
      tone: PEACH,
      label: "Change Email",
      desc: userEmail,
      onClick: () => navigate("/settings/change-email"),
      trailing: (
        <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.5} style={{ color: MUTED }} />
      ),
    },
    {
      id: "password",
      icon: ShieldEllipsis,
      tone: LAVENDER,
      label: "Change Password",
      desc: "Update your password",
      onClick: () => navigate("/settings/change-password"),
      trailing: (
        <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.5} style={{ color: MUTED }} />
      ),
    },
    {
      id: "2fa",
      icon: ShieldCheck,
      tone: MINT,
      label: "Two-Factor Authentication",
      desc: twoFactorEnabled ? "Enabled — OTP required on login" : "Disabled — Tap to set up",
      onClick: () => navigate("/settings/two-factor"),
      trailing: (
        <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.5} style={{ color: MUTED }} />
      ),
    },
  ];

  const content = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-lg mx-auto"
    >
      {/* Profile sticker card */}
      <div
        className="mt-4 rounded-[28px] p-5"
        style={{
          backgroundColor: YELLOW,
          border: `2.5px solid ${INK}`,
          boxShadow: `4px 4px 0 ${INK}`,
        }}
      >
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: `2.5px solid ${INK}`, backgroundColor: SURFACE }}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="block w-[72px] h-[72px] object-cover" />
              ) : (
                <OliveAvatar seed={userEmail || userName} className="w-[72px] h-[72px]" />
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1.5 -right-1.5 grid h-7 w-7 place-items-center rounded-full active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition"
              style={{ backgroundColor: INK, color: YELLOW, boxShadow: `2px 2px 0 ${INK}` }}
              aria-label="Upload photo"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            {uploading && (
              <div
                className="absolute inset-0 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: `${INK}80` }}
              >
                <div
                  className="w-6 h-6 rounded-full animate-spin"
                  style={{
                    border: `2px solid ${YELLOW}`,
                    borderTopColor: "transparent",
                  }}
                />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent outline-none"
                  style={{
                    color: INK,
                    fontWeight: 900,
                    fontSize: "18px",
                    letterSpacing: "-0.02em",
                    borderBottom: `2px solid ${INK}`,
                  }}
                />
                <button
                  onClick={handleSaveName}
                  className="grid h-7 w-7 place-items-center rounded-lg shrink-0"
                  style={{ backgroundColor: INK, color: YELLOW }}
                >
                  <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="grid h-7 w-7 place-items-center rounded-lg shrink-0"
                  style={{ backgroundColor: SURFACE, color: INK }}
                >
                  <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setNameInput(userName);
                  setEditingName(true);
                }}
                className="flex items-center gap-1.5 group min-w-0"
              >
                <p
                  className="text-[18px] truncate"
                  style={{ fontWeight: 900, color: INK, letterSpacing: "-0.02em" }}
                >
                  {userName || "Set your name"}
                </p>
                <Pencil className="w-3.5 h-3.5 shrink-0" style={{ color: INK, opacity: 0.5 }} />
              </button>
            )}
            <p
              className="text-[12.5px] truncate mt-0.5"
              style={{ fontWeight: 700, color: INK, opacity: 0.7 }}
            >
              {userEmail}
            </p>
            <span
              className="inline-block mt-2 rounded-full px-2.5 py-0.5 text-[10.5px] uppercase tracking-wider"
              style={{ backgroundColor: INK, color: YELLOW, fontWeight: 800 }}
            >
              {plan} plan
            </span>
          </div>
        </div>
      </div>

      {/* Credits + Plan quick row */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate("/settings/billing")}
          className="rounded-[22px] p-4 text-left active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition"
          style={{
            backgroundColor: MINT,
            border: `2.5px solid ${INK}`,
            boxShadow: `3px 3px 0 ${INK}`,
          }}
        >
          <p
            className="text-[11px] uppercase tracking-wider"
            style={{ fontWeight: 800, color: INK, opacity: 0.7 }}
          >
            Credits
          </p>
          <p
            className="mt-1 text-[30px] leading-none tabular-nums"
            style={{ fontWeight: 900, color: INK, letterSpacing: "-0.03em" }}
          >
            {Math.floor(credits)}{" "}
            <span className="text-[14px]" style={{ fontWeight: 800 }}>
              MC
            </span>
          </p>
        </button>

        <button
          onClick={() => navigate("/pricing")}
          className="rounded-[22px] p-4 text-left active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition"
          style={{
            backgroundColor: LAVENDER,
            border: `2.5px solid ${INK}`,
            boxShadow: `3px 3px 0 ${INK}`,
          }}
        >
          <p
            className="text-[11px] uppercase tracking-wider"
            style={{ fontWeight: 800, color: INK, opacity: 0.7 }}
          >
            Plan
          </p>
          <p
            className="mt-1 text-[30px] leading-none capitalize"
            style={{ fontWeight: 900, color: INK, letterSpacing: "-0.03em" }}
          >
            {plan === "free" ? "Free" : plan}
          </p>
        </button>
      </div>

      {/* Security section */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-6"
      >
        <p
          className="px-2 mb-2.5 text-[10.5px] uppercase"
          style={{ color: MUTED, fontWeight: 800, letterSpacing: "0.18em" }}
        >
          Security
        </p>
        <div
          className="rounded-[22px] overflow-hidden"
          style={{ backgroundColor: SURFACE, border: `1.5px solid ${BORDER}` }}
        >
          {securityItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={item.onClick}
                disabled={item.id === "2fa" && toggling2FA}
                className="w-full flex items-center gap-3 py-3 px-3.5 text-left transition active:scale-[0.99]"
                style={{
                  borderTop: idx === 0 ? "none" : `1px solid ${BORDER}`,
                  opacity: item.id === "2fa" && toggling2FA ? 0.7 : 1,
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
                  <p
                    className="text-[11.5px] mt-0.5 truncate"
                    style={{ color: MUTED, fontWeight: 600 }}
                  >
                    {item.desc}
                  </p>
                </div>
                {item.trailing}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Upgrade */}
      {plan === "free" && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
          className="mt-3"
        >
          <button
            onClick={() => navigate("/pricing")}
            className="w-full flex items-center gap-3 py-3 px-3.5 rounded-[22px] text-left active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition"
            style={{
              backgroundColor: YELLOW,
              border: `2.5px solid ${INK}`,
              boxShadow: `3px 3px 0 ${INK}`,
            }}
          >
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
              style={{ backgroundColor: INK, color: YELLOW }}
            >
              <Gem className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px]" style={{ fontWeight: 900, color: INK }}>
                Upgrade to Premium
              </p>
              <p
                className="text-[11.5px] mt-0.5"
                style={{ color: INK, fontWeight: 700, opacity: 0.7 }}
              >
                Get unlimited access to all features
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.5} style={{ color: INK }} />
          </button>
        </motion.div>
      )}

      {/* Delete Account */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="mt-3"
      >
        <button
          onClick={() => navigate("/settings/delete-account")}
          className="w-full flex items-center gap-3 py-3 px-3.5 rounded-[22px] text-left active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition"
          style={{ backgroundColor: SURFACE, border: `1.5px solid ${BORDER}` }}
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
            style={{ backgroundColor: PINK, border: `2px solid ${INK}` }}
          >
            <UserRoundX className="w-4 h-4" style={{ color: INK }} />
          </span>
          <p className="text-[14px]" style={{ fontWeight: 800, color: "#FF6B6B" }}>
            Delete Account
          </p>
        </button>
      </motion.div>

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

      <div className="h-8" />

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={handleAvatarUpload}
      />
    </motion.div>
  );

  if (!isMobile) {
    return (
      <DesktopSettingsLayout>
        <div className="max-w-2xl mx-auto py-4 space-y-12">
          {/* Identity header */}
          <header className="flex items-center gap-5">
            <div className="relative shrink-0">
              <div className="h-20 w-20 rounded-full overflow-hidden border border-border/60 bg-secondary">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="block w-full h-full object-cover" />
                ) : (
                  <OliveAvatar seed={userEmail || userName} className="w-full h-full" />
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-foreground text-background border-2 border-background hover:opacity-90 transition-opacity disabled:opacity-60"
                aria-label="Upload photo"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="min-w-0 flex-1">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                    autoFocus
                    className="flex-1 min-w-0 bg-transparent outline-none border-b border-border text-[22px] font-semibold tracking-tight text-foreground pb-1"
                  />
                  <button onClick={handleSaveName} className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-background">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setEditingName(false)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setNameInput(userName);
                    setEditingName(true);
                  }}
                  className="group inline-flex items-center gap-2 text-[22px] font-semibold tracking-tight text-foreground"
                >
                  <span className="truncate">{userName || "Set your name"}</span>
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
                </button>
              )}
              <p className="text-[13px] text-muted-foreground truncate mt-1">{userEmail}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-flex items-center h-6 px-2 rounded-md bg-secondary text-[11px] font-medium text-foreground/80 capitalize">
                  {plan} plan
                </span>
                {twoFactorEnabled && (
                  <span className="inline-flex items-center h-6 px-2 rounded-md bg-secondary text-[11px] font-medium text-foreground/80">
                    2FA on
                  </span>
                )}
              </div>
            </div>
          </header>

          {/* Account */}
          <Section title="Account">
            <Row
              label="Email"
              value={userEmail}
              onClick={() => navigate("/settings/change-email")}
            />
            <Row
              label="Password"
              value="Set a new password"
              onClick={() => navigate("/settings/change-password")}
            />
            <Row
              label="Two-factor authentication"
              value={twoFactorEnabled ? "On" : "Off"}
              onClick={() => navigate("/settings/two-factor")}
            />
          </Section>

          {/* Subscription */}
          <Section title="Subscription">
            <Row
              label="Plan"
              value={<span className="capitalize">{plan}</span>}
              onClick={() => navigate("/settings/billing")}
            />
            <Row
              label="Credits"
              value={`${Math.floor(credits)} MC`}
              onClick={() => navigate("/settings/billing")}
            />
            {plan === "free" && (
              <Row
                label="Upgrade to Pro"
                value="Unlimited models, priority queue"
                onClick={() => navigate("/pricing")}
              />
            )}
          </Section>

          {/* Danger */}
          <Section title="Danger zone">
            <Row label="Sign out" value="End your session on this device" onClick={handleLogout} />
            <Row
              label={<span className="text-destructive">Delete account</span>}
              value="Permanent. Wipes every workspace within 30 days."
              onClick={() => navigate("/settings/delete-account")}
            />
          </Section>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*"
            onChange={handleAvatarUpload}
          />
        </div>
      </DesktopSettingsLayout>
    );
  }

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
            onClick={() => navigate("/settings")}
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
            Account
          </h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="max-w-lg mx-auto pb-12 px-4 safe-bottom">{content}</div>
    </div>
  );
};

export default ProfileSettingsPage;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
        {title}
      </h2>
      <div className="divide-y divide-border/60 border-t border-b border-border/60">
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  onClick,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group w-full flex items-center justify-between gap-6 py-4 text-left hover:bg-secondary/40 -mx-4 px-4 transition-colors"
    >
      <span className="text-[14px] font-medium text-foreground">{label}</span>
      <span className="flex items-center gap-3 min-w-0">
        <span className="text-[13px] text-muted-foreground truncate max-w-[280px]">{value}</span>
        <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0" />
      </span>
    </button>
  );
}
