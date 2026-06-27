import { useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseUploadedFile } from "@/lib/parseUploadedFile";
import type { AttachedFile } from "./useAttachments";

/**
 * Bundles the three composer-attachment entry points (general file picker,
 * image-only picker, and camera capture) into a single hook so ChatPage
 * doesn't have to babysit FileReader plumbing.
 */
export function useComposerUploads(params: {
  attachedFiles: AttachedFile[];
  setAttachedFiles: React.Dispatch<React.SetStateAction<AttachedFile[]>>;
  conversationId: string | null;
  createOrUpdateConversation: (firstMessage: string) => Promise<string | null>;
}) {
  const { attachedFiles, setAttachedFiles, conversationId, createOrUpdateConversation } = params;

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      const fileList = Array.from(files);
      if (attachedFiles.length + fileList.length > 5) {
        toast.error("Maximum 5 files allowed");
        e.target.value = "";
        return;
      }
      for (const file of fileList) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name} is too large (max 20MB)`);
          continue;
        }
        if (file.size === 0) {
          toast.error(`${file.name} is empty`);
          continue;
        }
        if (file.type.startsWith("image/")) {
          await new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              setAttachedFiles((prev) => [
                ...prev,
                { name: file.name, type: "image", data: reader.result as string },
              ]);
              resolve();
            };
            reader.onerror = () => resolve();
            reader.readAsDataURL(file);
          });
        } else {
          const placeholderId = `__parsing_${file.name}_${Date.now()}`;
          setAttachedFiles((prev) => [
            ...prev,
            { name: `${file.name} (analyzing…)`, type: "file", data: placeholderId },
          ]);
          try {
            const text = await parseUploadedFile(file);
            setAttachedFiles((prev) =>
              prev.map((f) =>
                f.type === "file" && f.data === placeholderId
                  ? { name: file.name, type: "file", data: text }
                  : f,
              ),
            );
            toast.success(`Analyzed ${file.name}`);
            if (text && text.length > 800) {
              const convId = conversationId || (await createOrUpdateConversation(file.name));
              if (convId) {
                void supabase.functions
                  .invoke("chat-alibaba", {
                    body: {
                      action: "ingest_attachment",
                      conversation_id: convId,
                      file_name: file.name,
                      text,
                    },
                  })
                  .catch(() => {});
              }
            }
          } catch {
            setAttachedFiles((prev) =>
              prev.filter((f) => !(f.type === "file" && f.data === placeholderId)),
            );
            toast.error(`Could not read ${file.name}`);
          }
        }
      }
      e.target.value = "";
    },
    [attachedFiles.length, setAttachedFiles, conversationId, createOrUpdateConversation],
  );

  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      const fileList = Array.from(files);
      if (attachedFiles.length + fileList.length > 5) {
        toast.error("Maximum 5 files allowed");
        e.target.value = "";
        return;
      }
      fileList.forEach((file) => {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name} is too large (max 20MB)`);
          return;
        }
        if (file.size === 0) {
          toast.error(`${file.name} is empty`);
          return;
        }
        const reader = new FileReader();
        reader.onload = () =>
          setAttachedFiles((prev) => [
            ...prev,
            { name: file.name, type: "image", data: reader.result as string },
          ]);
        reader.readAsDataURL(file);
      });
      e.target.value = "";
    },
    [attachedFiles.length, setAttachedFiles],
  );

  const handleCameraCapture = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (attachedFiles.length >= 5) {
        toast.error("Maximum 5 files allowed");
        e.target.value = "";
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 20MB)`);
        e.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () =>
        setAttachedFiles((prev) => [
          ...prev,
          { name: file.name, type: "image", data: reader.result as string },
        ]);
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [attachedFiles.length, setAttachedFiles],
  );

  return { handleFileUpload, handleImageUpload, handleCameraCapture };
}
