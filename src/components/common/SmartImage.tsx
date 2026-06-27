import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  mediaId?: string;
  src?: string;
  fallbackSrc?: string;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, "src">;

/**
 * Smart <img> that auto-refreshes Telegram-hosted URLs when they expire.
 * Pass `mediaId` for telegram-backed media, or `src` for any other image.
 */
export function SmartImage({ mediaId, src, fallbackSrc, onError, ...props }: Props) {
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(src);
  const retried = useRef(false);

  useEffect(() => {
    setResolvedSrc(src);
    retried.current = false;
  }, [src, mediaId]);

  useEffect(() => {
    if (!mediaId || resolvedSrc) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.functions.invoke("telegram-tasks-bot/storage-refresh", {
        body: { media_id: mediaId },
      });
      if (!cancelled && data?.url) setResolvedSrc(data.url);
    })();
    return () => {
      cancelled = true;
    };
  }, [mediaId, resolvedSrc]);

  const handleError = async (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    if (mediaId && !retried.current) {
      retried.current = true;
      try {
        const { data } = await supabase.functions.invoke("telegram-tasks-bot/storage-refresh", {
          body: { media_id: mediaId },
        });
        if (data?.url) {
          setResolvedSrc(`${data.url}#r=${Date.now()}`);
          return;
        }
      } catch {}
    }
    if (fallbackSrc && resolvedSrc !== fallbackSrc) {
      setResolvedSrc(fallbackSrc);
      return;
    }
    onError?.(e);
  };

  return <img {...props} src={resolvedSrc} onError={handleError} />;
}
