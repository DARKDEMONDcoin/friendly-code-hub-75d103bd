import type { NavigateFunction } from "react-router-dom";
import { Plus } from "lucide-react";
import {
  SiGmail,
  SiGoogledrive,
  SiGooglecalendar,
  SiSlack,
  SiNotion,
  SiGithub,
} from "@/components/icons/BrandIcons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface DesktopIntegrationsStripProps {
  navigate: NavigateFunction;
}

const integrations = [
  { name: "Gmail", Icon: SiGmail, color: "#EA4335", desc: "Draft, summarize & search your inbox" },
  {
    name: "Google Drive",
    Icon: SiGoogledrive,
    color: "#FBBC04",
    desc: "Search, read & upload files instantly",
  },
  {
    name: "Google Calendar",
    Icon: SiGooglecalendar,
    color: "#4285F4",
    desc: "Manage your schedule effortlessly",
  },
  { name: "Slack", Icon: SiSlack, color: "#E01E5A", desc: "Send messages & fetch Slack data" },
  { name: "Notion", Icon: SiNotion, color: "#ffffff", desc: "Search, update & power workflows" },
  { name: "GitHub", Icon: SiGithub, color: "#ffffff", desc: "Browse repos, issues & PRs" },
];

const IntegrationsList = ({ navigate }: { navigate: NavigateFunction }) => (
  <>
    <div className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-foreground/50 font-semibold">
      Integrations
    </div>
    {integrations.map(({ name, Icon, color, desc }) => (
      <DropdownMenuItem
        key={name}
        onClick={() => navigate("/settings/integrations")}
        className="gap-3 py-2 px-2 rounded-md cursor-pointer focus:bg-white/10"
      >
        <span
          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 border"
          style={{ backgroundColor: "#141414", borderColor: "rgba(255,255,255,0.08)" }}
        >
          <Icon size={16} color={color} />
        </span>
        <span className="flex flex-col min-w-0">
          <span className="text-[13px] font-semibold text-foreground truncate">{name}</span>
          <span className="text-[11px] text-foreground/55 truncate">{desc}</span>
        </span>
      </DropdownMenuItem>
    ))}
    <DropdownMenuSeparator style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
    <DropdownMenuItem
      onClick={() => navigate("/settings/integrations")}
      className="justify-center py-2 text-[12px] font-semibold text-foreground/80 cursor-pointer focus:bg-white/10"
    >
      Browse all integrations
    </DropdownMenuItem>
  </>
);

export const DesktopIntegrationsStrip = ({ navigate }: DesktopIntegrationsStripProps) => {
  return (
    <div
      className="hidden md:flex items-center gap-2 px-3 py-2 border border-t-0"
      style={{
        backgroundColor: "#000000",
        borderColor: "rgba(255,255,255,0.08)",
        borderTop: "1px solid rgba(255,255,255,0.04)",
        borderBottomLeftRadius: "20px",
        borderBottomRightRadius: "20px",
        marginTop: "-14px",
        paddingTop: "20px",
        position: "relative",
        zIndex: 0,
      }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center hover:opacity-90 transition-opacity"
            aria-label="View integrations"
          >
            {integrations.map(({ name, Icon, color }, i) => (
              <span
                key={name}
                title={name}
                className="w-6 h-6 rounded-full flex items-center justify-center border"
                style={{
                  backgroundColor: "#0a0a0a",
                  borderColor: "rgba(255,255,255,0.12)",
                  marginLeft: i === 0 ? 0 : -8,
                  zIndex: 10 - i,
                }}
              >
                <Icon size={11} color={color} />
              </span>
            ))}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="top"
          sideOffset={10}
          className="w-[320px] p-2 border"
          style={{ backgroundColor: "#0a0a0a", borderColor: "rgba(255,255,255,0.08)" }}
        >
          <IntegrationsList navigate={navigate} />
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full transition-colors text-[11.5px] font-semibold bg-slate-50 text-zinc-950 hover:bg-white"
            aria-label="Open integrations directory"
          >
            <Plus className="w-3 h-3" strokeWidth={3} />
            Connect
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="top"
          sideOffset={10}
          className="w-[260px] p-2 border"
          style={{ backgroundColor: "#0a0a0a", borderColor: "rgba(255,255,255,0.08)" }}
        >
          <IntegrationsList navigate={navigate} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default DesktopIntegrationsStrip;
