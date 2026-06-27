import { AnimatePresence, motion } from "framer-motion";
import MobileModeBar from "@/components/chat/mobile/MobileModeBar";
import type { ChatMode } from "../chatConstants";
import type { AgentDef } from "@/lib/agentRegistry";

interface ComposerMobileModeBarProps {
  selectedAgent: AgentDef | null;
  chatMode: ChatMode;
  editingIndex: number | null;
  hasMobileServicePanel: boolean;
  renderMobileServicePanel: () => React.ReactNode;
  composerModeBarChange: (m: string) => void;
  forceHidden?: boolean;
}

/** Animated mobile mode-bar rendered above the composer. */
export function ComposerMobileModeBar(props: ComposerMobileModeBarProps) {
  const {
    selectedAgent,
    chatMode,
    editingIndex,
    hasMobileServicePanel,
    renderMobileServicePanel,
    composerModeBarChange,
    forceHidden,
  } = props;

  const showModeBar =
    !forceHidden && (!selectedAgent || selectedAgent.id === "docs") && editingIndex === null;

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {showModeBar && hasMobileServicePanel ? (
        <div key="service-panel">{renderMobileServicePanel()}</div>
      ) : showModeBar ? (
        <motion.div
          key="mobile-mode-bar"
          initial={{ height: 0, opacity: 0, y: 6 }}
          animate={{ height: "auto", opacity: 1, y: 0 }}
          exit={{ height: 0, opacity: 0, y: 6 }}
          transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.7 }}
          className="md:hidden overflow-hidden"
        >
          <MobileModeBar
            mode={selectedAgent?.id === "docs" ? "docs" : (chatMode as any)}
            onChange={composerModeBarChange}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
