/** @doc Switch between multiple signed-in Megsy accounts. */
// Dedicated workspace switcher page — neo-brutalist sticker style, English copy.
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, Plus, Settings2, Users } from "lucide-react";
import { useWorkspaces } from "@/hooks/useWorkspace";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { toast } from "sonner";
import {
  INK,
  YELLOW,
  PINK,
  MINT,
  LAVENDER,
  PEACH,
  BLUE,
  SURFACE,
  BORDER,
  TEXT,
  MUTED,
  PAGE_BG,
} from "@/pages/billing/ReferralsPage";
import { BackIcon } from "@/components/settings/SettingsIcons";

const SwitchAccountPage = () => {
  const navigate = useNavigate();
  const { workspaces, activeId, setActive, loading } = useWorkspaces();
  const account = useActiveAccount();

  const switchTo = async (id: string | null, name: string) => {
    await setActive(id);
    toast.success(`Switched to ${name}`);
  };

  const tones = [PINK, MINT, LAVENDER, PEACH, BLUE, YELLOW];

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
            onClick={() => navigate(-1)}
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
            Switch Account
          </h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="max-w-lg mx-auto pb-12 px-4 safe-bottom">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          {/* Active identity card */}
          <div
            className="mt-4 rounded-[28px] p-5"
            style={{
              backgroundColor: YELLOW,
              border: `2.5px solid ${INK}`,
              boxShadow: `4px 4px 0 ${INK}`,
            }}
          >
            <p
              className="text-[10.5px] uppercase tracking-[0.18em]"
              style={{ fontWeight: 800, color: INK, opacity: 0.7 }}
            >
              Active
            </p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p
                className="text-[20px] truncate"
                style={{ fontWeight: 900, color: INK, letterSpacing: "-0.02em" }}
              >
                {account.name || "Personal"}
              </p>
              <span
                className="text-[12px] tabular-nums shrink-0 px-3 py-1 rounded-full"
                style={{ backgroundColor: INK, color: YELLOW, fontWeight: 900 }}
              >
                {account.credits.toFixed(0)} cr
              </span>
            </div>
            <p className="mt-1 text-[12px]" style={{ fontWeight: 700, color: INK, opacity: 0.7 }}>
              {account.kind === "workspace" ? "Workspace" : "Personal account"}
            </p>
          </div>

          {/* Accounts list */}
          <p
            className="px-2 mt-6 mb-2.5 text-[10.5px] uppercase"
            style={{ color: MUTED, fontWeight: 800, letterSpacing: "0.18em" }}
          >
            Your Accounts
          </p>
          <div
            className="rounded-[22px] overflow-hidden"
            style={{ backgroundColor: SURFACE, border: `1.5px solid ${BORDER}` }}
          >
            {/* Personal */}
            <button
              onClick={() => switchTo(null, "Personal")}
              className="w-full flex items-center gap-3 py-3 px-3.5 text-left transition"
            >
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[14px]"
                style={{
                  backgroundColor: LAVENDER,
                  border: `2px solid ${INK}`,
                  color: INK,
                  fontWeight: 900,
                }}
              >
                P
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[14px]" style={{ fontWeight: 800, color: TEXT }}>
                  Personal
                </p>
                <p className="text-[11.5px] mt-0.5" style={{ color: MUTED, fontWeight: 600 }}>
                  Your private space
                </p>
              </div>
              {activeId === null && (
                <span
                  className="grid h-7 w-7 place-items-center rounded-full"
                  style={{ backgroundColor: MINT, border: `2px solid ${INK}`, color: INK }}
                >
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                </span>
              )}
            </button>

            {loading ? (
              <p
                className="px-3.5 py-3 text-[12px]"
                style={{ color: MUTED, borderTop: `1px solid ${BORDER}` }}
              >
                Loading…
              </p>
            ) : (
              workspaces.map((w, idx) => {
                const tone = tones[(idx + 1) % tones.length];
                const isActive = activeId === w.id;
                return (
                  <button
                    key={w.id}
                    onClick={() => switchTo(w.id, w.name)}
                    className="w-full flex items-center gap-3 py-3 px-3.5 text-left transition"
                    style={{ borderTop: `1px solid ${BORDER}` }}
                  >
                    {w.avatar_url ? (
                      <img
                        src={w.avatar_url}
                        alt=""
                        className="h-10 w-10 rounded-xl object-cover shrink-0"
                        style={{ border: `2px solid ${INK}` }}
                      />
                    ) : (
                      <span
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[14px]"
                        style={{
                          backgroundColor: tone,
                          border: `2px solid ${INK}`,
                          color: INK,
                          fontWeight: 900,
                        }}
                      >
                        {w.name[0]?.toUpperCase()}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] truncate" style={{ fontWeight: 800, color: TEXT }}>
                        {w.name}
                      </p>
                      <p
                        className="text-[11.5px] mt-0.5 tabular-nums"
                        style={{ color: MUTED, fontWeight: 600 }}
                      >
                        {Number(w.credits).toFixed(0)} credits
                      </p>
                    </div>
                    {isActive && (
                      <span
                        className="grid h-7 w-7 place-items-center rounded-full"
                        style={{ backgroundColor: MINT, border: `2px solid ${INK}`, color: INK }}
                      >
                        <Check className="w-3.5 h-3.5" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Actions */}
          <p
            className="px-2 mt-6 mb-2.5 text-[10.5px] uppercase"
            style={{ color: MUTED, fontWeight: 800, letterSpacing: "0.18em" }}
          >
            Manage
          </p>
          <div
            className="rounded-[22px] overflow-hidden"
            style={{ backgroundColor: SURFACE, border: `1.5px solid ${BORDER}` }}
          >
            {activeId && (
              <button
                onClick={() => navigate(`/settings/workspaces/${activeId}`)}
                className="w-full flex items-center gap-3 py-3 px-3.5 text-left transition"
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                  style={{ backgroundColor: PEACH, border: `2px solid ${INK}`, color: INK }}
                >
                  <Settings2 className="w-4 h-4" strokeWidth={2.5} />
                </span>
                <p className="flex-1 text-[14px]" style={{ fontWeight: 800, color: TEXT }}>
                  Manage current workspace
                </p>
              </button>
            )}
            <button
              onClick={() => navigate("/settings/workspaces")}
              className="w-full flex items-center gap-3 py-3 px-3.5 text-left transition"
              style={{ borderTop: activeId ? `1px solid ${BORDER}` : "none" }}
            >
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                style={{ backgroundColor: BLUE, border: `2px solid ${INK}`, color: INK }}
              >
                <Users className="w-4 h-4" strokeWidth={2.5} />
              </span>
              <p className="flex-1 text-[14px]" style={{ fontWeight: 800, color: TEXT }}>
                All workspaces
              </p>
            </button>
            <button
              onClick={() => navigate("/settings/workspaces/new")}
              className="w-full flex items-center gap-3 py-3 px-3.5 text-left transition"
              style={{ borderTop: `1px solid ${BORDER}` }}
            >
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                style={{ backgroundColor: MINT, border: `2px solid ${INK}`, color: INK }}
              >
                <Plus className="w-4 h-4" strokeWidth={2.5} />
              </span>
              <p className="flex-1 text-[14px]" style={{ fontWeight: 800, color: TEXT }}>
                New workspace
              </p>
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default SwitchAccountPage;
