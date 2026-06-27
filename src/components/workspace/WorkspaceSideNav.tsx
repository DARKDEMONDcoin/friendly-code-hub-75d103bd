// Workspace side nav — Cartoon / neo-brutalist.
import { NavLink, useParams } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Mail,
  Activity,
  CreditCard,
  BarChart3,
  Settings2,
  Palette,
  Bell,
  ShieldCheck,
  Database,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import {
  INK,
  SURFACE,
  SURFACE_2,
  BORDER,
  TEXT,
  YELLOW,
  PINK,
  MINT,
  LAVENDER,
  PEACH,
} from "@/pages/billing/ReferralsPage";

type Item = { to: string; label: string; icon: LucideIcon; color?: string };
const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Workspace",
    items: [
      { to: "", label: "Overview", icon: LayoutDashboard, color: YELLOW },
      { to: "members", label: "Members", icon: Users, color: MINT },
      { to: "invites", label: "Invites", icon: Mail, color: PINK },
      { to: "activity", label: "Activity", icon: Activity, color: LAVENDER },
    ],
  },
  {
    title: "Billing",
    items: [
      { to: "billing", label: "Billing", icon: CreditCard, color: MINT },
      { to: "usage", label: "Usage", icon: BarChart3, color: YELLOW },
    ],
  },
  {
    title: "Settings",
    items: [
      { to: "general", label: "General", icon: Settings2, color: PEACH },
      { to: "brand", label: "Brand kit", icon: Palette, color: PINK },
      { to: "notifications", label: "Notifications", icon: Bell, color: YELLOW },
      { to: "security", label: "Security", icon: ShieldCheck, color: MINT },
      { to: "data", label: "Data & privacy", icon: Database, color: LAVENDER },
      { to: "danger", label: "Danger zone", icon: AlertTriangle, color: "#FF6B6B" },
    ],
  },
];

export default function WorkspaceSideNav() {
  const { id } = useParams<{ id: string }>();
  const base = `/settings/workspaces/${id}`;
  return (
    <nav className="space-y-5">
      {SECTIONS.map((sec) => (
        <div key={sec.title}>
          <h4
            className="text-[10.5px] uppercase tracking-[0.12em] mb-2 px-2"
            style={{ fontWeight: 900, color: TEXT, opacity: 0.5 }}
          >
            {sec.title}
          </h4>
          <div
            className="rounded-2xl p-1.5"
            style={{
              backgroundColor: SURFACE,
              border: `2px solid ${INK}`,
              boxShadow: `3px 3px 0 ${INK}`,
            }}
          >
            {sec.items.map((it) => {
              const path = it.to ? `${base}/${it.to}` : base;
              const Icon = it.icon;
              const isDanger = it.to === "danger";
              const accent = it.color || YELLOW;
              return (
                <NavLink
                  key={it.label}
                  to={path}
                  end={!it.to}
                  className={({ isActive }) =>
                    `group flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13.5px] transition-all my-0.5 ${
                      isActive ? "" : "hover:translate-x-[1px]"
                    }`
                  }
                  style={({ isActive }) =>
                    isActive
                      ? {
                          backgroundColor: accent,
                          color: INK,
                          fontWeight: 900,
                          border: `1.5px solid ${INK}`,
                        }
                      : {
                          color: isDanger ? "#FF6B6B" : TEXT,
                          fontWeight: 700,
                          border: "1.5px solid transparent",
                        }
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className="grid place-items-center w-7 h-7 rounded-lg shrink-0"
                        style={{
                          backgroundColor: isActive ? INK : SURFACE_2,
                          color: isActive ? accent : isDanger ? "#FF6B6B" : TEXT,
                          border: isActive ? "none" : `1px solid ${BORDER}`,
                        }}
                      >
                        <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
                      </span>
                      <span className="truncate">{it.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
