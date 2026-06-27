import type React from "react";
import type { NavigateFunction } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUser } from "@/lib/cachedUser";
import { streamChat, GUEST_QUOTA_ERROR } from "@/lib/streamChat";
import { addActiveChatJob, removeActiveChatJob } from "@/lib/jobs/chatResume";
import { shouldUseWebSearch } from "@/lib/shouldUseWebSearch";
import {
  makeLeakedToolStreamSanitizer,
  sanitizeLeakedToolText,
  normalizeStatusLabel,
} from "../chatUtils";
import type { Message, ProductResult, ChatMode } from "../chatConstants";
import { runDeepResearchPlan } from "./runDeepResearchPlan";
import { updateMessageMetadata } from "./conversationApi";

/** Extracts the generated_sites UUID from a `build_website` preview URL embedded
 *  in assistant text. Returns undefined when no match. */
function detectSiteBuildId(text: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/\/published-sites\/[0-9a-f-]{36}\/([0-9a-f-]{36})\/index\.html/i);
  return m?.[1];
}

type SaveMessageFn = (
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  images?: string[],
  metadata?: Record<string, unknown>,
) => Promise<string | undefined>;

type Skill = {
  id?: string;
  name: string;
  description?: string;
  triggers?: string[];
  source?: string;
};

type ToolActivity = {
  name: string;
  appSlug?: string;
  target?: string;
  status: "running" | "done" | "error";
};

type ParallelTask = {
  id: string;
  name: string;
  appSlug?: string;
  target?: string;
  status: "running" | "done" | "error";
};

export interface RunChatStreamTurnOptions {
  // Input context
  messages: Message[];
  userMsg: Message;
  currentFiles: Array<{ type: string; name: string; data: string }>;
  userInput: string;
  localTurnId: string;
  assistantMessageIndex: number;
  conversationId: string | null;
  conversationPromise: Promise<string | null>;
  chatMode: ChatMode;
  searchEnabled: boolean;
  megsyTier: string;
  chatUserId: string | null;
  userName?: string | null;
  computerUseEnabled: boolean;
  selectedAgent: { id?: string } | null | undefined;
  selectedModel: { id: string; cost?: number } | null | undefined;
  enabledSkills: Skill[];
  librarySkills: Skill[];
  researchDepth: string;

  // Setters
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsLoading: (v: boolean) => void;
  setIsThinking: (v: boolean) => void;
  setSearchStatus: (v: string) => void;
  setActiveResearchJobId: (v: string | null) => void;
  setNarrations: React.Dispatch<React.SetStateAction<string[]>>;
  setClarifyQs: (v: any) => void;
  setToolActivity: React.Dispatch<React.SetStateAction<ToolActivity | null>>;
  setParallelTasks: React.Dispatch<React.SetStateAction<ParallelTask[]>>;

  // Refs
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  presenceChannelRef: React.MutableRefObject<any>;
  ownInsertedIdsRef: React.MutableRefObject<Set<string>>;
  isSubmittingRef: React.MutableRefObject<boolean>;

  // Helpers
  resetToolUi: () => void;
  pushNarration: (text: string) => void;
  saveMessage: SaveMessageFn;
}

