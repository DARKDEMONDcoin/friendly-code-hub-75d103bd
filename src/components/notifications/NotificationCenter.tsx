import { useState } from "react";
import { Bell, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  iconClassName?: string;
}

/**
 * Quiet in-app notification bell.
 *
 * - Never raises a toast / sound / modal.
 * - Shows a small dot only when there is something genuinely unread.
 * - Popover lists the latest notifications and lets the user clear them.
 */
export default function NotificationCenter({ className, iconClassName }: Props) {
  const { notifications, unreadCount, loading, markAllRead, markOneRead } =
    useNotifications();
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Auto-clear the "unread" badge after the user actually looked at
    // the list — we don't bug them again about the same items.
    if (!next && unreadCount > 0) {
      void markAllRead();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            unreadCount > 0
              ? `Notifications (${unreadCount} unread)`
              : "Notifications"
          }
          className={cn(
            "relative inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground/80 hover:text-foreground hover:bg-foreground/10 transition-colors",
            className,
          )}
        >
          <Bell className={cn("h-5 w-5", iconClassName)} strokeWidth={2} />
          {unreadCount > 0 && (
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#5B8DEF] ring-2 ring-background"
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[340px] max-w-[calc(100vw-24px)] p-0 overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="text-sm font-semibold text-foreground">
            Notifications
          </div>
          {notifications.length > 0 && unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="text-xs font-medium text-[#5B8DEF] hover:underline"
            >
              <Check className="inline h-3 w-3 mr-0.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-xs text-foreground/60">
              Loading…
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-foreground/60">
              You're all caught up.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              <AnimatePresence initial={false}>
                {notifications.map((n) => (
                  <motion.li
                    key={n.id}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      "px-4 py-3 cursor-pointer hover:bg-foreground/[0.04] transition-colors",
                      !n.read && "bg-foreground/[0.025]",
                    )}
                    onClick={() => {
                      if (!n.read) void markOneRead?.(n.id);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && (
                        <span
                          aria-hidden
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#5B8DEF]"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold text-foreground truncate">
                          {n.title}
                        </div>
                        {n.message && (
                          <div className="mt-0.5 text-[12.5px] text-foreground/70 line-clamp-3 whitespace-pre-wrap">
                            {n.message}
                          </div>
                        )}
                        <div className="mt-1 text-[11px] text-foreground/45">
                          {new Date(n.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
