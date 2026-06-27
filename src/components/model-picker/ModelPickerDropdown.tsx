import { motion } from "framer-motion";
import type { AgentModel } from "@/lib/agentRegistry";

interface ModelPickerDropdownProps {
  models: AgentModel[];
  query: string;
  onSelect: (model: AgentModel) => void;
  onClose: () => void;
}

const ModelPickerDropdown = ({ models, query, onSelect, onClose }: ModelPickerDropdownProps) => {
  const filtered = query
    ? models.filter(
        (m) =>
          m.label.toLowerCase().includes(query.toLowerCase()) ||
          m.id.toLowerCase().includes(query.toLowerCase()),
      )
    : models;

  if (filtered.length === 0) return null;

  return (
    <>
      <div className="fixed inset-0 z-[44]" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        className="absolute bottom-full mb-2 left-0 z-[46] w-[min(20rem,calc(100vw-1rem))] rounded-[22px] border-[2.5px] border-brand-ink bg-surface-1 p-2 shadow-[4px_4px_0_rgba(59,130,246,0.22)] max-h-[min(320px,58dvh)] overflow-y-auto"
      >
        <p className="text-[10px] text-brand-muted font-black uppercase px-3 py-1.5 select-none tracking-wider">
          Models
        </p>
        {filtered.map((model) => (
          <button
            key={model.id}
            onClick={() => onSelect(model)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left bg-surface-3 hover:bg-[#242424] border-2 border-surface-4 mb-1 last:mb-0 active:translate-x-[2px] active:translate-y-[2px] transition-all"
          >
            <span className="text-sm font-black text-brand-parchment">{model.label}</span>
            <span className="text-[11px] font-black text-brand-ink bg-brand-mint border border-brand-ink px-2 py-0.5 rounded-full">
              {model.cost} MC
            </span>
          </button>
        ))}
      </motion.div>
    </>
  );
};

export default ModelPickerDropdown;