export async function runChatStreamTurn(opts: RunChatStreamTurnOptions): Promise<void> {
  const {
    messages,
    userMsg,
    currentFiles,
    userInput,
    localTurnId,
    assistantMessageIndex,
    conversationId,
    conversationPromise,
    chatMode,
    searchEnabled,
    megsyTier,
    chatUserId,
    userName,
    computerUseEnabled,
    selectedAgent,
    selectedModel,
    enabledSkills,
    librarySkills,
    researchDepth,
    setMessages,
    setIsLoading,
    setIsThinking,
    setSearchStatus,
    setActiveResearchJobId,
    setNarrations,
    setClarifyQs,
    setToolActivity,
    setParallelTasks,
    abortControllerRef,
    presenceChannelRef,
    ownInsertedIdsRef,
    isSubmittingRef,
    resetToolUi,
    pushNarration,
    saveMessage,
  } = opts;

  // Broadcast that AI is now busy in this conversation
  if (presenceChannelRef.current && chatUserId) {
    presenceChannelRef.current.send({
      type: "broadcast",
      event: "ai_busy",
      payload: { user_id: chatUserId, name: userName, busy: true },
    });
  }

  let assistantContent = "";
  let deepResearchPlaceholderId: string | null = null;
  let deepResearchPlaceholderPromise: Promise<string | null> | null = null;
  let deepResearchJobId: string | null = null;
  let assistantRenderTimer: ReturnType<typeof setTimeout> | null = null;
  let hasStartedResponse = false;
  let hadStreamError = false;
  const controller = new AbortController();
  abortControllerRef.current = controller;
  let searchImages: string[] = [];
  let streamedProducts: ProductResult[] = [];
  const sanitizeStreamChunk = makeLeakedToolStreamSanitizer();

  const isToolMarkerChunk = (chunk: string) => {
    const trimmed = chunk.trim();
    return [
      "BROWSE_WEBSITE",
      "WEB_SEARCH",
      "SHOPPING_SEARCH",
      "CONVERT_CURRENCY",
      "GENERATE_IMAGE",
      "GENERATE_VIDEO",
      "GENERATE_VOICE",
      "CANVA_CREATE_SLIDES",
    ].includes(trimmed);
  };

  const flushAssistantUpdate = () => {
    assistantRenderTimer = null;
    const nextContent = assistantContent;
    setMessages((prev) => {
      const assistantIndex = prev.findIndex((m) => m.clientId === `assistant-${localTurnId}`);
      const targetIndex = assistantIndex >= 0 ? assistantIndex : prev.length - 1;
      const last = prev[targetIndex];
      if (last?.role === "assistant") {
        if (
          last.content === nextContent &&
          (last.products || streamedProducts) === (last.products ? last.products : streamedProducts)
        )
          return prev;
        const next = prev.slice();
        next[targetIndex] = {
          ...last,
          content: nextContent,
          products: last.products ?? streamedProducts,
        };
        return next;
      }
      return [
        ...prev,
        {
          role: "assistant",
          content: nextContent,
          products: streamedProducts,
          clientId: `assistant-${localTurnId}`,
        },
      ];
    });
  };

  const scheduleAssistantUpdate = (immediate = false) => {
    if (immediate) {
      if (assistantRenderTimer) clearTimeout(assistantRenderTimer);
      flushAssistantUpdate();
      return;
    }
    if (assistantRenderTimer) return;
    assistantRenderTimer = setTimeout(flushAssistantUpdate, 90);
  };

  const updateAssistant = (chunk: string) => {
    if (isToolMarkerChunk(chunk)) return;
    const safeChunk = sanitizeStreamChunk(chunk);
    if (!safeChunk.trim()) return;
    if (!hasStartedResponse) {
      hasStartedResponse = true;
      setIsThinking(false);
      resetToolUi();
    }
    const wasEmpty = assistantContent.length === 0;
    assistantContent += safeChunk;
    scheduleAssistantUpdate(wasEmpty);
  };

  const allMessages = [...messages, userMsg].map((m) => {
    const imgs = m.attachedImages || [];
    if (imgs.length > 0) {
      // IMPORTANT: Put text FIRST so the model sees the user's question, then images
      const content: any[] = [];
      if (m.content && m.content.trim()) {
        content.push({ type: "text" as const, text: m.content });
      }
      imgs.forEach((imgData) => {
        content.push({ type: "image_url" as const, image_url: { url: imgData } });
      });
      if (content.length === 0) {
        content.push({ type: "text" as const, text: "Please analyze this image." });
      }
      return { role: m.role, content };
    }
    return {
      role: m.role,
      content: m.role === "assistant" ? sanitizeLeakedToolText(m.content) : m.content,
    };
  });

  if (currentFiles.some((f) => f.type === "file")) {
    const fileTexts = currentFiles
      .filter((f) => f.type === "file")
      .map((f) => `--- File: ${f.name} ---\n${f.data}`)
      .join("\n\n");
    const lastMsg = allMessages[allMessages.length - 1];
    if (typeof lastMsg.content === "string") {
      lastMsg.content = `${lastMsg.content}\n\n${fileTexts}`;
    }
  }

  const isDeepResearch = chatMode === "deep-research";
  if (isDeepResearch) {
    setSearchStatus("Preparing deep research...");
  }

  // ── Deep Research plan-approval intercept ────────────────────────────
  if (isDeepResearch) {
    try {
      await runDeepResearchPlan({
        userInput,
        localTurnId,
        conversationId,
        conversationPromise,
        researchDepth,
        chatUserId,
        userName,
        setMessages,
        setActiveResearchJobId,
        setIsLoading,
        setIsThinking,
        resetToolUi,
        saveMessage,
        ownInsertedIdsRef,
        presenceChannelRef,
      } as any);
    } finally {
      isSubmittingRef.current = false;
    }
    return;
  }

  const lastUserText = (userMsg?.content || "").toString();
  const smartSearch = isDeepResearch ? true : shouldUseWebSearch(lastUserText, searchEnabled);

  const activeModel = "qwen-max";

  let backgroundCid: string | null = conversationId;
  if (isDeepResearch && !backgroundCid) {
    backgroundCid = await conversationPromise;
  }

  await streamChat({
    messages: allMessages,
    model: activeModel,
    tier: megsyTier as "lite" | "pro" | "max",
    searchEnabled: smartSearch,
    deepResearch: isDeepResearch,
    background: false,
    onJobStart: isDeepResearch
      ? (jobId) => {
          deepResearchJobId = jobId;
          setActiveResearchJobId(jobId);
          const cid = backgroundCid || conversationId;
          if (!cid) {
            console.warn("[research] job started without conversationId — resume will not work");
            return;
          }
          addActiveChatJob({
            jobId,
            conversationId: cid,
            clientId: `assistant-${localTurnId}`,
            userInput: userInput || "Deep Research",
            startedAt: Date.now(),
          });
          setMessages((prev) =>
            prev.map((m) =>
              m.clientId === `assistant-${localTurnId}` ? ({ ...m, chatJobId: jobId } as any) : m,
            ),
          );
          deepResearchPlaceholderPromise = (async () => {
            try {
              const aId = await saveMessage(cid, "assistant", "", undefined, {
                kind: "researchPending",
                chatJobId: jobId,
                query: userInput || "Deep Research",
              });
              if (aId) {
                deepResearchPlaceholderId = aId;
                ownInsertedIdsRef.current.add(aId);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.clientId === `assistant-${localTurnId}` ? ({ ...m, id: aId } as any) : m,
                  ),
                );
              }
              return aId ?? null;
            } catch (e) {
              console.warn("[research] placeholder save failed", e);
              return null;
            }
          })();
        }
      : undefined,
    chatMode: chatMode,
    user_id: chatUserId || undefined,
    conversation_id: backgroundCid || conversationId || undefined,
    computerUseEnabled,
    activeAgent: chatMode !== "normal" ? chatMode : selectedAgent?.id || undefined,
    selectedModel: selectedModel ? { id: selectedModel.id, cost: selectedModel.cost } : undefined,
    activeSkill: undefined,
    availableSkills: [
      ...enabledSkills,
      ...librarySkills.filter((l) => !enabledSkills.some((e) => e.name === l.name)),
    ]
      .slice(0, 16)
      .map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        triggers: s.triggers || [],
        source: s.source,
      })),
    onDelta: updateAssistant,
    onImages: (imgs) => {
      searchImages = imgs;
    },
    onProducts: (products) => {
      streamedProducts = products;
      setMessages((prev) => {
        const assistantIndex = prev.findIndex((m) => m.clientId === `assistant-${localTurnId}`);
        const targetIndex = assistantIndex >= 0 ? assistantIndex : prev.length - 1;
        const last = prev[targetIndex];
        if (last?.role !== "assistant") return prev;
        const next = prev.slice();
        next[targetIndex] = { ...last, products };
        return next;
      });
    },
    onStatus: (status) => {
      const normalizedStatus = normalizeStatusLabel(status);
      if (normalizedStatus) {
        setSearchStatus(normalizedStatus);
        setIsThinking(true);
      }
    },
    onBrowser: () => {
      // Browser state no longer tracked in UI
    },
    onEvent: (payload: any) => {
      const ev = payload?.event;
      if (ev === "narration") {
        pushNarration(String(payload.text || ""));
      } else if (ev === "narration_start") {
        setNarrations((prev) => [...prev, ""]);
      } else if (ev === "narration_chunk") {
        const delta = String(payload.delta || "");
        if (!delta) return;
        setNarrations((prev) => {
          if (prev.length === 0) return [delta];
          const next = prev.slice();
          next[next.length - 1] = (next[next.length - 1] || "") + delta;
          return next;
        });
      } else if (ev === "narration_end") {
        setNarrations((prev) => {
          if (prev.length === 0) return prev;
          const last = (prev[prev.length - 1] || "").trim();
          if (last) return prev;
          return prev.slice(0, -1);
        });
      } else if (ev === "clarify_questions") {
        if (Array.isArray(payload.questions)) setClarifyQs(payload.questions);
      } else if (ev === "tool_event") {
        const t = payload?.type;
        if (t === "tool_call") {
          const taskId = String(
            payload.call_id || `${payload.name || "tool"}-${Date.now()}-${Math.random()}`,
          );
          setToolActivity({
            name: String(payload.name || ""),
            appSlug: payload.app_slug,
            target: payload.target,
            status: "running",
          });
          setParallelTasks((prev) => {
            const nextTask = {
              id: taskId,
              name: String(payload.name || ""),
              appSlug: payload.app_slug,
              target: payload.target,
              status: "running" as const,
            };
            const existing = prev.findIndex((task) => task.id === taskId);
            if (existing >= 0) {
              const next = prev.slice();
              next[existing] = nextTask;
              return next;
            }
            return [...prev, nextTask].slice(-8);
          });
          setIsThinking(true);
        } else if (t === "progress") {
          const tool = String(payload.tool || "tool");
          const step = String(payload.step || "step");
          const taskId = `${tool}:${step}`;
          const status =
            payload.status === "done" ? "done" : payload.status === "error" ? "error" : "running";
          const label = String(payload.label || step);
          const target =
            payload.index && payload.total ? `${label} (${payload.index}/${payload.total})` : label;
          setParallelTasks((prev) => {
            const existing = prev.findIndex((task) => task.id === taskId);
            const nextTask = {
              id: taskId,
              name: tool,
              appSlug: tool,
              target,
              status: status as "running" | "done" | "error",
            };
            if (existing >= 0) {
              const next = prev.slice();
              next[existing] = nextTask;
              return next;
            }
            return [...prev, nextTask].slice(-12);
          });
        } else if (t === "tool_result") {
          setToolActivity((prev) =>
            prev && prev.name === payload.name
              ? { ...prev, status: payload.ok ? "done" : "error" }
              : prev,
          );
          setParallelTasks((prev) => {
            const taskId = payload.call_id ? String(payload.call_id) : "";
            let updated = false;
            const next = prev.map((task) => {
              const matches = taskId
                ? task.id === taskId
                : task.name === payload.name && task.status === "running";
              if (!matches || updated) return task;
              updated = true;
              return { ...task, status: payload.ok ? ("done" as const) : ("error" as const) };
            });
            return next;
          });
          try {
            const result = payload?.result;
            const collected: string[] = [];
            const pushUrl = (u: unknown) => {
              if (typeof u === "string" && /^(https?:\/\/|data:image\/)/i.test(u))
                collected.push(u);
            };
            const walk = (value: unknown, depth = 0) => {
              if (!value || depth > 4) return;
              if (typeof value === "string") {
                pushUrl(value);
                return;
              }
              if (Array.isArray(value)) {
                value.forEach((item) => walk(item, depth + 1));
                return;
              }
              if (typeof value === "object") {
                const obj = value as Record<string, unknown>;
                pushUrl(obj.image_url);
                pushUrl(obj.url);
                pushUrl(obj.output_url);
                walk(obj.image_urls, depth + 1);
                walk(obj.images, depth + 1);
                walk(obj.urls, depth + 1);
                walk(obj.output, depth + 1);
                walk(obj.data, depth + 1);
                walk(obj.raw, depth + 1);
              }
            };
            walk(result);
            if (collected.length > 0) {
              const fresh = collected.filter((u) => !searchImages.includes(u));
              if (fresh.length > 0) {
                searchImages = [...searchImages, ...fresh];
                setMessages((prev) => {
                  const assistantIndex = prev.findIndex(
                    (m) => m.clientId === `assistant-${localTurnId}`,
                  );
                  const targetIndex = assistantIndex >= 0 ? assistantIndex : prev.length - 1;
                  const last = prev[targetIndex];
                  if (last?.role !== "assistant") return prev;
                  const next = prev.slice();
                  const existing = Array.isArray(last.images) ? last.images : [];
                  const merged = [...existing, ...fresh.filter((u) => !existing.includes(u))];
                  next[targetIndex] = { ...last, images: merged };
                  return next;
                });
              }
            }
          } catch (e) {
            console.warn("[chat] failed to extract tool image", e);
          }

          // ── Video tool: surface direct video URL OR poll a job_id ─────
          try {
            const result: any = payload?.result;
            const toolName = String(payload?.name || "");
            if (
              result &&
              (toolName === "generate_video" || result.job_id || result.jobId || result.video_url)
            ) {
              const directUrl: string | undefined =
                (typeof result.video_url === "string" && result.video_url) ||
                (typeof result.url === "string" &&
                  /\.(mp4|webm|mov)(\?|$)/i.test(result.url) &&
                  result.url) ||
                undefined;

              const attachVideo = (url: string) => {
                setMessages((prev) => {
                  const idx = prev.findIndex((m) => m.clientId === `assistant-${localTurnId}`);
                  const targetIndex = idx >= 0 ? idx : prev.length - 1;
                  const last = prev[targetIndex];
                  if (!last || last.role !== "assistant") return prev;
                  const existing = Array.isArray(last.videos) ? last.videos : [];
                  if (existing.includes(url)) return prev;
                  const next = prev.slice();
                  next[targetIndex] = { ...last, videos: [...existing, url] };
                  return next;
                });
              };

              if (directUrl) {
                attachVideo(directUrl);
              } else {
                const jobId: string | undefined = result.job_id || result.jobId;
                if (jobId) {
                  // Non-blocking poll loop — up to 8 minutes, every 4s.
                  (async () => {
                    const started = Date.now();
                    const MAX = 8 * 60 * 1000;
                    while (Date.now() - started < MAX) {
                      await new Promise((r) => setTimeout(r, 4000));
                      try {
                        const { data, error } = await supabase.functions.invoke(
                          "media-video-poll",
                          { body: { job_id: jobId } },
                        );
                        if (error) continue;
                        const status = data?.status;
                        if (
                          status === "complete" ||
                          status === "completed" ||
                          status === "succeeded" ||
                          status === "success"
                        ) {
                          const u = data?.video_url || data?.url || data?.output_url;
                          if (u) attachVideo(String(u));
                          return;
                        }
                        if (status === "failed" || status === "error" || status === "cancelled") {
                          console.warn("[chat] video job failed:", data?.error);
                          return;
                        }
                      } catch (e) {
                        console.warn("[chat] video poll error:", e);
                      }
                    }
                  })();
                }
              }
            }
          } catch (e) {
            console.warn("[chat] failed to handle video tool_result", e);
          }
        }
      }
    },
    onDone: async () => {
      if (hadStreamError) return;
      try {
        const { triggerAha } = await import("@/lib/ahaTracker");
        triggerAha("chat");
      } catch {
        /* noop */
      }
      if (isDeepResearch) {
        if (deepResearchJobId) removeActiveChatJob(deepResearchJobId);
      }
      const tail = sanitizeStreamChunk("", true);
      if (tail.trim()) {
        assistantContent += tail;
      }
      if (assistantRenderTimer) {
        clearTimeout(assistantRenderTimer);
        flushAssistantUpdate();
      }
      setIsLoading(false);
      setIsThinking(false);
      resetToolUi();
      isSubmittingRef.current = false;
      if (presenceChannelRef.current && chatUserId) {
        presenceChannelRef.current.send({
          type: "broadcast",
          event: "ai_busy",
          payload: { user_id: chatUserId, busy: false },
        });
      }
      if (!assistantContent && searchImages.length === 0 && streamedProducts.length === 0) {
        assistantContent =
          "There was a delay generating the response, but your request was received. Try sending it again or make it shorter.";
        setMessages((prev) => {
          const assistantIndex = prev.findIndex((m) => m.clientId === `assistant-${localTurnId}`);
          const targetIndex = assistantIndex >= 0 ? assistantIndex : prev.length - 1;
          const last = prev[targetIndex];
          if (last?.role !== "assistant")
            return [
              ...prev,
              {
                role: "assistant",
                content: assistantContent,
                clientId: `assistant-${localTurnId}`,
              },
            ];
          const next = prev.slice();
          next[targetIndex] = { ...last, content: assistantContent };
          return next;
        });
      }
      const resolvedConversationId = await conversationPromise;
      if (resolvedConversationId && assistantContent) {
        if (isDeepResearch && !deepResearchPlaceholderId && deepResearchPlaceholderPromise) {
          deepResearchPlaceholderId = await deepResearchPlaceholderPromise;
        }
        let aId: string | undefined;
        if (isDeepResearch && deepResearchPlaceholderId) {
          const { error } = await supabase
            .from("messages")
            .update({
              content: assistantContent,
              images: searchImages.length > 0 ? searchImages : null,
              metadata: null,
            } as any)
            .eq("id", deepResearchPlaceholderId);
          if (error) {
            const insertedId = await saveMessage(
              resolvedConversationId,
              "assistant",
              assistantContent,
              searchImages.length > 0 ? searchImages : undefined,
            );
            aId = insertedId;
          } else {
            aId = deepResearchPlaceholderId;
          }
        } else {
          aId = await saveMessage(
            resolvedConversationId,
            "assistant",
            assistantContent,
            searchImages.length > 0 ? searchImages : undefined,
          );
        }
        if (aId) ownInsertedIdsRef.current.add(aId);
        const siteIdA = detectSiteBuildId(assistantContent);
        if (siteIdA && aId) {
          void updateMessageMetadata(aId, { siteBuild: { siteId: siteIdA }, kind: "siteBuild" });
        }
        if (isDeepResearch) {
          const user = await getCachedUser();
          if (user) {
            await supabase.from("research_reports").upsert(
              {
                user_id: user.id,
                session_key: `conv_${resolvedConversationId}_${assistantMessageIndex}`,
                query: userInput || "Deep Research",
                report: assistantContent,
                images: (searchImages.length > 0 ? searchImages : []) as any,
                steps: [] as any,
              } as any,
              { onConflict: "user_id,session_key" },
            );
          }
        }
        setMessages((prev) => {
          const assistantIndex = prev.findIndex((m) => m.clientId === `assistant-${localTurnId}`);
          const targetIndex = assistantIndex >= 0 ? assistantIndex : prev.length - 1;
          const last = prev[targetIndex];
          if (last?.role !== "assistant") return prev;
          const next = prev.slice();
          next[targetIndex] = {
            ...last,
            id: aId || last.id,
            images: searchImages.length > 0 ? searchImages : last.images,
            products: streamedProducts.length > 0 ? streamedProducts : last.products,
            siteBuild: siteIdA ? { siteId: siteIdA } : last.siteBuild,
          };
          return next;
        });
        const dbMode =
          (chatMode as string) === "deep-research"
            ? "research"
            : chatMode === "learning"
              ? "learning"
              : chatMode === "shopping"
                ? "shopping"
                : "chat";
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString(), mode: dbMode } as any)
          .eq("id", resolvedConversationId);
        window.dispatchEvent(new CustomEvent("megsy:conversations-changed"));
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.access_token && assistantContent && userInput) {
            void supabase.functions
              .invoke("openrouter-media", {
                headers: { Authorization: `Bearer ${session.access_token}` },
                body: {
                  kind: "extract_memory",
                  user_message: userInput,
                  assistant_reply: assistantContent.slice(0, 4000),
                  conversation_id: resolvedConversationId,
                  message_id: aId,
                },
              })
              .catch(() => {});
          }
        } catch {
          /* ignore */
        }
      }
    },
    onError: (err) => {
      hadStreamError = true;
      if (isDeepResearch) {
        if (deepResearchJobId) removeActiveChatJob(deepResearchJobId);
      }
      if (assistantRenderTimer) clearTimeout(assistantRenderTimer);

      const isGuestQuota = err === GUEST_QUOTA_ERROR;
      if (isGuestQuota) {
        const guestMsg = [
          "**You've used your free message.**",
          "",
          "Create a free account to keep chatting, save your history, and unlock voice, deep research, and more.",
          "",
          "[Create a free account →](/auth)",
        ].join("\n");
        assistantContent = guestMsg;
        setMessages((prev) =>
          prev.map((m) =>
            m.clientId === `assistant-${localTurnId}` ? { ...m, content: guestMsg } : m,
          ),
        );
      } else {
        toast.error(err);
      }
      setIsThinking(false);
      setIsLoading(false);
      resetToolUi();
      if (presenceChannelRef.current && chatUserId) {
        presenceChannelRef.current.send({
          type: "broadcast",
          event: "ai_busy",
          payload: { user_id: chatUserId, busy: false },
        });
      }
      const fallbackContent =
        isDeepResearch && !assistantContent.trim()
          ? "Deep Research stopped before the final report was generated. The request was saved — please try again in a moment."
          : "";
      if (fallbackContent) {
        assistantContent = fallbackContent;
        setMessages((prev) =>
          prev.map((m) =>
            m.clientId === `assistant-${localTurnId}` ? { ...m, content: fallbackContent } : m,
          ),
        );
      } else if (!isGuestQuota && !assistantContent.trim()) {
        assistantContent = err;
        setMessages((prev) =>
          prev.map((m) => (m.clientId === `assistant-${localTurnId}` ? { ...m, content: err } : m)),
        );
      } else if (!isGuestQuota) {
        setMessages((prev) =>
          prev[prev.length - 1]?.role === "assistant" && !prev[prev.length - 1]?.content
            ? prev.slice(0, -1)
            : prev,
        );
      }
      void (async () => {
        const contentToSave = assistantContent.trim();
        const resolvedConversationId = await conversationPromise;
        if (!resolvedConversationId) return;
        if (isDeepResearch && !deepResearchPlaceholderId && deepResearchPlaceholderPromise) {
          deepResearchPlaceholderId = await deepResearchPlaceholderPromise;
        }
        if (!contentToSave) {
          if (isDeepResearch && deepResearchPlaceholderId) {
            void supabase
              .from("messages")
              .delete()
              .eq("id", deepResearchPlaceholderId)
              .then(() => {});
          }
          return;
        }
        let aId: string | undefined;
        if (isDeepResearch && deepResearchPlaceholderId) {
          const { error } = await supabase
            .from("messages")
            .update({
              content: contentToSave,
              images: searchImages.length > 0 ? searchImages : null,
              metadata: null,
            } as any)
            .eq("id", deepResearchPlaceholderId);
          if (error) {
            const insertedId = await saveMessage(
              resolvedConversationId,
              "assistant",
              contentToSave,
              searchImages.length > 0 ? searchImages : undefined,
            );
            aId = insertedId;
          } else {
            aId = deepResearchPlaceholderId;
          }
        } else {
          aId = await saveMessage(
            resolvedConversationId,
            "assistant",
            contentToSave,
            searchImages.length > 0 ? searchImages : undefined,
          );
        }
        if (aId) ownInsertedIdsRef.current.add(aId);
        const siteIdB = detectSiteBuildId(contentToSave);
        if (siteIdB && aId) {
          void updateMessageMetadata(aId, { siteBuild: { siteId: siteIdB }, kind: "siteBuild" });
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aId || m.clientId === `assistant-${localTurnId}`
                ? { ...m, siteBuild: { siteId: siteIdB } }
                : m,
            ),
          );
        }
        if (isDeepResearch && chatUserId) {
          await supabase.from("research_reports").upsert(
            {
              user_id: chatUserId,
              session_key: `conv_${resolvedConversationId}_${assistantMessageIndex}`,
              query: userInput || "Deep Research",
              report: contentToSave,
              images: (searchImages.length > 0 ? searchImages : []) as any,
              steps: [] as any,
            } as any,
            { onConflict: "user_id,session_key" },
          );
        }
        try {
          void supabase.functions.invoke("openrouter-media", {
            body: {
              kind: "extract_memory",
              user_message: userInput || "",
              assistant_reply: contentToSave,
              conversation_id: resolvedConversationId,
              message_id: aId || null,
            },
          });
        } catch {}
      })();
      isSubmittingRef.current = false;
    },
    signal: controller.signal,
  });
}
