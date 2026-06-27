/** @doc Create a new custom skill with tools and a base model. */
// New skill — cartoon redesign.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUp } from "lucide-react";
import { motion } from "framer-motion";
import { goBackOr } from "@/lib/navigation";
import {
  INK,
  YELLOW,
  MINT,
  PINK,
  LAVENDER,
  PAGE_BG,
  SURFACE,
  SURFACE_2,
  BORDER,
  TEXT,
  MUTED,
} from "@/pages/billing/ReferralsPage";
import skillsNewSticker from "@/assets/settings/skills-new-sticker.png";

const SUGGESTIONS = [
  { text: "A no-nonsense legal advisor", tone: LAVENDER },
  { text: "A senior code reviewer", tone: MINT },
  { text: "A YC pitch coach", tone: YELLOW },
];

export default function SkillsNewPage() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [value]);

  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 80);
  }, []);

  const start = (text: string) => {
    const t = text.trim();
    if (!t) return;
    navigate("/settings/skills", { state: { seed: t } });
  };

  return (
    <div
      className="relative min-h-[100dvh] overflow-y-auto"
      style={{ backgroundColor: PAGE_BG, color: TEXT }}
    >
      <header
        className="sticky top-0 z-20"
        style={{
          backgroundColor: `${PAGE_BG}E6`,
          backdropFilter: "saturate(160%) blur(18px)",
          WebkitBackdropFilter: "saturate(160%) blur(18px)",
          borderBottom: `1.5px solid ${BORDER}`,
        }}
      >
        <div className="max-w-2xl mx-auto px-5 flex items-center justify-between py-3 safe-top">
          <button
            onClick={() => goBackOr(navigate, "/settings/skills")}
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
            New Skill
          </h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-12 safe-bottom">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div
            className="mt-4 rounded-[28px] p-6 flex flex-col items-center text-center"
            style={{
              backgroundColor: LAVENDER,
              border: `2.5px solid ${INK}`,
              boxShadow: `4px 4px 0 ${INK}`,
            }}
          >
            <img src={skillsNewSticker} alt="" width={140} height={140} loading="lazy" />
            <h2
              className="mt-2 text-[22px]"
              style={{ fontWeight: 900, color: INK, letterSpacing: "-0.02em" }}
            >
              Describe an expert
            </h2>
            <p
              className="mt-1 text-[13px] max-w-[300px]"
              style={{ fontWeight: 700, color: INK, opacity: 0.8 }}
            >
              Tell us the role, tone, and tools — we'll draft the skill in seconds.
            </p>
          </div>

          <div className="mt-4">
            <div
              className="relative rounded-[16px]"
              style={{
                backgroundColor: SURFACE,
                border: `1.5px solid ${INK}`,
                boxShadow: `2px 2px 0 ${INK}`,
              }}
            >
              <textarea
                ref={ref}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    (typeof window === "undefined" || window.innerWidth >= 768)
                  ) {
                    e.preventDefault();
                    start(value);
                  }
                }}
                rows={1}
                placeholder="Describe the expert you want…"
                className="w-full resize-none bg-transparent outline-none text-[15px] leading-relaxed px-5 pt-4 pb-14"
                style={{ color: TEXT, fontWeight: 600 }}
              />
              <button
                onClick={() => start(value)}
                disabled={!value.trim()}
                aria-label="Design skill"
                className="absolute right-3 bottom-3 h-10 w-10 rounded-full grid place-items-center disabled:opacity-30 disabled:cursor-not-allowed active:translate-x-[1px] active:translate-y-[1px] transition"
                style={{
                  background: MINT,
                  color: INK,
                  border: `2px solid ${INK}`,
                  boxShadow: `2px 2px 0 ${INK}`,
                }}
              >
                <ArrowUp className="w-4 h-4" strokeWidth={3} />
              </button>
            </div>
          </div>

          <div className="mt-5">
            <p
              className="text-[11px] uppercase tracking-[0.12em] mb-2 px-1"
              style={{ color: MUTED, fontWeight: 800 }}
            >
              Try one of these
            </p>
            <div className="flex flex-col items-center gap-2">
              <button
                key={SUGGESTIONS[0].text}
                onClick={() => start(SUGGESTIONS[0].text)}
                className="text-[12.5px] px-3 py-1.5 rounded-full active:translate-x-[1px] active:translate-y-[1px] transition"
                style={{
                  background: SUGGESTIONS[0].tone,
                  color: INK,
                  border: `2px solid ${INK}`,
                  fontWeight: 800,
                }}
              >
                {SUGGESTIONS[0].text}
              </button>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.slice(1).map((s) => (
                  <button
                    key={s.text}
                    onClick={() => start(s.text)}
                    className="text-[12.5px] px-3 py-1.5 rounded-full active:translate-x-[1px] active:translate-y-[1px] transition"
                    style={{
                      background: s.tone,
                      color: INK,
                      border: `2px solid ${INK}`,
                      fontWeight: 800,
                    }}
                  >
                    {s.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
