/** @doc Workspace home — members, billing, brand, integrations, danger zone. */
// Workspace detail layout — Cartoon / neo-brutalist shell.
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { ArrowLeft, Loader2, Menu, Plus, AlertTriangle, X } from "lucide-react";
import { useWorkspaceContext } from "@/hooks/useWorkspaceContext";
import WorkspaceSideNav from "@/components/workspace/WorkspaceSideNav";
import PresenceBar from "@/components/workspace/PresenceBar";
import {
  INK,
  SURFACE,
  SURFACE_2,
  BORDER,
  TEXT,
  PAGE_BG,
  YELLOW,
  MINT,
} from "@/pages/billing/ReferralsPage";

export default function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ctx = useWorkspaceContext(id);
  const [navOpen, setNavOpen] = useState(false);

  if (ctx.loading || !ctx.ws) {
    return (
      <div className="min-h-dvh grid place-items-center" style={{ backgroundColor: PAGE_BG }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: TEXT }} />
      </div>
    );
  }

  const credits = Number(ctx.ws.credits ?? 0);
  const lowCredits = credits < 50;

  return (
    <div className="min-h-dvh" style={{ backgroundColor: PAGE_BG, color: TEXT }}>
      <header
        className="sticky top-0 z-30"
        style={{
          backgroundColor: `${PAGE_BG}EE`,
          backdropFilter: "saturate(160%) blur(18px)",
          WebkitBackdropFilter: "saturate(160%) blur(18px)",
          borderBottom: `2px solid ${INK}`,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3 safe-top">
          <button
            onClick={() => navigate("/settings/workspaces")}
            className="grid h-10 w-10 place-items-center rounded-full active:translate-x-[1px] active:translate-y-[1px] transition shrink-0"
            style={{
              backgroundColor: SURFACE,
              border: `2px solid ${BORDER}`,
              color: TEXT,
              boxShadow: `2px 2px 0 ${INK}`,
            }}
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
          </button>

          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {(ctx.ws as any).avatar_url ? (
              <img
                src={(ctx.ws as any).avatar_url}
                alt=""
                className="w-10 h-10 rounded-xl object-cover shrink-0"
                style={{ border: `2px solid ${INK}`, boxShadow: `2px 2px 0 ${INK}` }}
              />
            ) : (
              <div
                className="w-10 h-10 rounded-xl grid place-items-center text-sm shrink-0"
                style={{
                  backgroundColor: YELLOW,
                  color: INK,
                  border: `2px solid ${INK}`,
                  boxShadow: `2px 2px 0 ${INK}`,
                  fontWeight: 900,
                }}
              >
                {ctx.ws.name[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex items-center gap-2">
              <h1
                className="text-[15px] truncate"
                style={{ fontWeight: 900, letterSpacing: "-0.02em", color: TEXT }}
              >
                {ctx.ws.name}
              </h1>
              <span
                className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{ backgroundColor: SURFACE_2, border: `1.5px solid ${BORDER}` }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: MINT }} />
                <span
                  className="text-[10px] uppercase tracking-wider"
                  style={{ fontWeight: 800, color: TEXT }}
                >
                  {ctx.myRole || "member"}
                </span>
              </span>
            </div>
          </div>

          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[12px] tabular-nums"
            style={{
              backgroundColor: lowCredits ? "#FF6B6B22" : SURFACE_2,
              border: `1.5px solid ${lowCredits ? "#FF6B6B" : BORDER}`,
              color: lowCredits ? "#FF6B6B" : TEXT,
              fontWeight: 800,
            }}
          >
            {credits.toFixed(0)}
            <span style={{ opacity: 0.6 }}>cr</span>
            {lowCredits && <AlertTriangle className="w-3 h-3" />}
          </div>

          {ctx.canBilling && (
            <button
              onClick={() => navigate(`/settings/workspaces/${ctx.ws!.id}/billing`)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] active:translate-x-[1px] active:translate-y-[1px] transition"
              style={{
                backgroundColor: MINT,
                color: INK,
                border: `2px solid ${INK}`,
                boxShadow: `2px 2px 0 ${INK}`,
                fontWeight: 900,
              }}
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={3} /> Top up
            </button>
          )}

          <PresenceBar workspaceId={ctx.ws.id} />

          <button
            onClick={() => setNavOpen((v) => !v)}
            className="md:hidden grid h-10 w-10 place-items-center rounded-full active:translate-x-[1px] active:translate-y-[1px] transition"
            style={{ backgroundColor: SURFACE, border: `2px solid ${BORDER}`, color: TEXT }}
            aria-label="Menu"
          >
            {navOpen ? (
              <X className="w-5 h-5" strokeWidth={2.5} />
            ) : (
              <Menu className="w-5 h-5" strokeWidth={2.5} />
            )}
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-10 grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 md:gap-10 animate-fade-in">
        <aside className={`${navOpen ? "block" : "hidden"} md:block`}>
          <div onClick={() => setNavOpen(false)} className="md:sticky md:top-24">
            <WorkspaceSideNav />
          </div>
        </aside>
        <main className="min-w-0 max-w-3xl">
          <Outlet
            context={{
              ws: ctx.ws,
              me: ctx.me,
              myRole: ctx.myRole,
              isOwner: ctx.isOwner,
              isAdmin: ctx.isAdmin,
              canBilling: ctx.canBilling,
            }}
          />
        </main>
      </div>
    </div>
  );
}
