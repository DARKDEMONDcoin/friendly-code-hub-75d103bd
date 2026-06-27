import { AnimatePresence } from "framer-motion";
import { useState, type ReactNode } from "react";
import ComposerAttachments from "./ComposerAttachments";
import { RemoteAiBusyBanner } from "./RemoteAiBusyBanner";
import { MentionDropdown } from "./MentionDropdown";
import { ComposerMobileModeBar } from "./ComposerMobileModeBar";
import { ComposerAnimatedInput } from "./ComposerAnimatedInput";
import { DesktopModeChips } from "./DesktopModeChips";
import { ActiveServicePill } from "./ActiveServicePill";
import type { AttachedFile } from "../hooks/useAttachments";


interface ChatComposerSectionProps {
  sidebarCollapsed: boolean;
  loadingMessages: boolean;
  messagesLength: number;
  attachedFiles: AttachedFile[];
  removeAttachment: (i: number) => void;
  remoteAiBusy: { name: string } | null;
  plusMenuOpen: boolean;
  renderPlusMenu: () => ReactNode;
  mentionQuery: { q: string } | null;
  members: any[];
  onlineUsers: any;
  colorForUser: (id?: string | null) => any;
  insertMention: (name: string) => void;
  composerMobileModeBarProps: Record<string, any>;
  composerAnimatedInputProps: Record<string, any>;
  navigate: any;
  desktopModeChipsProps: Record<string, any>;
  /** Optional greeting node rendered just above the input on empty desktop state. */
  desktopGreeting?: ReactNode;
}

/**
 * Floating bottom composer dock. Lifts to vertical-center on empty desktop
 * state, otherwise sticks to the bottom. Hosts attachments preview, busy
 * banner, plus-menu overlay, @mention dropdown, mobile mode bar, animated
 * input, desktop integrations strip, and the desktop mode chips row.
 */
export function ChatComposerSection(props: ChatComposerSectionProps) {
  const {
    sidebarCollapsed,
    loadingMessages,
    messagesLength,
    attachedFiles,
    removeAttachment,
    remoteAiBusy,
    plusMenuOpen,
    renderPlusMenu,
    mentionQuery,
    members,
    onlineUsers,
    colorForUser,
    insertMention,
    composerMobileModeBarProps,
    composerAnimatedInputProps,
    navigate,
    desktopModeChipsProps,
    desktopGreeting,
  } = props;

  const isEmpty = messagesLength === 0 && !loadingMessages;
  // Auto-hide modes/templates bar once the user sends a first message. They can
  // bring it back via the toggle on the composer.
  const [userToggled, setUserToggled] = useState(false);
  const [modesShown, setModesShownState] = useState(true);
  const setModesShown = (v: boolean | ((prev: boolean) => boolean)) => {
    setUserToggled(true);
    setModesShownState(v);
  };
  const effectiveModesShown = userToggled ? modesShown : isEmpty;
  const d = desktopModeChipsProps as any;
  const hasActiveService =
    d.selectedAgent?.id === "docs" || (d.chatMode && d.chatMode !== "normal");

  // After the first message we keep a single horizontally-scrollable strip
  // (compact). Before the first message (empty state) the user asked for two
  // explicit rows on desktop: 4 chips on top, 3 chips below, no scroll.
  const chipsRowCompact = hasActiveService ? null : (
    <div
      data-chips-row
      className="hidden md:flex items-center gap-3 px-1 overflow-x-auto flex-nowrap scrollbar-none [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: "none" }}
    >
      <DesktopModeChips {...(desktopModeChipsProps as any)} />
    </div>
  );
  const chipsRowsEmpty = hasActiveService ? null : (
    <div
      data-chips-row
      className="hidden md:flex flex-col items-center gap-3 px-1"
    >
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <DesktopModeChips {...(desktopModeChipsProps as any)} limit={4} />
      </div>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <DesktopModeChips {...(desktopModeChipsProps as any)} offset={4} />
      </div>
    </div>
  );


  return (
    <div
      style={{
        ["--sb-left" as any]: (sidebarCollapsed ? 56 : 260) + "px",
      }}
      className={`fixed left-0 md:left-[var(--sb-left)] right-0 bottom-[var(--kb-offset,0px)] z-30 px-2 md:px-6 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] md:pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 md:pt-6 pointer-events-none transition-[left,top,bottom] duration-200 ease-out bg-transparent ${
        isEmpty
          ? "md:bottom-auto md:top-[calc(50%-40px)] md:-translate-y-1/2 md:bg-transparent md:backdrop-blur-0 md:border-0"
          : "md:bg-transparent md:backdrop-blur-0 md:border-0"
      }`}
    >
      <div className="max-w-3xl mx-auto space-y-2 pointer-events-auto">
        <ComposerAttachments files={attachedFiles} onRemove={removeAttachment} />

        <RemoteAiBusyBanner remoteAiBusy={remoteAiBusy} />

        <div className="relative mx-auto w-full max-w-3xl">
          <div data-tour="composer" className="relative">
            {mentionQuery && (
              <MentionDropdown
                members={members}
                query={mentionQuery.q}
                onlineUsers={onlineUsers}
                colorForUser={colorForUser}
                insertMention={insertMention}
              />
            )}

            <ComposerMobileModeBar
              {...(composerMobileModeBarProps as any)}
              forceHidden={!effectiveModesShown}
            />

            {!isEmpty && effectiveModesShown && chipsRowCompact ? <div className="mb-3">{chipsRowCompact}</div> : null}

            {isEmpty && desktopGreeting ? (
              <div className="hidden md:flex justify-center mb-3">{desktopGreeting}</div>
            ) : null}

            <div className="relative">
              <AnimatePresence>{plusMenuOpen && renderPlusMenu()}</AnimatePresence>
              <ComposerAnimatedInput
              {...(composerAnimatedInputProps as any)}
              modesToggleVisible
              modesShown={effectiveModesShown}
              onToggleModes={() => setModesShown((v) => !v)}
              activeServiceHeader={
                hasActiveService ? (
                  <ActiveServicePill
                    chatMode={d.chatMode}
                    selectedAgent={d.selectedAgent}
                    onClear={() => {
                      if (d.selectedAgent?.id === "docs") {
                        d.setSelectedAgent(null);
                      } else {
                        d.handleModeChange("normal");
                      }
                    }}
                  />
                ) : null
              }
              />
            </div>

          </div>

          {isEmpty && effectiveModesShown && chipsRowsEmpty ? <div className="mt-3">{chipsRowsEmpty}</div> : null}
        </div>
      </div>
    </div>
  );

}
