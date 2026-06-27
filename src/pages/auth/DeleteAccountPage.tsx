/** @doc Permanently delete the account and all associated data. */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopSettingsLayout } from "@/components/settings/DesktopSettingsLayout";
import { t as authT, translateAuthError } from "@/lib/authI18n";
import deleteSticker from "@/assets/settings/delete-sticker.png";
import {
  INK,
  PEACH,
  PINK,
  SURFACE,
  BORDER,
  TEXT,
  MUTED,
  PAGE_BG,
} from "@/pages/billing/ReferralsPage";

const RED = "#FF6B6B";

const DeleteAccountPage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (confirmText !== "DELETE") return toast.error(authT("typeDelete"));
    if (!password.trim()) return toast.error(authT("enterPasswordConfirm"));
    setIsDeleting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("User not found");
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (signInError) {
        toast.error(authT("incorrectPassword"));
        setIsDeleting(false);
        return;
      }
      toast.success(authT("accountDeletionRequested"));
      await supabase.auth.signOut();
      navigate("/auth");
    } catch (error: any) {
      toast.error(translateAuthError(error, "deleteAccountFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  const deletedItems = [
    "Profile Information",
    "All Conversations",
    "Generated Images & Videos",
    "MC & Subscription",
  ];

  if (!isMobile) {
    return (
      <DesktopSettingsLayout
        title="Delete Account"
        subtitle="Permanently delete your account and data"
      >
        <div className="max-w-md mx-auto space-y-4">
          <div className="flex justify-center py-4">
            <img src={deleteSticker} alt="" width={160} height={160} loading="lazy" />
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            className="w-full px-4 py-3 rounded-xl bg-muted/50 text-sm outline-none"
          />
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="w-full px-4 py-3 rounded-xl bg-muted/50 text-sm outline-none"
          />
          <button
            onClick={handleDeleteAccount}
            disabled={isDeleting || confirmText !== "DELETE"}
            className="w-full py-3 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-40"
          >
            {isDeleting ? "Deleting..." : "Delete My Account"}
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
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
          </button>
          <h1 className="text-[17px]" style={{ fontWeight: 900, letterSpacing: "-0.02em" }}>
            Delete Account
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
              backgroundColor: PEACH,
              border: `2.5px solid ${INK}`,
              boxShadow: `4px 4px 0 ${INK}`,
            }}
          >
            <img src={deleteSticker} alt="" width={140} height={140} loading="lazy" />
            <h2
              className="mt-2 text-[20px]"
              style={{ fontWeight: 900, color: INK, letterSpacing: "-0.02em" }}
            >
              Delete your account?
            </h2>
            <p className="mt-1 text-[13px]" style={{ fontWeight: 700, color: INK, opacity: 0.8 }}>
              This action is permanent and cannot be undone
            </p>
          </div>

          {/* What gets deleted */}
          <div
            className="mt-3 rounded-[24px] p-5"
            style={{ backgroundColor: SURFACE, border: `1.5px solid ${BORDER}` }}
          >
            <p
              className="text-[11px] uppercase tracking-wider mb-3"
              style={{ fontWeight: 800, color: MUTED }}
            >
              What will be deleted
            </p>
            <div className="space-y-2.5">
              {deletedItems.map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <span
                    className="grid h-7 w-7 place-items-center rounded-lg shrink-0"
                    style={{
                      backgroundColor: PINK,
                      border: `2px solid ${INK}`,
                      color: INK,
                      fontWeight: 900,
                      fontSize: 12,
                    }}
                  >
                    ×
                  </span>
                  <p className="text-[14px]" style={{ color: TEXT, fontWeight: 600 }}>
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Password */}
          <div
            className="mt-3 rounded-[24px] p-5"
            style={{ backgroundColor: SURFACE, border: `1.5px solid ${BORDER}` }}
          >
            <label
              className="text-[11px] uppercase tracking-wider"
              style={{ fontWeight: 800, color: MUTED }}
            >
              Enter your password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              className="mt-2 w-full px-4 py-3 rounded-2xl text-[14px] outline-none"
              style={{
                backgroundColor: PAGE_BG,
                border: `2px solid ${BORDER}`,
                color: TEXT,
                fontWeight: 600,
              }}
            />

            <label
              className="text-[11px] uppercase tracking-wider mt-4 block"
              style={{ fontWeight: 800, color: MUTED }}
            >
              Type <span style={{ color: RED }}>DELETE</span> to confirm
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDeleteAccount()}
              placeholder="DELETE"
              className="mt-2 w-full px-4 py-3 rounded-2xl text-[14px] outline-none uppercase tracking-widest"
              style={{
                backgroundColor: PAGE_BG,
                border: `2px solid ${BORDER}`,
                color: TEXT,
                fontWeight: 800,
              }}
            />
          </div>

          {/* Actions */}
          <button
            onClick={handleDeleteAccount}
            disabled={isDeleting || confirmText !== "DELETE"}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full px-4 py-3.5 text-[14px] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-40"
            style={{
              backgroundColor: RED,
              color: "#FFF5F0",
              fontWeight: 900,
              border: `2.5px solid ${INK}`,
              boxShadow: `4px 4px 0 ${INK}`,
            }}
          >
            {isDeleting ? "Deleting..." : "Delete My Account"}
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

export default DeleteAccountPage;
