import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import DesktopSidebar from "@/components/layout/DesktopSidebar";


// Aurora Spectrum — per-section accent (HSL triplets so we can compose with hsl() / alpha).
// Chat purple · Images pink · Videos cyan · Megsy-OS green.
function sectionFor(pathname: string): { name: string; hsl: string } {
  if (pathname.startsWith("/media") || pathname.startsWith("/images"))
    return { name: "images", hsl: "338 100% 71%" };
  if (pathname.startsWith("/videos") || pathname.startsWith("/cinema"))
    return { name: "videos", hsl: "187 85% 53%" };
  if (
    pathname.startsWith("/megsy") ||
    pathname.startsWith("/agents") ||
    pathname.startsWith("/workspace")
  )
    return { name: "os", hsl: "158 64% 52%" };
  return { name: "chat", hsl: "252 92% 67%" };
}

interface AppLayoutProps {
  children: React.ReactNode;
  onSelectConversation?: (id: string) => void;
  onNewChat?: () => void;
  activeConversationId?: string | null;
}

const AppLayout = ({
  children,
  onSelectConversation,
  onNewChat,
  activeConversationId,
}: AppLayoutProps) => {
  const { pathname } = useLocation();
  useEffect(() => {
    const s = sectionFor(pathname);
    const root = document.documentElement;
    root.dataset.section = s.name;
    root.style.setProperty("--section-accent", s.hsl);
  }, [pathname]);
  return (
    <div className="flex flex-col h-[100dvh] w-full bg-background">
      <DesktopSidebar
        onSelectConversation={onSelectConversation}
        onNewChat={onNewChat}
        activeConversationId={activeConversationId}
      />
      <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
    </div>
  );
};

export default AppLayout;
