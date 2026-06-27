/** @doc List of all workspaces you belong to. */
// Workspaces list — cartoon/neo-brutalist mobile style; Geist look preserved on desktop.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Lock, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaces } from "@/hooks/useWorkspace";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopSettingsLayout } from "@/components/settings/DesktopSettingsLayout";
import { useUserPlan } from "@/hooks/useUserPlan";
import { CartoonPage, CartoonHero, CartoonCard } from "@/components/settings/CartoonSettingsShell";
import {
  INK,
  YELLOW,
  LAVENDER,
  PINK,
  MINT,
  PEACH,
  SURFACE,
  BORDER,
  TEXT,
  MUTED,
  PAGE_BG,
} from "@/pages/billing/ReferralsPage";
import workspacesSticker from "@/assets/settings/workspaces-sticker.png";

const PRO_PLANS = new Set(["pro", "elite", "business", "enterprise"]);
const TONES = [PINK, MINT, PEACH, LAVENDER, YELLOW];

export default function WorkspacesPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { workspaces, activeId, setActive, loading } = useWorkspaces();
  const { plan } = useUserPlan();
  const canCreate = PRO_PLANS.has(plan);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!workspaces.length) return;
    (async () => {
      const ids = workspaces.map((w) => w.id);
      const { data } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .in("workspace_id", ids);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        counts[r.workspace_id] = (counts[r.workspace_id] ?? 0) + 1;
      });
      setMemberCounts(counts);
    })();
  }, [workspaces]);

  const switchTo = async (id: string | null, name: string) => {
    await setActive(id);
    toast.success(`Switched to ${name}`);
  };

  const totalCredits = workspaces.reduce((sum, w) => sum + Number(w.credits ?? 0), 0);

  // ===== Desktop (unchanged Geist style) =====
  if (!isMobile) {
    const body = (
      <div className="space-y-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Workspaces</h2>
          <p className="text-[12px] text-muted-foreground">
            {workspaces.length + 1} spaces · {totalCredits.toFixed(0)} credits
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
          <DesktopRow
            name="Personal"
            subtitle="Your private space"
            monogram="P"
            active={activeId === null}
            onSwitch={() => switchTo(null, "Personal")}
            onOpen={null}
          />
          {loading ? (
            <div className="px-4 py-6 grid place-items-center">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            workspaces.map((w) => (
              <DesktopRow
                key={w.id}
                name={w.name}
                subtitle={`${memberCounts[w.id] ?? 1} member${(memberCounts[w.id] ?? 1) === 1 ? "" : "s"} · Team`}
                monogram={w.name[0]?.toUpperCase() ?? "W"}
                avatarUrl={w.avatar_url}
                active={activeId === w.id}
                credits={Number(w.credits)}
                onSwitch={() => switchTo(w.id, w.name)}
                onOpen={() => navigate(`/settings/workspaces/${w.id}`)}
              />
            ))
          )}
        </div>
        {canCreate ? (
          <button
            onClick={() => navigate("/settings/workspaces/new")}
            className="group w-full rounded-lg border border-dashed border-border px-4 py-3.5 flex items-center gap-3 hover:border-foreground/40 hover:bg-foreground/[0.02] transition-colors text-left"
          >
            <Plus className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-[13.5px] font-medium text-foreground">Create workspace</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">Invite teammates and share credits.</p>
            </div>
          </button>
        ) : (
          <button
            onClick={() => navigate("/pricing")}
            className="group w-full rounded-lg border border-border bg-card px-4 py-3.5 flex items-center gap-3 hover:border-foreground/40 transition-colors text-left"
          >
            <Lock className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[13.5px] font-medium text-foreground">Create workspace</p>
                <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-px rounded border border-border text-muted-foreground">
                  Pro
                </span>
              </div>
              <p className="text-[12px] text-muted-foreground mt-0.5">Upgrade your plan to unlock team workspaces.</p>
            </div>
          </button>
        )}
      </div>
    );
    return (
      <DesktopSettingsLayout title="Workspaces" subtitle="Switch between personal and team spaces.">
        <div className="max-w-2xl mx-auto py-4">{body}</div>
      </DesktopSettingsLayout>
    );
  }

  // ===== Mobile cartoon =====
  const allRows = [
    {
      id: null as string | null,
      name: "Personal",
      subtitle: "Your private space",
      credits: null as number | null,
      members: 1,
      avatar: null as string | null,
    },
    ...workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      subtitle: `${memberCounts[w.id] ?? 1} member${(memberCounts[w.id] ?? 1) === 1 ? "" : "s"} · Team`,
      credits: Number(w.credits),
      members: memberCounts[w.id] ?? 1,
      avatar: w.avatar_url,
    })),
  ];

  return (
    <CartoonPage title="Workspaces">
      <CartoonHero
        sticker={workspacesSticker}
        bg={LAVENDER}
        title="Your spaces"
        subtitle={
          workspaces.length > 0
            ? `${workspaces.length + 1} spaces · ${totalCredits.toFixed(0)} team MC`
            : "Switch between personal and team."
        }
      />

      {/* Rows */}
      <div className="mt-3 space-y-2.5">
        {loading && allRows.length === 1 ? (
          <CartoonCard>
            <div className="grid place-items-center py-4">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: MUTED }} />
            </div>
          </CartoonCard>
        ) : (
          allRows.map((r, i) => {
            const isActive = activeId === r.id;
            const tone = r.id === null ? YELLOW : TONES[i % TONES.length];
            return (
              <div
                key={r.id ?? "personal"}
                className="rounded-[22px] p-4 flex items-center gap-3"
                style={{
                  backgroundColor: isActive ? tone : SURFACE,
                  border: `${isActive ? "2.5px" : "1.5px"} solid ${isActive ? INK : BORDER}`,
                  boxShadow: isActive ? `4px 4px 0 ${INK}` : undefined,
                }}
              >
                <div
                  className="shrink-0 w-12 h-12 rounded-2xl overflow-hidden grid place-items-center"
                  style={{
                    backgroundColor: isActive ? INK : tone,
                    border: `2px solid ${INK}`,
                    color: isActive ? tone : INK,
                    fontWeight: 900,
                    fontSize: 18,
                  }}
                >
                  {r.avatar ? (
                    <img src={r.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (r.name[0]?.toUpperCase() ?? "W")
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p
                      className="text-[15px] truncate"
                      style={{
                        fontWeight: 900,
                        color: isActive ? INK : TEXT,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {r.name}
                    </p>
                    {isActive && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[9.5px] uppercase tracking-wider"
                        style={{ backgroundColor: INK, color: tone, fontWeight: 900 }}
                      >
                        Active
                      </span>
                    )}
                  </div>
                  <p
                    className="text-[12px] truncate mt-0.5"
                    style={{
                      fontWeight: 700,
                      color: isActive ? INK : MUTED,
                      opacity: isActive ? 0.75 : 1,
                    }}
                  >
                    {r.subtitle}
                  </p>
                  {r.credits !== null && (
                    <p
                      className="text-[11px] mt-1 tabular-nums"
                      style={{
                        fontWeight: 800,
                        color: isActive ? INK : r.credits < 50 ? "#FF6B6B" : MUTED,
                      }}
                    >
                      {r.credits.toFixed(0)} MC
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {!isActive && (
                    <button
                      onClick={() => switchTo(r.id, r.name)}
                      className="rounded-full px-3 py-1.5 text-[11.5px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition"
                      style={{
                        backgroundColor: INK,
                        color: "hsl(var(--brand-parchment))",
                        fontWeight: 800,
                        border: `2px solid ${INK}`,
                      }}
                    >
                      Switch
                    </button>
                  )}
                  {r.id && (
                    <button
                      onClick={() => navigate(`/settings/workspaces/${r.id}`)}
                      className="rounded-full px-3 py-1.5 text-[11.5px]"
                      style={{
                        backgroundColor: isActive ? INK : "transparent",
                        color: isActive ? tone : TEXT,
                        fontWeight: 700,
                        border: `1.5px solid ${isActive ? INK : BORDER}`,
                      }}
                    >
                      Manage
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create CTA */}
      {canCreate ? (
        <button
          onClick={() => navigate("/settings/workspaces/new")}
          className="mt-4 w-full rounded-[22px] p-4 flex items-center gap-3 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition"
          style={{
            backgroundColor: MINT,
            border: `2.5px solid ${INK}`,
            boxShadow: `4px 4px 0 ${INK}`,
          }}
        >
          <span
            className="grid h-10 w-10 place-items-center rounded-xl shrink-0"
            style={{ backgroundColor: INK, color: MINT }}
          >
            <Plus className="w-5 h-5" strokeWidth={3} />
          </span>
          <div className="flex-1 text-left">
            <p
              className="text-[14.5px]"
              style={{ fontWeight: 900, color: INK, letterSpacing: "-0.01em" }}
            >
              Create workspace
            </p>
            <p
              className="text-[12px] mt-0.5"
              style={{ fontWeight: 700, color: INK, opacity: 0.75 }}
            >
              Invite teammates and share credits.
            </p>
          </div>
        </button>
      ) : (
        <button
          onClick={() => navigate("/pricing")}
          className="mt-4 w-full rounded-[22px] p-4 flex items-center gap-3"
          style={{ backgroundColor: SURFACE, border: `1.5px solid ${BORDER}` }}
        >
          <span
            className="grid h-10 w-10 place-items-center rounded-xl shrink-0"
            style={{ backgroundColor: YELLOW, color: INK, border: `2px solid ${INK}` }}
          >
            <Lock className="w-4 h-4" strokeWidth={3} />
          </span>
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2">
              <p className="text-[14px]" style={{ fontWeight: 800, color: TEXT }}>
                Create workspace
              </p>
              <span
                className="rounded-full px-2 py-0.5 text-[9.5px] uppercase tracking-wider"
                style={{
                  backgroundColor: YELLOW,
                  color: INK,
                  fontWeight: 900,
                  border: `1.5px solid ${INK}`,
                }}
              >
                Pro
              </span>
            </div>
            <p className="text-[11.5px] mt-0.5" style={{ color: MUTED, fontWeight: 600 }}>
              Upgrade your plan to unlock team workspaces.
            </p>
          </div>
        </button>
      )}
    </CartoonPage>
  );
}

function DesktopRow({
  name,
  subtitle,
  monogram,
  avatarUrl,
  active,
  credits,
  onSwitch,
  onOpen,
}: {
  name: string;
  subtitle: string;
  monogram: string;
  avatarUrl?: string | null;
  active: boolean;
  credits?: number;
  onSwitch: () => void;
  onOpen: (() => void) | null;
}) {
  return (
    <div className="group flex items-center gap-3 px-4 py-3.5 hover:bg-foreground/[0.02] transition-colors">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="w-9 h-9 rounded-md object-cover ring-1 ring-border shrink-0"
        />
      ) : (
        <div className="w-9 h-9 rounded-md bg-muted text-foreground grid place-items-center text-[13px] font-semibold shrink-0">
          {monogram}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-medium text-foreground truncate">{name}</p>
          {active && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Active
            </span>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground truncate mt-0.5">{subtitle}</p>
      </div>
      {typeof credits === "number" && (
        <span
          className={`hidden sm:block text-[12px] tabular-nums mr-2 ${credits < 50 ? "text-destructive" : "text-muted-foreground"}`}
        >
          {credits.toFixed(0)} cr
        </span>
      )}
      <div className="flex items-center gap-1.5 shrink-0">
        {onOpen && (
          <button
            onClick={onOpen}
            className="text-[12px] font-medium px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
          >
            Manage
          </button>
        )}
        {!active && (
          <button
            onClick={onSwitch}
            className="text-[12px] font-medium px-3 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            Switch
          </button>
        )}
      </div>
    </div>
  );
}
