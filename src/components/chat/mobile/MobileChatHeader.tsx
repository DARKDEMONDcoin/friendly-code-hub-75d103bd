import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Copy,
  Globe,
  Loader2,
  Lock,
  MoreVertical,
  Plus,
  Share2,
  UserPlus,
  Pencil,
  Pin,
  Trash2,
} from "lucide-react";
import MegsyStar from "@/components/files/MegsyStar";


type MenuView = "main" | "rename" | "invite" | "share" | "delete";

const MEGSY_APP_ICON = "/favicon.png";

const MegsySidebarToggleIcon = () => (
  // Clear sidebar/panel-left icon: panel outline with a left rail + content lines
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    className="h-[22px] w-[22px]"
  >
    <rect
      x="3.25"
      y="4.5"
      width="17.5"
      height="15"
      rx="3.5"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <line x1="9.25" y1="4.5" x2="9.25" y2="19.5" stroke="currentColor" strokeWidth="1.6" />
    <line
      x1="5.5"
      y1="9"
      x2="7"
      y2="9"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <line
      x1="5.5"
      y1="12"
      x2="7"
      y2="12"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <line
      x1="5.5"
      y1="15"
      x2="7"
      y2="15"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export interface MobileChatHeaderProps {
  title?: string;
  hasConversation: boolean;
  isPinned?: boolean;
  onOpenSidebar: () => void;
  onNewChat: () => void;
  onShare: () => void;
  onInvite: () => void;
  onRename: () => void;
  onTogglePin: () => void;
  onDelete: () => void | Promise<void>;
  isDeleting?: boolean;
  rightSlot?: React.ReactNode;
  modelSlot?: React.ReactNode;

  // Inline view props (optional — when present, Share/Invite/Rename open inside the same menu)
  inlineRename?: {
    value: string;
    onChange: (v: string) => void;
    onSave: () => void;
  };
  inlineInvite?: {
    email: string;
    onEmailChange: (v: string) => void;
    onSend: () => void;
    loading?: boolean;
    link?: string | null;
    onCopyLink: () => void;
    onOpen: () => void;
  };
  inlineShare?: {
    mode: "private" | "public";
    onModeChange: (m: "private" | "public") => void;
    url?: string | null;
    onCopyLink: () => void;
    onOpen: () => void;
  };
}

export default function MobileChatHeader({
  hasConversation,
  isPinned,
  onOpenSidebar,
  onNewChat,
  onShare,
  onInvite,
  onRename,
  onTogglePin,
  onDelete,
  isDeleting,
  rightSlot,
  modelSlot,
  inlineRename,
  inlineInvite,
  inlineShare,
}: MobileChatHeaderProps) {
  const [open, setOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>("main");

  const close = () => {
    setOpen(false);
    setMenuView("main");
  };
  const runAndClose = (fn: () => void) => {
    setOpen(false);
    setMenuView("main");
    setTimeout(fn, 60);
  };

  const goRename = () => {
    if (inlineRename) {
      onRename();
      setMenuView("rename");
    } else runAndClose(onRename);
  };
  const goInvite = () => {
    if (inlineInvite) {
      inlineInvite.onOpen();
      setMenuView("invite");
    } else runAndClose(onInvite);
  };
  const goShare = () => {
    if (inlineShare) {
      inlineShare.onOpen();
      setMenuView("share");
    } else runAndClose(onShare);
  };

  const items: Array<{ icon: typeof Share2; label: string; onClick: () => void }> = [
    { icon: Share2, label: "Share", onClick: goShare },
    { icon: Pin, label: isPinned ? "Unpin" : "Pin chat", onClick: () => runAndClose(onTogglePin) },
    { icon: UserPlus, label: "Invite people", onClick: goInvite },
    { icon: Pencil, label: "Rename", onClick: goRename },
    { icon: Plus, label: "New chat", onClick: () => runAndClose(onNewChat) },
  ];

  const confirmDelete = async () => {
    await onDelete();
    close();
  };

  return (
    <>
      <div
        data-testid="mobile-chat-header"
        style={{ top: "var(--promo-banner-h, 0px)" }}
        className="mobile-chat-header md:hidden fixed inset-x-0 z-30 flex items-center gap-2 px-3 py-1.5 min-h-[44px] pt-[max(env(safe-area-inset-top),0.25rem)] bg-transparent pointer-events-none [&>*]:pointer-events-auto"
      >
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open menu"
          data-testid="mobile-open-sidebar"
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-foreground bg-transparent border-0 active:scale-95 transition"
        >
          <MegsySidebarToggleIcon />
        </button>

        {modelSlot ? <div className="flex items-center">{modelSlot}</div> : null}

        <div className="flex-1 min-w-0" />
        {!hasConversation && rightSlot ? (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto">
            {rightSlot}
          </div>
        ) : null}

        {!hasConversation && (
          <div className="flex items-center gap-1">
            <NotificationCenter />
            <Link
              to="/pricing"
              aria-label="Upgrade Megsy"
              data-testid="mobile-upgrade"
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-full bg-brand-action text-brand-ink border-[2.5px] border-brand-ink shadow-[2px_2px_0_rgba(59,130,246,0.32)] active:translate-x-[1px] active:translate-y-[1px] transition-all"
            >
              <MegsyStar size={16} static className="text-brand-ink" />
              <span className="text-[12.5px] font-black leading-none whitespace-nowrap">
                Get Plus
              </span>
            </Link>
          </div>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="lg-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="md:hidden fixed inset-0 z-40 bg-black/50"
              onClick={() => {
                if (!isDeleting) close();
              }}
            />

            <motion.div
              key="lg-menu"
              data-testid="mobile-more-menu-content"
              initial={{ opacity: 0, scale: 0.94, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ type: "spring", stiffness: 380, damping: 28, mass: 0.7 }}
              style={{
                top: "calc(env(safe-area-inset-top, 0px) + 52px)",
                transformOrigin: "top right",
              }}
              className="md:hidden fixed right-3 z-50 w-[280px] rounded-ios-lg overflow-hidden bg-card border border-border shadow-[0_22px_48px_-16px_rgba(0,0,0,0.55),0_2px_6px_rgba(0,0,0,0.25)]"
              dir="rtl"
            >
              <AnimatePresence mode="wait" initial={false}>
                {menuView === "main" && (
                  <motion.div
                    key="menu-main"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.14 }}
                    className="py-1"
                  >
                    {items.map(({ icon: Icon, label, onClick }, i) => (
                      <div key={label}>
                        {i !== 0 && <div className="h-px bg-foreground/[0.07] mx-3" />}
                        <button
                          type="button"
                          onClick={onClick}
                          data-testid={`mobile-menu-${label.toLowerCase().replace(/\s+/g, "-")}`}
                          className="w-full flex items-center gap-3 px-4 py-3 transition-colors active:bg-foreground/[0.08] text-foreground"
                        >
                          <span className="flex-1 truncate text-[15px] font-medium text-right">
                            {label}
                          </span>
                          <Icon
                            className="w-[19px] h-[19px] text-foreground shrink-0"
                            strokeWidth={1.8}
                          />
                        </button>
                      </div>
                    ))}
                    <div className="h-px bg-foreground/[0.07] mx-3" />
                    <button
                      type="button"
                      onClick={() => setMenuView("delete")}
                      data-testid="mobile-menu-delete"
                      className="w-full flex items-center gap-3 px-4 py-3 transition-colors active:bg-destructive/10 text-destructive"
                    >
                      <span className="flex-1 truncate text-[15px] font-medium text-right">
                        Delete
                      </span>
                      <Trash2 className="w-[19px] h-[19px] shrink-0" strokeWidth={1.8} />
                    </button>
                  </motion.div>
                )}

                {menuView === "rename" && inlineRename && (
                  <motion.div
                    key="menu-rename"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.14 }}
                    className="p-3"
                  >
                    <BackButton onClick={() => setMenuView("main")} />
                    <div className="px-1 pb-2 text-right text-[14px] font-semibold text-foreground">
                      Rename chat
                    </div>
                    <input
                      autoFocus
                      dir="auto"
                      value={inlineRename.value}
                      onChange={(e) => inlineRename.onChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          inlineRename.onSave();
                          close();
                        }
                      }}
                      className="w-full h-10 rounded-xl bg-foreground/[0.06] border border-foreground/10 px-3 text-[14px] text-foreground outline-none focus:border-foreground/25"
                    />
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => setMenuView("main")}
                        className="flex-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-muted-foreground active:bg-foreground/[0.08]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          inlineRename.onSave();
                          close();
                        }}
                        className="flex-1 rounded-xl px-3 py-2 text-[12px] font-semibold bg-primary text-primary-foreground active:opacity-90"
                      >
                        Save
                      </button>
                    </div>
                  </motion.div>
                )}

                {menuView === "invite" && inlineInvite && (
                  <motion.div
                    key="menu-invite"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.14 }}
                    className="p-3"
                  >
                    <BackButton onClick={() => setMenuView("main")} />
                    <div className="px-1 pb-1 text-right text-[14px] font-semibold text-foreground">
                      Invite people
                    </div>
                    <p className="px-1 pb-2 text-right text-[11px] text-muted-foreground">
                      Add someone to this chat
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        dir="ltr"
                        value={inlineInvite.email}
                        onChange={(e) => inlineInvite.onEmailChange(e.target.value)}
                        placeholder="friend@example.com"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") inlineInvite.onSend();
                        }}
                        className="flex-1 h-9 rounded-xl bg-foreground/[0.06] border border-foreground/10 px-3 text-[13px] text-foreground outline-none focus:border-foreground/25"
                      />
                      <button
                        type="button"
                        onClick={inlineInvite.onSend}
                        disabled={inlineInvite.loading || !inlineInvite.email.trim()}
                        className="h-9 min-w-[72px] px-4 rounded-xl text-[12.5px] font-semibold bg-white text-black shadow-sm active:opacity-90 disabled:opacity-50 inline-flex items-center justify-center whitespace-nowrap shrink-0"
                      >
                        {inlineInvite.loading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          "Invite"
                        )}
                      </button>
                    </div>
                    {inlineInvite.link ? (
                      <button
                        type="button"
                        onClick={inlineInvite.onCopyLink}
                        className="mt-2 w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-foreground/[0.06] active:bg-foreground/[0.10]"
                      >
                        <span className="text-[11px] text-foreground truncate" dir="ltr">
                          {inlineInvite.link}
                        </span>
                        <Copy className="w-3.5 h-3.5 text-foreground shrink-0" />
                      </button>
                    ) : (
                      <p className="mt-2 text-center text-[11px] text-muted-foreground">
                        Generating link…
                      </p>
                    )}
                  </motion.div>
                )}

                {menuView === "share" && inlineShare && (
                  <motion.div
                    key="menu-share"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.14 }}
                    className="p-3"
                  >
                    <BackButton onClick={() => setMenuView("main")} />
                    <div className="px-1 pb-1 text-right text-[14px] font-semibold text-foreground">
                      Share chat
                    </div>
                    <p className="px-1 pb-2 text-right text-[11px] text-muted-foreground">
                      Future messages aren't included
                    </p>
                    <div className="rounded-xl border border-foreground/10 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => inlineShare.onModeChange("private")}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 ${inlineShare.mode === "private" ? "bg-foreground/[0.10]" : "active:bg-foreground/[0.06]"}`}
                      >
                        <Lock className="w-3.5 h-3.5 text-foreground shrink-0" />
                        <div className="text-right flex-1 min-w-0">
                          <p className="text-[12.5px] font-semibold text-foreground">
                            Keep private
                          </p>
                          <p className="text-[10.5px] text-muted-foreground">
                            Only you have access
                          </p>
                        </div>
                      </button>
                      <div className="h-px bg-foreground/10" />
                      <button
                        type="button"
                        onClick={() => inlineShare.onModeChange("public")}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 ${inlineShare.mode === "public" ? "bg-foreground/[0.10]" : "active:bg-foreground/[0.06]"}`}
                      >
                        <Globe className="w-3.5 h-3.5 text-foreground shrink-0" />
                        <div className="text-right flex-1 min-w-0">
                          <p className="text-[12.5px] font-semibold text-foreground">
                            Create public link
                          </p>
                          <p className="text-[10.5px] text-muted-foreground">
                            Anyone with the link can view
                          </p>
                        </div>
                      </button>
                    </div>
                    {inlineShare.mode === "public" && (
                      <div className="mt-3">
                        {inlineShare.url ? (
                          <button
                            type="button"
                            onClick={inlineShare.onCopyLink}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-foreground/[0.06] active:bg-foreground/[0.10]"
                          >
                            <span className="text-[11px] text-foreground truncate" dir="ltr">
                              {inlineShare.url}
                            </span>
                            <Copy className="w-3.5 h-3.5 text-foreground shrink-0" />
                          </button>
                        ) : (
                          <p className="text-center text-[11px] text-muted-foreground py-1">
                            Generating link…
                          </p>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}

                {menuView === "delete" && (
                  <motion.div
                    key="menu-delete"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.14 }}
                    className="p-3"
                  >
                    <BackButton onClick={() => setMenuView("main")} disabled={isDeleting} />
                    <div className="px-1 pb-3 text-right">
                      <div className="text-[14px] font-semibold text-foreground">Delete chat?</div>
                      <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">
                        This conversation will be permanently removed.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMenuView("main")}
                        disabled={isDeleting}
                        className="flex-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-muted-foreground transition-colors active:bg-foreground/[0.08] disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={confirmDelete}
                        disabled={isDeleting}
                        className="flex-1 rounded-xl px-3 py-2 text-[12px] font-semibold bg-destructive text-destructive-foreground transition-opacity active:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Delete
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mb-2 flex items-center gap-1 text-[12px] font-medium text-muted-foreground active:text-foreground disabled:opacity-50"
    >
      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
      Back
    </button>
  );
}
