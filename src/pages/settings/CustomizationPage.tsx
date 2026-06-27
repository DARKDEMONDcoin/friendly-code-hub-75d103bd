/** @doc Customize accent color and chat appearance. */
import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ArrowLeft, Moon } from "lucide-react";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopSettingsLayout } from "@/components/settings/DesktopSettingsLayout";
import { CleanCard } from "@/components/settings/CleanSettings";
import { goBackOr } from "@/lib/navigation";

const accentColors = [
  { hsl: "262 60% 55%", hex: "#7c5cfc" },
  { hsl: "210 80% 55%", hex: "#3b82f6" },
  { hsl: "142 50% 50%", hex: "#22c55e" },
  { hsl: "330 70% 55%", hex: "#ec4899" },
  { hsl: "25 90% 55%", hex: "#f97316" },
  { hsl: "160 60% 45%", hex: "#14b8a6" },
  { hsl: "0 70% 55%", hex: "#ef4444" },
  { hsl: "270 60% 55%", hex: "#8b5cf6" },
  { hsl: "180 60% 45%", hex: "#06b6d4" },
  { hsl: "45 90% 50%", hex: "#eab308" },
  { hsl: "150 60% 40%", hex: "#10b981" },
  { hsl: "340 80% 55%", hex: "#f43f5e" },
  { hsl: "230 70% 60%", hex: "#5b6cf5" },
  { hsl: "290 65% 60%", hex: "#c855f0" },
  { hsl: "12 85% 58%", hex: "#f56042" },
  { hsl: "195 85% 50%", hex: "#0ea5e9" },
  { hsl: "85 60% 45%", hex: "#84cc16" },
  { hsl: "320 75% 60%", hex: "#e84cc4" },
];

const CustomizationPage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [currentAccent, setCurrentAccent] = useState(
    () => localStorage.getItem("accent") || "262 60% 55%",
  );

  // Lock the theme to the current dark experience.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
    if (localStorage.getItem("theme") !== "dark") {
      localStorage.setItem("theme", "dark");
      window.dispatchEvent(new Event("themechange-custom"));
    }
  }, []);

  const handleAccentChange = useCallback((hsl: string) => {
    document.documentElement.style.setProperty("--primary", hsl);
    document.documentElement.style.setProperty("--user-bubble", `hsl(${hsl})`);
    localStorage.setItem("accent", hsl);
    localStorage.setItem("userBubbleColor", `hsl(${hsl})`);
    setCurrentAccent(hsl);
  }, []);

  const currentHex =
    accentColors.find((c) => c.hsl === currentAccent)?.hex || "#7c5cfc";

  const activeIndicator = (
    <div className="flex items-center gap-3">
      <span
        className="w-8 h-8 rounded-full border border-border"
        style={{ background: currentHex }}
      />
      <div className="text-right">
        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
          Active
        </p>
        <p className="text-[12.5px] font-mono text-foreground">{currentHex}</p>
      </div>
    </div>
  );

  const body = (
    <div className="space-y-6">
      {/* Preview */}
      <CleanCard
        title="Preview"
        description="How your conversations will look with this accent."
      >
        <div className="rounded-xl border border-border/60 bg-background/60 p-5 space-y-3">
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm px-4 py-2.5 bg-card border border-border max-w-[70%]">
              <p className="text-[13px] text-foreground">What should we ship next?</p>
            </div>
          </div>
          <div className="flex justify-end">
            <div
              className="rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[70%] shadow-sm"
              style={{ background: `hsl(${currentAccent})` }}
            >
              <p className="text-primary-foreground text-[13px]">
                Let's redesign the settings — make every page feel intentional.
              </p>
            </div>
          </div>
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm px-4 py-2.5 bg-card border border-border max-w-[70%]">
              <p className="text-[13px] text-foreground">On it. ✨</p>
            </div>
          </div>
        </div>
      </CleanCard>

      {/* Accent color */}
      <CleanCard
        title="Accent color"
        description="Flows through chat bubbles, links and primary actions."
        action={activeIndicator}
      >
        <div className="grid grid-cols-6 sm:grid-cols-9 gap-2">
          {accentColors.map((c) => {
            const isSelected = currentAccent === c.hsl;
            return (
              <button
                key={c.hex}
                onClick={() => handleAccentChange(c.hsl)}
                className="group relative aspect-square rounded-lg border border-border/60 hover:border-foreground/40 transition-all overflow-hidden"
                style={{ background: c.hex }}
                aria-label={c.hex}
              >
                {isSelected && (
                  <span className="absolute inset-0 grid place-items-center bg-black/25">
                    <Check className="w-4 h-4 text-white drop-shadow" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </CleanCard>

      {/* Theme */}
      <CleanCard title="Theme" description="Choose how Megsy looks.">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
              <Moon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-foreground">Dark mode</p>
              <p className="text-[12.5px] text-muted-foreground">
                Light mode is planned for a future release.
              </p>
            </div>
          </div>
          <span className="text-[12px] font-medium text-muted-foreground">Locked</span>
        </div>
      </CleanCard>
    </div>
  );

  if (!isMobile) {
    return (
      <DesktopSettingsLayout
        title="Appearance"
        subtitle="Personalize the look of your conversations."
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="max-w-2xl mx-auto py-4"
        >
          {body}
        </motion.div>
      </DesktopSettingsLayout>
    );
  }

  return (
    <div className="relative min-h-[100dvh] overflow-y-auto bg-background text-foreground pb-16">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border/60">
        <div className="max-w-lg mx-auto px-4 flex items-center justify-between py-3 safe-top">
          <button
            onClick={() => goBackOr(navigate, "/settings")}
            className="grid h-10 w-10 place-items-center rounded-full border border-border/60 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-[17px] font-semibold tracking-tight">Appearance</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 safe-bottom">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="mb-5">
            <h2 className="text-[22px] font-semibold tracking-tight">Appearance</h2>
            <p className="text-[12.5px] text-muted-foreground mt-1">
              Personalize the look of your conversations.
            </p>
          </div>
          {body}
        </motion.div>
      </main>
    </div>
  );
};

export default CustomizationPage;
