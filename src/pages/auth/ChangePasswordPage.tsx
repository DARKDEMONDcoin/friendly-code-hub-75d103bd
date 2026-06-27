/** @doc Change the current account password while signed in. */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopSettingsLayout } from "@/components/settings/DesktopSettingsLayout";
import { sanitizeErrorMessage } from "@/lib/sanitizeError";
import passwordSticker from "@/assets/settings/password-sticker.png";
import {
  INK,
  LAVENDER,
  MINT,
  PINK,
  SURFACE,
  BORDER,
  TEXT,
  MUTED,
  PAGE_BG,
} from "@/pages/billing/ReferralsPage";

const ChangePasswordPage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) return toast.error("Please fill all fields");
    if (newPassword.length < 8) return toast.error("Password must be at least 8 characters");
    if (newPassword !== confirmPassword) return toast.error("Passwords do not match");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password changed successfully");
      navigate("/settings/profile");
    } catch (error: any) {
      toast.error(sanitizeErrorMessage(error, "Failed to change password"));
    } finally {
      setLoading(false);
    }
  };

  const strength =
    newPassword.length >= 16
      ? 4
      : newPassword.length >= 12
        ? 3
        : newPassword.length >= 8
          ? 2
          : newPassword.length > 0
            ? 1
            : 0;
  const strengthLabels = ["", "Weak", "Medium", "Strong", "Very Strong"];
  const strengthTones = ["", PINK, "#FFD56B", MINT, MINT];

  if (!isMobile) {
    return (
      <DesktopSettingsLayout title="Change Password" subtitle="Update your account password">
        <div className="max-w-md mx-auto space-y-4">
          <div className="flex justify-center py-4">
            <img src={passwordSticker} alt="" width={160} height={160} loading="lazy" />
          </div>
          <input
            type={showNew ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            className="w-full px-4 py-3 rounded-xl bg-muted/50 text-sm outline-none"
          />
          <input
            type={showConfirm ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            className="w-full px-4 py-3 rounded-xl bg-muted/50 text-sm outline-none"
          />
          <button
            onClick={handleChangePassword}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </div>
      </DesktopSettingsLayout>
    );
  }

  const PwdField = ({
    label,
    value,
    onChange,
    show,
    setShow,
    onEnter,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    show: boolean;
    setShow: (v: boolean) => void;
    onEnter?: () => void;
  }) => (
    <div>
      <label
        className="text-[11px] uppercase tracking-wider"
        style={{ fontWeight: 800, color: MUTED }}
      >
        {label}
      </label>
      <div className="relative mt-2">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
          placeholder="••••••••"
          className="w-full px-4 py-3 pr-12 rounded-2xl text-[14px] outline-none"
          style={{
            backgroundColor: PAGE_BG,
            border: `2px solid ${BORDER}`,
            color: TEXT,
            fontWeight: 600,
          }}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-xl"
          style={{ color: TEXT }}
          aria-label={show ? "Hide" : "Show"}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="relative min-h-[100dvh] overflow-y-auto"
      style={{ backgroundColor: PAGE_BG, color: TEXT }}
    >
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
            onClick={() => navigate("/settings/profile")}
            className="grid h-10 w-10 place-items-center rounded-full active:translate-x-[1px] active:translate-y-[1px] transition"
            style={{ backgroundColor: SURFACE, border: `2px solid ${BORDER}`, color: TEXT }}
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
          </button>
          <h1 className="text-[17px]" style={{ fontWeight: 900, letterSpacing: "-0.02em" }}>
            Change Password
          </h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pb-12 safe-bottom">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Hero sticker */}
          <div
            className="mt-4 rounded-[28px] p-6 flex flex-col items-center text-center"
            style={{
              backgroundColor: LAVENDER,
              border: `2.5px solid ${INK}`,
              boxShadow: `4px 4px 0 ${INK}`,
            }}
          >
            <img src={passwordSticker} alt="" width={140} height={140} loading="lazy" />
            <p className="mt-2 text-[14px]" style={{ fontWeight: 800, color: INK, opacity: 0.8 }}>
              Create a strong password with at least 8 characters
            </p>
          </div>

          {/* Fields card */}
          <div
            className="mt-3 rounded-[24px] p-5 space-y-4"
            style={{ backgroundColor: SURFACE, border: `1.5px solid ${BORDER}` }}
          >
            <PwdField
              label="New Password"
              value={newPassword}
              onChange={setNewPassword}
              show={showNew}
              setShow={setShowNew}
            />
            <PwdField
              label="Confirm Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirm}
              setShow={setShowConfirm}
              onEnter={handleChangePassword}
            />

            {newPassword && (
              <div>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-2 flex-1 rounded-full transition-all"
                      style={{
                        backgroundColor: i <= strength ? strengthTones[strength] : BORDER,
                        border: i <= strength ? `1.5px solid ${INK}` : "none",
                      }}
                    />
                  ))}
                </div>
                <p className="mt-2 text-[12px]" style={{ color: MUTED, fontWeight: 700 }}>
                  {strengthLabels[strength]}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <button
            onClick={handleChangePassword}
            disabled={loading || !newPassword || !confirmPassword}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full px-4 py-3.5 text-[14px] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
            style={{
              backgroundColor: MINT,
              color: INK,
              fontWeight: 900,
              border: `2.5px solid ${INK}`,
              boxShadow: `4px 4px 0 ${INK}`,
            }}
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
          <button
            onClick={() => navigate("/settings/profile")}
            className="mt-3 w-full py-3 rounded-full text-[13px]"
            style={{
              backgroundColor: SURFACE,
              color: TEXT,
              fontWeight: 700,
              border: `1.5px solid ${BORDER}`,
            }}
          >
            Cancel
          </button>
        </motion.div>
      </div>
    </div>
  );
};

export default ChangePasswordPage;
