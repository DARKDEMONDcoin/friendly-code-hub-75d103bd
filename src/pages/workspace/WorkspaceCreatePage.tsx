/** @doc Create a new shared workspace and invite teammates. */
// New workspace — cartoon redesign full-screen.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Check, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { openWorkspaceCheckout } from "@/lib/workspaceCheckout";
import { isWorkspacePaidPlan, WORKSPACE_PLANS } from "@/lib/workspacePlans";
import { setActiveWorkspaceId } from "@/lib/activeWorkspace";
import { sanitizeErrorMessage } from "@/lib/sanitizeError";
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
import workspaceNewSticker from "@/assets/settings/workspace-new-sticker.png";

type Step = "name" | "plan";

export default function WorkspaceCreatePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [plan, setPlan] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    try {
      const pendingName = sessionStorage.getItem("megsy_pending_workspace_name");
      if (pendingName) setName(pendingName);
    } catch {}
  }, []);

  const create = async (selectedPlan: string | null) => {
    if (!name.trim()) return;
    setSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      navigate("/auth");
      return;
    }
    const { data, error } = await supabase.rpc("create_workspace", {
      p_name: name.trim(),
      p_plan: selectedPlan,
    } as never);
    setSubmitting(false);
    if (error) {
      toast.error(sanitizeErrorMessage(error, "Something went wrong"));
      return;
    }
    await supabase
      .from("profiles")
      .update({ active_workspace_id: (data as any).id } as any)
      .eq("id", user.id);
    setActiveWorkspaceId((data as any).id);
    try {
      sessionStorage.removeItem("megsy_pending_workspace_name");
    } catch {}
    toast.success("Workspace created");
    navigate(`/settings/workspaces/${(data as any).id}`);
  };

  const handleContinueWithPlan = async () => {
    if (!plan) return;
    if (plan === "free") {
      await create(null);
      return;
    }
    if (!isWorkspacePaidPlan(plan)) {
      toast.error("Plan not supported yet");
      return;
    }
    setSubmitting(true);
    try {
      sessionStorage.setItem("megsy_pending_workspace_name", name.trim());
      sessionStorage.setItem("megsy_pending_workspace_plan", plan);
    } catch {}
    const result = await openWorkspaceCheckout(plan, "monthly");
    if (!result.ok) {
      setSubmitting(false);
      if (result.reason === "auth_required") {
        navigate("/auth?redirect=/settings/workspaces/new");
        return;
      }
      toast.error("Could not open checkout page");
      return;
    }
    window.location.href = result.url;
  };

  const planTones = [YELLOW, MINT, PINK, LAVENDER];

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
        <div className="max-w-lg mx-auto px-5 flex items-center justify-between py-3 safe-top">
          <button
            onClick={() => (step === "plan" ? setStep("name") : navigate("/settings/workspaces"))}
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
            {step === "name" ? "New workspace" : "Choose plan"}
          </h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pb-12 safe-bottom">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div
            className="mt-4 rounded-[28px] p-6 flex flex-col items-center text-center"
            style={{
              backgroundColor: MINT,
              border: `2.5px solid ${INK}`,
              boxShadow: `4px 4px 0 ${INK}`,
            }}
          >
            <img src={workspaceNewSticker} alt="" width={130} height={130} loading="lazy" />
            <h2
              className="mt-2 text-[20px]"
              style={{ fontWeight: 900, color: INK, letterSpacing: "-0.02em" }}
            >
              {step === "name" ? "Build your space" : `Plan for ${name}`}
            </h2>
            <p
              className="mt-1 text-[13px] max-w-[280px]"
              style={{ fontWeight: 700, color: INK, opacity: 0.8 }}
            >
              {step === "name"
                ? "A shared home for your team and credits."
                : "You can skip this and pick later."}
            </p>
          </div>

          {step === "name" && (
            <div className="mt-4 space-y-4">
              <div
                className="rounded-[24px] p-5"
                style={{ backgroundColor: SURFACE, border: `1.5px solid ${BORDER}` }}
              >
                <label
                  className="text-[11px] uppercase tracking-[0.12em] mb-2 block"
                  style={{ color: MUTED, fontWeight: 800 }}
                >
                  Workspace name
                </label>
                <input
                  placeholder="Example: Marketing team"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && name.trim() && setStep("plan")}
                  autoFocus
                  className="w-full px-4 py-3 rounded-2xl text-[15px] outline-none"
                  style={{
                    backgroundColor: SURFACE_2,
                    border: `1.5px solid hsl(var(--surface-4))`,
                    color: TEXT,
                    fontWeight: 700,
                  }}
                />
              </div>
              <button
                onClick={() => setStep("plan")}
                disabled={!name.trim()}
                className="w-full h-12 rounded-full text-[14px] active:translate-x-[1px] active:translate-y-[1px] transition disabled:opacity-50"
                style={{
                  background: MINT,
                  color: INK,
                  border: `2.5px solid ${INK}`,
                  fontWeight: 900,
                  boxShadow: `3px 3px 0 ${INK}`,
                }}
              >
                Next
              </button>
            </div>
          )}

          {step === "plan" && (
            <div className="mt-4 space-y-3">
              {WORKSPACE_PLANS.map((p, i) => {
                const selected = plan === p.id;
                const tone = planTones[i % planTones.length];
                return (
                  <button
                    key={p.id}
                    onClick={() => setPlan(p.id)}
                    className="w-full text-left rounded-[20px] p-4 transition active:translate-x-[1px] active:translate-y-[1px]"
                    style={{
                      background: selected ? tone : SURFACE,
                      color: selected ? INK : TEXT,
                      border: `2px solid ${selected ? INK : BORDER}`,
                      boxShadow: selected ? `3px 3px 0 ${INK}` : "none",
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[15px]" style={{ fontWeight: 900 }}>
                          {p.name}
                        </span>
                        <span className="text-[12px]" style={{ opacity: 0.7, fontWeight: 700 }}>
                          {p.monthlyPrice === 0 ? "$0" : `$${p.monthlyPrice}/mo`}
                        </span>
                      </div>
                      {selected && (
                        <span
                          className="w-6 h-6 rounded-full grid place-items-center"
                          style={{ background: INK, color: tone, border: `2px solid ${INK}` }}
                        >
                          <Check className="w-3.5 h-3.5" strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] mb-2" style={{ opacity: 0.8, fontWeight: 600 }}>
                      {p.tagline}
                    </p>
                    {p.creditsLabel && (
                      <p className="text-[12px] mb-2" style={{ opacity: 0.8, fontWeight: 600 }}>
                        {p.creditsLabel}
                      </p>
                    )}
                    <ul
                      className="text-[12px] space-y-0.5"
                      style={{ opacity: 0.85, fontWeight: 600 }}
                    >
                      {p.perks.map((x) => (
                        <li key={x}>• {x}</li>
                      ))}
                    </ul>
                  </button>
                );
              })}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => create(null)}
                  disabled={submitting}
                  className="flex-1 h-12 rounded-full text-[14px] transition disabled:opacity-50"
                  style={{
                    background: SURFACE,
                    color: TEXT,
                    border: `2px solid ${BORDER}`,
                    fontWeight: 800,
                  }}
                >
                  Skip
                </button>
                <button
                  onClick={handleContinueWithPlan}
                  disabled={submitting || !plan}
                  className="flex-1 h-12 rounded-full text-[14px] active:translate-x-[1px] active:translate-y-[1px] transition disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{
                    background: MINT,
                    color: INK,
                    border: `2.5px solid ${INK}`,
                    fontWeight: 900,
                    boxShadow: `3px 3px 0 ${INK}`,
                  }}
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : plan === "free" ? (
                    "Create"
                  ) : (
                    "Pay and continue"
                  )}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
