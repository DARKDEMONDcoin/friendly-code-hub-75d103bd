import { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ArrowLeft, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/layouts/AppLayout";
import { useSettingsShell } from "@/components/settings/SettingsShell";

type NavItem = {
  id: string;
  label: string;
  path: string;
};
type NavGroup = { title: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Account",
    items: [
      { id: "overview", label: "Overview", path: "/settings" },
      { id: "profile", label: "Profile", path: "/settings/profile" },
      { id: "billing", label: "Plan & Billing", path: "/settings/billing" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { id: "workspaces", label: "Workspaces", path: "/settings/workspaces" },
      { id: "integrations", label: "Integrations", path: "/settings/integrations" },
    ],
  },
  {
    title: "AI",
    items: [
      { id: "ai-personalization", label: "Personalization", path: "/settings/ai-personalization" },
      { id: "memory", label: "Memory", path: "/settings/memory" },
      { id: "skills", label: "Skills", path: "/settings/skills" },
    ],
  },
  {
    title: "System",
    items: [
      { id: "customization", label: "Appearance", path: "/settings/customization" },
      { id: "language", label: "Language", path: "/settings/language" },
      { id: "notifications", label: "Notifications", path: "/settings/notifications" },
      { id: "privacy", label: "Privacy & Data", path: "/settings/privacy" },
    ],
  },
  {
    title: "Support",
    items: [{ id: "support", label: "Help Center", path: "/settings/support" }],
  },
];

interface DesktopSettingsLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}

export function DesktopSettingsLayout({
  children,
  title,
  subtitle,
  action,
}: DesktopSettingsLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const shell = useSettingsShell();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const isActive = (path: string) => {
    if (path === "/settings") return location.pathname === "/settings";
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  // When mounted inside the persistent SettingsShell, portal just the inner
  // content (header + body) into the shell's main area so the sidebar/chrome
  // never unmounts between sub-pages.
  if (shell.active && shell.mainEl) {
    return createPortal(
      <>
        <div className="mx-auto max-w-6xl px-10 py-10 xl:px-12">
          <div className="settings-desktop-content pb-24 text-foreground">{children}</div>
        </div>
      </>,
      shell.mainEl,
    );
  }

  return (
    <AppLayout>
      <div
        data-settings-page
        className="settings-desktop-canvas relative h-full w-full overflow-hidden antialiased bg-background text-foreground"
      >
        <div className="pointer-events-none absolute inset-0 settings-desktop-grid" aria-hidden />
        <div className="relative h-full w-full flex">
          <aside className="w-72 shrink-0 flex flex-col border-r border-border/60 bg-card/45 backdrop-blur-xl">
            <div className="px-6 h-20 flex items-center gap-3 border-b border-border/50">
              <button
                onClick={() => navigate("/chat")}
                className="grid h-9 w-9 place-items-center rounded-lg border border-border/70 bg-background text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Back to chat"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <p className="text-[14px] leading-none font-semibold truncate text-foreground">Settings</p>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
              {NAV_GROUPS.map((group) => (
                <div key={group.title}>
                  <p className="mb-2 px-3 text-[10px] font-semibold uppercase text-muted-foreground/70">
                    {group.title}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const active = isActive(item.path);
                      return (
                        <button
                          key={item.id}
                          onClick={() => navigate(item.path)}
                          className={cn(
                            "relative w-full h-10 rounded-lg px-3 flex items-center justify-between text-left text-[13px] transition-colors border",
                            active
                              ? "border-border bg-background text-foreground font-semibold shadow-sm"
                              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-background/70 font-medium",
                          )}
                        >
                          <span className="truncate">{item.label}</span>
                          {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {/* Sign out */}
            <div className="px-4 py-4 border-t border-border/50">
              <button
                onClick={handleLogout}
                className="w-full h-10 rounded-lg border border-border/60 bg-background/60 px-3 flex items-center gap-2 text-[13px] font-medium text-muted-foreground hover:text-destructive transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          </aside>

          {/* Main */}
          <main className="flex-1 overflow-y-auto bg-background/70">
            <div className="mx-auto max-w-6xl px-10 py-10 xl:px-12">
              <div className="settings-desktop-content pb-24 text-foreground">{children}</div>
            </div>
          </main>
        </div>
      </div>
    </AppLayout>
  );
}

function SettingsHeader({
  title,
  subtitle,
  action,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  if (!title && !subtitle && !action) return null;
  return (
    <div className="border-b border-border/50 bg-card/25 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-10 py-8 xl:px-12 flex items-start justify-between gap-6">
        <div className="min-w-0">
          {title && (
            <h1 className="text-[30px] leading-tight font-semibold text-foreground">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="mt-2 text-[14px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

export default DesktopSettingsLayout;
