/** @doc Change the account email address with verification. */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopSettingsLayout } from "@/components/settings/DesktopSettingsLayout";
import { sanitizeErrorMessage } from "@/lib/sanitizeError";
import emailSticker from "@/assets/settings/email-sticker.png";
import {
  INK,
  YELLOW,
  MINT,
  PEACH,
  SURFACE,
  BORDER,
  TEXT,
  MUTED,
  PAGE_BG,
} from "@/pages/billing/ReferralsPage";

const ChangeEmailPage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentEmail, setCurrentEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentEmail(user.email || "");
    });
  }, []);

  const handleChangeEmail = async () => {
    if (!newEmail) return toast.error("Please enter an email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))
      return toast.error("Please enter a valid email");
    if (newEmail === currentEmail) return toast.error("This is your current email");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      toast.success("Confirmation email sent to both addresses");
      navigate("/settings/profile");
    } catch (error: any) {
      toast.error(sanitizeErrorMessage(error, "Failed to update email"));
    } finally {
      setLoading(false);
    }
  };

  if (!isMobile) {
    return (
      <DesktopSettingsLayout title="Change Email" subtitle="Update your email address">
        <div className="max-w-md mx-auto space-y-4">
          <div className="flex justify-center py-4">
            <img src={emailSticker} alt="" width={160} height={160} loading="lazy" />
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Current Email
            </p>
            <p className="text-sm font-medium text-foreground">{currentEmail}</p>
          </div>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="your-new@email.com"
            className="w-full px-4 py-3 rounded-xl bg-muted/50 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={handleChangeEmail}
            disabled={loading || !newEmail}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Sending..." : "Update Email"}
          </button>
        </div>
      </DesktopSettingsLayout>
    );
  }

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
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
          </button>
          <h1
            className="text-[17px]"
            style={{ fontWeight: 900, letterSpacing: "-0.02em", color: TEXT }}
          >
            Change Email
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
              backgroundColor: YELLOW,
              border: `2.5px solid ${INK}`,
              boxShadow: `4px 4px 0 ${INK}`,
            }}
          >
            <img
              src={emailSticker}
              alt=""
              width={140}
              height={140}
              loading="lazy"
              className="drop-shadow-sm"
            />
            <p
              className="mt-2 text-[11px] uppercase tracking-wider"
              style={{ fontWeight: 800, color: INK, opacity: 0.7 }}
            >
              Current Email
            </p>
            <p
              className="mt-1 text-[15px] truncate max-w-full"
              style={{ fontWeight: 800, color: INK }}
            >
              {currentEmail || "—"}
            </p>
          </div>

          {/* New email card */}
          <div
            className="mt-3 rounded-[24px] p-5"
            style={{ backgroundColor: SURFACE, border: `1.5px solid ${BORDER}` }}
          >
            <label
              className="text-[11px] uppercase tracking-wider"
              style={{ fontWeight: 800, color: MUTED }}
            >
              New Email Address
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleChangeEmail()}
              placeholder="your-new@email.com"
              className="mt-2 w-full px-4 py-3 rounded-2xl text-[14px] outline-none"
              style={{
                backgroundColor: PAGE_BG,
                border: `2px solid ${BORDER}`,
                color: TEXT,
                fontWeight: 600,
              }}
            />
            <p className="mt-3 text-[12px]" style={{ color: MUTED, fontWeight: 600 }}>
              A confirmation link will be sent to both your current and new email.
            </p>
          </div>

          {/* Actions */}
          <button
            onClick={handleChangeEmail}
            disabled={loading || !newEmail}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full px-4 py-3.5 text-[14px] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
            style={{
              backgroundColor: MINT,
              color: INK,
              fontWeight: 900,
              border: `2.5px solid ${INK}`,
              boxShadow: `4px 4px 0 ${INK}`,
            }}
          >
            {loading ? "Sending..." : "Update Email"}
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

export default ChangeEmailPage;
