/** @doc Main chat workspace — all modes, all models, attachments, agents and the composer live here. */
import SEOHead from "@/components/common/SEOHead";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MAX_CHAT_MESSAGE_CHARS } from "@/lib/validation/schemas";

import { getCachedUser } from "@/lib/cachedUser";
import AppSidebar from "@/components/layout/AppSidebar";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";

// Background job helpers and one-off lib utilities that are still referenced
// from the surviving body (cancel/cleanup paths, etc.).
import { failStaleJob } from "@/lib/jobs/client";
import { useSkills } from "@/hooks/useSkills";

// State + side-effect hooks that drive ChatPage's enormous state graph.
import { useUrlMode } from "./hooks/useUrlMode";
import { useVideoFrames } from "./hooks/useVideoFrames";
import { useShareDialog } from "./hooks/useShareDialog";
import { useChatRename } from "./hooks/useChatRename";
import { useInviteDialog } from "./hooks/useInviteDialog";
import { useChatReactions } from "./hooks/useChatReactions";
import { useChatPresence } from "./hooks/useChatPresence";
import { useStudyMode } from "./hooks/useStudyMode";
import { useToolActivity } from "./hooks/useToolActivity";
import { useChatTier } from "./hooks/useChatTier";
import { usePlusMenu } from "./hooks/usePlusMenu";
import { usePendingQuestions } from "./hooks/usePendingQuestions";
import { useTrendingSuggestions } from "./hooks/useTrendingSuggestions";
import { useChatModeState } from "./hooks/useChatModeState";
import { useAttachments } from "./hooks/useAttachments";
import { useChatMessages } from "./hooks/useChatMessages";
import { useConversationMeta } from "./hooks/useConversationMeta";
import { useMobileGreeting } from "./hooks/useMobileGreeting";
import { useChatHeaderUi } from "./hooks/useChatHeaderUi";
import { useChatIdentity } from "./hooks/useChatIdentity";
import { useMessageEdit } from "./hooks/useMessageEdit";
import { useIntegrationsUi } from "./hooks/useIntegrationsUi";
import { useTypingPresence } from "./hooks/useTypingPresence";
import { useMentionDetection } from "./hooks/useMentionDetection";
import { useUserMusic } from "./hooks/useUserMusic";
import { useComposerUploads } from "./hooks/useComposerUploads";
import { useChatEntryEffects } from "./hooks/useChatEntryEffects";
import { useChatSocialActions } from "./hooks/useChatSocialActions";
import { useAuthHydration } from "./hooks/useAuthHydration";
import { useEmbedBackfill } from "./hooks/useEmbedBackfill";
import { useOutsideClickToClose } from "./hooks/useOutsideClickToClose";
import { useChatScroll } from "./hooks/useChatScroll";
import { useReadsAndReactions } from "./hooks/useReadsAndReactions";
import { useUnreadDocumentTitle } from "./hooks/useUnreadDocumentTitle";
import { useRealtimeMembers } from "./hooks/useRealtimeMembers";
import { usePostSignupPrompt } from "./hooks/usePostSignupPrompt";
import { useRealtimeChat } from "./hooks/useRealtimeChat";
import { useSmartQuestionsParser } from "./hooks/useSmartQuestionsParser";
import { useResearchJobSubscription } from "./hooks/useResearchJobSubscription";
import { useMessageReactionToggle } from "./hooks/useMessageReactionToggle";
import { useKickMember } from "./hooks/useKickMember";
import { useDeleteConversation } from "./hooks/useDeleteConversation";
import { useMessageDerivations } from "./hooks/useMessageDerivations";
import { useIntegrationsFilter } from "./hooks/useIntegrationsFilter";
import { useChatCancel } from "./hooks/useChatCancel";
import { useChatNewChat, useChatModeActions } from "./hooks/useChatLifecycleActions";
import { useMobileModeBarChange } from "./hooks/useMobileModeBarChange";
import { useConnectIntegration } from "./hooks/useConnectIntegration";
import { useMemberColors } from "./hooks/useMemberColors";

// Utils + per-turn services (operator/media/slides/docs/research/chat stream).
import { playNotificationSound } from "./utils/notificationSound";
import { getSeoMeta } from "./data/seoByMode";
import { rowToMessage } from "./services/rowToMessage";
import { loadConversationMembers } from "./services/loadConversationMembers";
import { resumeDocsJobs } from "./services/resumeDocsJobs";
import { resumeSlidesJobs } from "./services/resumeSlidesJobs";
import { resumeChatJobs } from "./services/resumeChatJobs";
import { runOperatorTurn } from "./services/runOperatorTurn";
import { runMediaTurn } from "./services/runMediaTurn";
import { runSlidesTurn } from "./services/runSlidesTurn";
import { runDocsTurn } from "./services/runDocsTurn";
import { runChatStreamTurn } from "./services/runChatStreamTurn";
import {
  generateShortTitle as apiGenerateShortTitle,
  createOrUpdateConversation as apiCreateOrUpdateConversation,
  saveMessage as apiSaveMessage,
  fetchSlidesNarration as apiFetchSlidesNarration,
} from "./services/conversationApi";

// Composed view components owned by the chat page.
import PlusContent from "./components/PlusContent";
import { MobileServicePanelRenderer } from "./components/MobileServicePanelRenderer";
import { ChatDialogs } from "./components/ChatDialogs";
import { ChatHiddenFileInputs } from "./components/ChatHiddenFileInputs";
import { MegsyOsIntro } from "./components/MegsyOsIntro";
import { ChatGlobalModals } from "./components/ChatGlobalModals";
import { MobileChatHeaderMount } from "./components/MobileChatHeaderMount";
import { DesktopChatHeader } from "./components/DesktopChatHeader";
import { ChatMessagesArea } from "./components/ChatMessagesArea";
import { ChatComposerSection } from "./components/ChatComposerSection";
import { DesktopGreeting } from "./components/DesktopGreeting";
import { GlassSheet, GlassSheetContent } from "@/components/ui/glass-sheet";
import { usePromoBanner } from "@/components/promo/usePromoBanner";

import { type Message, type ChatMode } from "./chatConstants";
import { DOCS_STATUS_FALLBACKS } from "./chatUtils";

const ChatPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    input,
    setInput,
    messages,
    setMessages,
    isLoading,
    setIsLoading,
    isThinking,
    setIsThinking,
    messagesEndRef,
    messagesContainerRef,
    abortControllerRef,
  } = useChatMessages();
  const {
    sidebarOpen,
    setSidebarOpen,
    showScrollBtn,
    setShowScrollBtn,
    connectorsOpen,
    setConnectorsOpen,
    directoryOpen,
    setDirectoryOpen,
    chatMenuView,
    setChatMenuView,
    megsyOsIntroOpen,
    setMegsyOsIntroOpen,
  } = useChatHeaderUi();
  const [sidebarCollapsed] = useSidebarCollapsed();
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const sidebarHoverTimer = useRef<number | null>(null);
  const isSidebarExpanded = !sidebarCollapsed || sidebarHovered;
  const { plusMenuOpen, setPlusMenuOpen, plusExpanded, setPlusExpanded, plusView, setPlusView } =
    usePlusMenu();
  const isMobileViewport = useIsMobile();
  // Mobile mode bar visibility. Visible by default on a fresh chat; auto-hides
  // the moment the first user message is sent so the transcript has room.
  // The chevron toggle in the composer lets the user bring it back manually.

  // Dynamic trending suggestions per selected agent. Re-rolled on each agent change.
  const { trendingItems, setTrendingItems, trendingAgentId, setTrendingAgentId } =
    useTrendingSuggestions();
  // Stable greeting per chat-page mount (random index + random accent color)
  const { mobileGreeting, mobileGreetingColor, returningGreetingIdx } = useMobileGreeting();
  // First visit = show original English playful greetings. Subsequent visits = Arabic time-of-day rotation.
  // Source of truth is profiles.chat_greeted (DB). We default to "returning" to avoid flashing
  // the first-time greeting on subsequent visits while the DB lookup is in flight.
  const {
    conversationId,
    setConversationId,
    conversationTitle,
    setConversationTitle,
    isFirstVisit,
    setIsFirstVisit,
    loadingMessages,
    setLoadingMessages,
  } = useConversationMeta();
  const [searchEnabled, setSearchEnabled] = useState(true);
  const { mySkills, librarySkills, enabledSkills, toggleEnabled } = useSkills();
  const {
    megsyTier,
    setMegsyTier,
    userPlan,
    setUserPlan,
    selectedModel,
    setSelectedModel,
    tierMenuOpen,
    setTierMenuOpen,
    researchDepth,
    setResearchDepth,
    researchDepthOpen,
    setResearchDepthOpen,
    selectedAgent,
    setSelectedAgent,
  } = useChatTier();
  const {
    chatMode,
    setChatMode,
    operatorRunId,
    setOperatorRunId,
    slidesTemplate,
    setSlidesTemplate,
    slidesPickerOpen,
    setSlidesPickerOpen,
    mediaModel,
    setMediaModel,
    computerUseEnabled,
    setComputerUseEnabled,
  } = useChatModeState();
  const {
    videoStartEndMode,
    setVideoStartEndMode,
    videoDurationSec,
    setVideoDurationSec,
    startFrameUrl,
    setStartFrameUrl,
    endFrameUrl,
    setEndFrameUrl,
    frameUploading,
    setFrameUploading,
  } = useVideoFrames();
  const { upload: uploadFrame } = useMediaUpload();
  const { attachedFiles, setAttachedFiles, fileInputRef, cameraInputRef, imageInputRef } =
    useAttachments();
  const {
    searchStatus,
    setSearchStatus,
    toolActivity,
    setToolActivity,
    parallelTasks,
    setParallelTasks,
    narrations,
    setNarrations,
    clarifyQs,
    setClarifyQs,
  } = useToolActivity();
  const docsStatusTimerRef = useRef<number | null>(null);
  const {
    shareDialogOpen,
    setShareDialogOpen,
    shareMode,
    setShareMode,
    isShared,
    setIsShared,
    shareId,
    setShareId,
    generatedShareUrl,
    setGeneratedShareUrl,
  } = useShareDialog();
  const {
    isRenaming,
    setIsRenaming,
    renameValue,
    setRenameValue,
    isPinned,
    setIsPinned,
    isDeleting,
    setIsDeleting,
  } = useChatRename();
  const {
    pendingQuestions,
    setPendingQuestions,
    activeResearchJobId,
    setActiveResearchJobId,
    handleResearchRunningChange,
  } = usePendingQuestions();
  // Auto-clear the active research-job tracker when the job reaches a terminal state.
  useResearchJobSubscription({ activeResearchJobId, setActiveResearchJobId });
  const {
    inviteDialogOpen,
    setInviteDialogOpen,
    inviteEmail,
    setInviteEmail,
    inviteLoading,
    setInviteLoading,
    inviteLink,
    setInviteLink,
    members,
    setMembers,
  } = useInviteDialog();
  const {
    conversationOwnerId,
    setConversationOwnerId,
    chatUserId,
    setChatUserId,
    userName,
    setUserName,
  } = useChatIdentity();
  const {
    typingUsers,
    setTypingUsers,
    remoteAiBusy,
    setRemoteAiBusy,
    onlineUsers,
    setOnlineUsers,
    systemEvents,
    setSystemEvents,
    unreadCount,
    setUnreadCount,
    newMessagesCount,
    setNewMessagesCount,
    originalTitleRef,
    presenceChannelRef,
    markedReadRef,
  } = useChatPresence();

  const {
    messageReads,
    setMessageReads,
    messageReactions,
    setMessageReactions,
    reactionPickerFor,
    setReactionPickerFor,
  } = useChatReactions();
  // Mentions handled by useMentionDetection (declared after members are ready below).

  const {
    studyMusic,
    setStudyMusic,
    readAloud,
    setReadAloud,
    studyTimers,
    setStudyTimers,
    timerInputMin,
    setTimerInputMin,
    studyAudioRef,
    musicFileInputRef,
  } = useStudyMode();
  const {
    userTracks,
    uploadingMusic,
    loadUserTracks,
    playUserTrack,
    handleMusicUpload,
    deleteUserTrack,
  } = useUserMusic({
    studyAudioRef,
    studyMusicKind: studyMusic.kind,
    setStudyMusic,
  });
  const {
    userIntegrations,
    setUserIntegrations,
    connectingApp,
    setConnectingApp,
    integrationsQuery,
    setIntegrationsQuery,
    integrationsCategory,
    setIntegrationsCategory,
    brokenLogos,
    setBrokenLogos,
  } = useIntegrationsUi();

  // Megsy OS is restricted to Pro plans and above.
  const isProPlusPlan = useCallback(
    () =>
      ["pro", "business", "elite", "max", "enterprise"].includes((userPlan || "").toLowerCase()),
    [userPlan],
  );

  const tryActivateMegsyOs = useCallback(() => {
    if (!isProPlusPlan()) {
      toast.info("Megsy OS is available on Pro plans and above");
      setPlusMenuOpen(false);
      setMegsyOsIntroOpen(true);
      return false;
    }
    const seen =
      typeof window !== "undefined" && localStorage.getItem("megsy_os_intro_seen") === "1";
    if (!seen) {
      setPlusMenuOpen(false);
      setMegsyOsIntroOpen(true);
      return false;
    }
    handleModeChange("operator");
    setPlusMenuOpen(false);
    return true;
  }, [isProPlusPlan, navigate]);

  const resetToolUi = useCallback(() => {
    setSearchStatus("");
    setToolActivity(null);
    setParallelTasks([]);
  }, []);

  const stopDocsStatusFallback = useCallback(() => {
    if (docsStatusTimerRef.current !== null) {
      window.clearInterval(docsStatusTimerRef.current);
      docsStatusTimerRef.current = null;
    }
  }, []);

  const slidesTimeoutsRef = useRef<Record<string, number>>({});
  const slidesGenerationTokenRef = useRef(0);
  const clearSlidesTimeout = useCallback((jobId: string) => {
    const timer = slidesTimeoutsRef.current[jobId];
    if (timer) window.clearTimeout(timer);
    delete slidesTimeoutsRef.current[jobId];
  }, []);

  const startDocsStatusFallback = useCallback(() => {
    stopDocsStatusFallback();
    let index = 0;
    setSearchStatus(DOCS_STATUS_FALLBACKS[index]);
    docsStatusTimerRef.current = window.setInterval(() => {
      index = Math.min(index + 1, DOCS_STATUS_FALLBACKS.length - 1);
      setSearchStatus(DOCS_STATUS_FALLBACKS[index]);
    }, 4500);
  }, [stopDocsStatusFallback]);

  useEffect(
    () => () => {
      stopDocsStatusFallback();
      Object.values(slidesTimeoutsRef.current).forEach((timer) => window.clearTimeout(timer));
      slidesTimeoutsRef.current = {};
    },
    [stopDocsStatusFallback],
  );

  const pushNarration = useCallback((text: string) => {
    const t = String(text || "").trim();
    if (!t) return;
    setNarrations((prev) => (prev[prev.length - 1] === t ? prev : [...prev, t]));
  }, []);

  const buildInitialResearchNarration = useCallback((text: string) => {
    const topic = (text || "Deep Research").trim().replace(/\s+/g, " ").slice(0, 90);
    return `On it — digging into "${topic}" now. I'll pull real sources and walk you through what I find.`;
  }, []);

  const buildFinalResearchNarration = useCallback((_text: string) => {
    return "Done — sources gathered, cross-checked, and written up. Open the preview to read it.";
  }, []);

  // Fetch user info for memory + welcome message
  useAuthHydration({
    setChatUserId,
    setUserName,
    setUserPlan,
    setIsFirstVisit,
    setMegsyTier,
  });

  const plusSheetScrollRef = useRef<HTMLDivElement | null>(null);

  // Reset plus menu sub-view whenever it closes
  useEffect(() => {
    if (!plusMenuOpen) {
      setPlusView("main");
      setPlusExpanded(false);
    }
  }, [plusMenuOpen]);

  // One-time semantic backfill for legacy data (no-op after the first run).
  useEmbedBackfill();

  // Reset scroll to top whenever the active sub-view changes so the header is visible
  useEffect(() => {
    if (plusSheetScrollRef.current) {
      plusSheetScrollRef.current.scrollTop = 0;
    }
  }, [plusView, plusMenuOpen]);

  // Close the plus-menu on any outside click (desktop popover + mobile sheet).
  useOutsideClickToClose({
    open: plusMenuOpen,
    onClose: () => setPlusMenuOpen(false),
    keepOpenSelectors: ["[data-plus-menu]", "[data-plus-trigger]", "[data-vaul-drawer]"],
    modes: ["immediate", "click"],
  });

  // Close the tier menu on any outside click.
  useOutsideClickToClose({
    open: tierMenuOpen,
    onClose: () => setTierMenuOpen(false),
    keepOpenSelectors: ["[data-tier-menu]", "[data-tier-trigger]"],
    modes: ["click"],
  });

  const { setHidden: setPromoBannerHidden } = usePromoBanner();

  // Hide the promo banner inside any active conversation (existing or newly
  // started) and restore it when the user leaves an empty chat so it remains
  // visible on other routes.
  useEffect(() => {
    setPromoBannerHidden(Boolean(conversationId) || messages.length > 0);
    return () => setPromoBannerHidden(false);
  }, [conversationId, messages.length, setPromoBannerHidden]);

  const { handleScroll, scrollToBottom } = useChatScroll({
    messages,
    isLoading,
    messagesContainerRef,
    messagesEndRef,
    setShowScrollBtn,
    setNewMessagesCount,
  });

  // Thin wrappers around services/conversationApi.ts so call sites stay terse
  // and the page is not littered with supabase plumbing.
  const generateShortTitle = useCallback(
    (firstMessage: string, convId: string) =>
      apiGenerateShortTitle(firstMessage, convId, setConversationTitle),
    [setConversationTitle],
  );

  const createOrUpdateConversation = useCallback(
    (firstMessage: string) =>
      apiCreateOrUpdateConversation(firstMessage, {
        conversationId,
        chatMode,
        setConversationId,
        setConversationTitle,
      }),
    [conversationId, chatMode, setConversationId, setConversationTitle],
  );

  const saveMessage = useCallback(apiSaveMessage, []);
  const fetchSlidesNarration = useCallback(apiFetchSlidesNarration, []);

  /**
   * Inserts a freeform assistant narration into the transcript (slides plan/summary).
   * Persists to DB and updates local state, optionally before a placeholder bubble
   * so chronological order (user → plan → placeholder) is preserved.
   */
  const insertAssistantNarration = useCallback(
    async (convId: string | null, content: string, beforeClientId?: string) => {
      if (!content?.trim()) return;
      const text = content.trim();
      let id: string | undefined;
      if (convId) {
        id = await saveMessage(convId, "assistant", text);
        if (id) ownInsertedIdsRef.current.add(id);
      }
      const newMsg = {
        id: id || `narration-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: "assistant",
        content: text,
      } as Message;
      setMessages((prev) => {
        if (!beforeClientId) return [...prev, newMsg];
        const idx = prev.findIndex((m) => m.clientId === beforeClientId);
        if (idx < 0) return [...prev, newMsg];
        return [...prev.slice(0, idx), newMsg, ...prev.slice(idx)];
      });
    },
    [saveMessage, setMessages],
  );

  // Stable per-user color palette resolver (hash → palette).
  const colorForUser = useMemberColors();

  const handleLikeMessage = useCallback((index: number, liked: boolean | null) => {
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, liked } : m)));
  }, []);

  const loadConversation = async (id: string) => {
    setConversationId(id);
    resetToolUi();
    setPendingQuestions([]);
    setNarrations([]);
    setClarifyQs(null);
    setLoadingMessages(true);
    setMessages([]);
    setSystemEvents([]);
    const { data: conv } = await supabase
      .from("conversations")
      .select("title, is_shared, share_id, is_pinned, mode, user_id")
      .eq("id", id)
      .single();
    if (conv) {
      setConversationTitle(conv.title || "Untitled");
      setIsShared(conv.is_shared || false);
      setShareId(conv.share_id || null);
      setShareMode(conv.is_shared ? "public" : "private");
      setIsPinned(!!conv.is_pinned);
      setConversationOwnerId((conv as any).user_id || null);
      const m = (conv as any).mode as string | undefined;
      if (m === "research") setChatMode("deep-research");
      else if (m === "learning") setChatMode("learning");
      else if (m === "shopping") setChatMode("shopping");
      else if (m === "slides") setChatMode("slides");
      else setChatMode("normal");
    }
    // Bump conversation to top of recent list (works for owner and members via RPC)
    supabase.rpc("bump_conversation" as any, { p_conversation_id: id }).then(() => {});
    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    if (msgs) {
      const senderIds = Array.from(new Set(msgs.map((m: any) => m.user_id).filter(Boolean)));
      const senderMap: Record<string, { name: string | null; avatar: string | null }> = {};
      if (senderIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", senderIds as string[]);
        (profs || []).forEach((p: any) => {
          senderMap[p.id] = { name: p.display_name, avatar: p.avatar_url };
        });
      }
      setMessages(
        msgs
          .map((m: any) => rowToMessage(m, senderMap, (conv as any)?.mode))
          .filter(Boolean) as Message[],
      );
      setTimeout(() => scrollToBottom(), 150);

      // Re-attach to any in-flight background jobs (docs / slides / chat).
      void resumeDocsJobs({ msgs, setMessages });
      void resumeSlidesJobs({
        msgs,
        setMessages,
        slidesTimeoutsRef,
        clearSlidesTimeout,
      });
      void resumeChatJobs({
        conversationId: id,
        msgs,
        setMessages,
        ownInsertedIdsRef,
        saveMessage,
      });
    }
    // Load members so sender names/avatars render correctly.
    setMembers(await loadConversationMembers(id));
    setLoadingMessages(false);
  };

  const handleCancel = useChatCancel({
    abortControllerRef,
    activeResearchJobId,
    setActiveResearchJobId,
    chatMode,
    setChatMode,
    setSearchEnabled,
    messages,
    setMessages,
    slidesGenerationTokenRef,
    clearSlidesTimeout,
    failStaleJob,
    conversationId,
    setIsLoading,
    setIsThinking,
    resetToolUi,
    saveMessage,
  });

  const { handleModeChange, handleSearchToggle } = useChatModeActions({
    chatMode,
    setChatMode,
    setStudyTimers,
    setStudyMusic,
    setSearchEnabled,
    searchEnabled,
    mediaModel,
    setMediaModel,
    setTierMenuOpen,
    setPlusMenuOpen,
  });

  // Sync chatMode with `?mode=` deep links — extracted to ./hooks/useUrlMode.
  useUrlMode({ chatMode, setChatMode, setSearchEnabled });

  const handleStructuredAction = useCallback((text: string) => {
    if (text.startsWith("Connect:")) {
      setConnectorsOpen(true);
      return;
    }
    setInput(text);
    setTimeout(() => {
      setInput(text);
      void sendWithTextRef.current?.(text);
    }, 50);
  }, []);

  // Parse JSON "questions" blocks from the latest assistant message.
  useSmartQuestionsParser({ messages, isLoading, setPendingQuestions });

  const handleQuestionAnswer = (answer: string) => {
    setPendingQuestions([]);
    handleSendWithText(answer);
  };

  const handleQuestionSkip = () => {
    setPendingQuestions([]);
  };

  const isSubmittingRef = useRef(false);
  const sendWithTextRef = useRef<((overrideText?: string) => Promise<void>) | undefined>(undefined);

  const ownInsertedIdsRef = useRef<Set<string>>(new Set());

  const handleSendWithText = async (overrideText?: string) => {
    const text = overrideText || input;
    const hasFrames = chatMode === "video" && videoStartEndMode && !!startFrameUrl && !!endFrameUrl;
    if (!text.trim() && attachedFiles.length === 0 && !hasFrames) return;
    if (isLoading || isSubmittingRef.current) return;
    // Guard: oversized prompts are almost always a paste accident — refuse
    // early with a clear message instead of letting the request fail server-side.
    if (text.length > MAX_CHAT_MESSAGE_CHARS) {
      toast.error(
        `Message is too long (${text.length.toLocaleString()} chars). Max is ${MAX_CHAT_MESSAGE_CHARS.toLocaleString()}.`,
      );
      return;
    }

    // Premium modes require an authenticated user. Normal/learning/shopping
    // chat stays fully public so anyone can try the product without sign-up.
    const PROTECTED_MODES: ChatMode[] = [
      "deep-research",
      "slides",
      "slides-images",
      "operator",
      "images",
      "video",
    ];
    if (PROTECTED_MODES.includes(chatMode) && !chatUserId) {
      toast.error("Please sign in to use this feature.");
      navigate(
        `/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
      return;
    }

    // Subscribers-only gate for media generation (images / video / website / code builds).
    const SUBSCRIBER_MODES: ChatMode[] = ["images", "video"];
    const planLower = (userPlan || "free").toLowerCase();
    const isPaidPlan = [
      "starter",
      "pro",
      "pro_plus",
      "business",
      "team",
      "elite",
      "max",
      "ultimate",
      "premium",
      "enterprise",
    ].includes(planLower);

    // Heuristic intent detection on free-text (Arabic + English) for website/app/code builds.
    const lowered = text.toLowerCase();
    const websiteIntent =
      /ابني\s*لي\s*موقع|اعمل\s*لي\s*موقع|انشئ\s*موقع|أنشئ\s*موقع|صمم\s*لي\s*موقع|اعمل\s*لي\s*لاندينج|اعمل\s*لي\s*تطبيق|ابني\s*لي\s*تطبيق|اكتب\s*لي\s*كود/.test(
        text,
      ) ||
      /\bbuild (me )?(a )?(website|landing|app|web app)\b|\bcreate (a )?(website|landing|app)\b|\bmake (me )?(a )?(website|app)\b|\bwrite (me )?code\b|\bcode (a|me)\b/.test(
        lowered,
      );

    const triggerGate = SUBSCRIBER_MODES.includes(chatMode) || websiteIntent;
    if (triggerGate && !isPaidPlan) {
      const feature: "images" | "video" | "code" =
        chatMode === "video" ? "video" : chatMode === "images" ? "images" : "code";
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          clientId: `user-paywall-${Date.now()}`,
          content: text,
          mode: chatMode,
        } as Message,
        {
          role: "assistant",
          clientId: `assist-paywall-${Date.now()}`,
          content: "",
          mode: chatMode,
          paywall: { feature },
        } as Message,
      ]);
      setInput("");
      isSubmittingRef.current = false;
      return;
    }

    isSubmittingRef.current = true;

    const imageAttachments = attachedFiles.filter((f) => f.type === "image");
    const fileAttachments = attachedFiles.filter((f) => f.type === "file");
    const localTurnId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    const userMsg: Message = {
      role: "user",
      clientId: `user-${localTurnId}`,
      content:
        text || (attachedFiles.length > 0 ? `[${attachedFiles.length} file(s) attached]` : ""),
      attachedImages: imageAttachments.map((f) => f.data),
      attachedFiles: fileAttachments.map((f) => ({ name: f.name, type: f.type })),
      mode: chatMode,
    };

    // ── Operator mode: keep the normal chat flow; render operator output as the assistant reply ──
    if (chatMode === "operator") {
      try {
        await runOperatorTurn({
          text,
          userMsg,
          localTurnId,
          setMessages,
          setInput,
          setAttachedFiles,
          setPendingQuestions,
          setNarrations,
          setClarifyQs,
          setOperatorRunId,
          createOrUpdateConversation,
          saveMessage,
          ownInsertedIdsRef,
        });
      } finally {
        isSubmittingRef.current = false;
      }
      return;
    }

    // ── Images / Video mode: plan first, then sequential generation ──
    if (chatMode === "images" || chatMode === "video") {
      const expectedMediaType = chatMode === "video" ? "video" : "image";
      if (!mediaModel || mediaModel.type !== expectedMediaType) {
        toast.error(
          chatMode === "video" ? "Choose a video model first" : "Choose an image model first",
        );
        isSubmittingRef.current = false;
        return;
      }
      const isStartEnd = chatMode === "video" && videoStartEndMode;
      if (isStartEnd && (!startFrameUrl || !endFrameUrl)) {
        toast.error("Upload both the first and last frame first");
        isSubmittingRef.current = false;
        return;
      }
      try {
        await runMediaTurn({
          text,
          userMsg,
          localTurnId,
          chatMode,
          mediaModel,
          videoStartEndMode,
          startFrameUrl,
          endFrameUrl,
          videoDurationSec,
          setMessages,
          setInput,
          setAttachedFiles,
          setPendingQuestions,
          setIsLoading,
          setIsThinking,
          createOrUpdateConversation,
          saveMessage,
          ownInsertedIdsRef,
        });
      } finally {
        isSubmittingRef.current = false;
      }
      return;
    }

    const assistantMessageIndex = editingIndex !== null ? editingIndex + 1 : messages.length + 1;
    setMessages((prev) => {
      let base = prev;
      if (editingIndex !== null && prev[editingIndex]?.role === "user") {
        base = [...prev];
        base.splice(editingIndex, base[editingIndex + 1]?.role === "assistant" ? 2 : 1);
      }
      return [
        ...base,
        userMsg,
        { role: "assistant", content: "", clientId: `assistant-${localTurnId}`, mode: chatMode },
      ];
    });
    if (editingIndex !== null) {
      setEditingIndex(null);
      setEditingOriginal("");
    }
    const userInput = text;
    setInput("");
    const currentFiles = [...attachedFiles];
    setAttachedFiles([]);
    setIsLoading(true);
    setIsThinking(true);
    setPendingQuestions([]);
    resetToolUi();
    setNarrations([]);
    setClarifyQs(null);
    if (chatMode === "deep-research") {
      setNarrations([]);
    }

    // Slides + Images mode is now routed through the internal premium deck
    // pipeline (chat-slides-stream) further below. The previous external
    // 2slides.com fallback was removed — it depended on a separate paid pool
    // and was unreliable.

    // ── Auto-route to Slides only for explicit creation requests.
    // Mentioning/cancelling slides should remain a normal chat message.
    const SLIDES_KEYWORD_RE =
      /(\b(slides?|presentation|pr[ée]sentation|presentaci[óo]n|pr[äa]sentation|deck|pitch\s*deck|powerpoint|pptx?|keynote|diapositiv[aoe]s?|folien)\b|عرض\s*تقديمي|بريزنتيش?ن|برزنتيش?ن|شرائح|شريحة|سلايد(?:ز|ات)?|بوربوينت|كانفا|عرض\s*شرائح)/i;
    const SLIDES_CREATE_RE =
      /(\b(create|generate|make|build|design|prepare|draft)\b|اعمل|إعمل|انشئ|أنشئ|اصنع|صمم|جهز|حضّر|حضر|عايز|عاوز|اريد|أريد|ابغى|سوي|سوّي)/i;
    const SLIDES_NEGATION_RE =
      /(\b(cancel(?:led)?|stop|don't|do not|not|without)\b|لغيت|الغيت|إلغ|الغاء|إلغاء|وقف|اوقف|مش\s*عايز|مش\s*عاوز|لا\s*تعمل|متعملش|بلاش)/i;
    const shouldAutoStartSlides =
      chatMode === "normal" &&
      SLIDES_KEYWORD_RE.test(userInput) &&
      SLIDES_CREATE_RE.test(userInput) &&
      !SLIDES_NEGATION_RE.test(userInput);
    if (shouldAutoStartSlides) {
      setChatMode("slides");
    }

    // ── Slides mode: stream from chat-slides-stream and attach a SlideDeck ─
    if (chatMode === "slides" || chatMode === "slides-images" || shouldAutoStartSlides) {
      try {
        await runSlidesTurn({
          userInput,
          localTurnId,
          chatUserId,
          slidesTemplate,
          setChatMode,
          setSearchEnabled,
          setIsLoading,
          setIsThinking,
          resetToolUi,
          setMessages,
          setSearchStatus,
          createOrUpdateConversation,
          saveMessage,
          ownInsertedIdsRef,
          fetchSlidesNarration,
          insertAssistantNarration,
          clearSlidesTimeout,
          slidesTimeoutsRef,
          slidesGenerationTokenRef,
        });
      } finally {
        isSubmittingRef.current = false;
      }
      return;
    }

    // ── @docs agent: server-backed background job; survives tab close ───
    if (selectedAgent?.id === "docs") {
      const handled = await runDocsTurn({
        userInput,
        localTurnId,
        chatUserId,
        navigate,
        messages,
        setMessages,
        setSearchStatus,
        setIsLoading,
        setIsThinking,
        resetToolUi,
        startDocsStatusFallback,
        stopDocsStatusFallback,
        createOrUpdateConversation,
        saveMessage,
        ownInsertedIdsRef,
      });
      isSubmittingRef.current = false;
      if (handled) return;
      return;
    }

    const conversationPromise = createOrUpdateConversation(
      userInput || (currentFiles.length > 0 ? `[${currentFiles.length} file(s)]` : "New chat"),
    ).catch(() => null);

    void conversationPromise.then(async (resolvedConversationId) => {
      if (!resolvedConversationId) return;
      const insertedId = await saveMessage(
        resolvedConversationId,
        "user",
        userInput || `[${currentFiles.length} file(s) attached]`,
      );
      if (insertedId) {
        ownInsertedIdsRef.current.add(insertedId);
        window.dispatchEvent(new CustomEvent("megsy:conversations-changed"));
        // Attach id to last user message locally so dedup by id works for echo
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.clientId === `user-${localTurnId}`);
          if (idx < 0) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], id: insertedId, user_id: chatUserId || undefined };
          return next;
        });
      }
      // Notify mentioned members
      if (members.length > 0 && userInput) {
        const mentions = Array.from(
          new Set(
            (userInput.match(/@([A-Za-z0-9_]+)/g) || []).map((m) => m.slice(1).toLowerCase()),
          ),
        );
        if (mentions.length > 0) {
          for (const mb of members) {
            if (!mb.name || mb.id === chatUserId) continue;
            const safe = mb.name.replace(/\s+/g, "_").toLowerCase();
            if (mentions.includes(safe)) {
              await supabase.rpc("create_notification" as any, {
                p_user_id: mb.id,
                p_type: "mention",
                p_title: `${userName || "Someone"} mentioned you`,
                p_message: userInput.slice(0, 140),
                p_metadata: { conversation_id: resolvedConversationId },
              });
            }
          }
        }
      }
    });

    await runChatStreamTurn({
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
    });
  };

  useEffect(() => {
    sendWithTextRef.current = handleSendWithText;
  });

  const handleSend = () => handleSendWithText();

  // After signup, auto-send the prompt the user typed on the landing page.
  usePostSignupPrompt(handleSendWithText);

  const handleNewChat = useChatNewChat({
    slidesGenerationTokenRef,
    slidesTimeoutsRef,
    studyAudioRef,
    setStudyTimers,
    setStudyMusic,
    setMessages,
    setConversationId,
    setConversationTitle,
    setIsLoading,
    setIsThinking,
    setAttachedFiles,
    resetToolUi,
    setChatMode,
    setSearchEnabled,
    setComputerUseEnabled,
    setIsShared,
    setShareId,
    setShareMode,
    setIsPinned,
    setPendingQuestions,
    setSelectedModel,
    setSelectedAgent,
    isSubmittingRef,
  });

  useEffect(() => {
    if (chatMode === "learning") return;
    if (studyAudioRef.current) {
      studyAudioRef.current.pause();
      studyAudioRef.current.src = "";
    }
    setStudyMusic({ kind: null });
    setStudyTimers([]);
  }, [chatMode]);

  const { handleFileUpload, handleImageUpload, handleCameraCapture } = useComposerUploads({
    attachedFiles,
    setAttachedFiles,
    conversationId,
    createOrUpdateConversation,
  });

  const {
    handleShare,
    handleCreateShareLink,
    handleCopyShareLink,
    handleRename,
    handleTogglePin,
    performTogglePin,
    handleInvite,
    handleSendInviteEmail,
    handleGenerateInviteLink,
    handleCopyInviteLink,
  } = useChatSocialActions({
    conversationId,
    shareMode,
    shareId,
    isShared,
    generatedShareUrl,
    setShareDialogOpen,
    setIsShared,
    setShareId,
    setGeneratedShareUrl,
    renameValue,
    setConversationTitle,
    setIsRenaming,
    isPinned,
    setIsPinned,
    inviteEmail,
    inviteLink,
    setInviteDialogOpen,
    setInviteLink,
    setInviteEmail,
    setInviteLoading,
    setMembers,
  });

  const composerModeBarChange = useMobileModeBarChange({
    selectedAgent,
    setSelectedAgent,
    setSelectedModel,
    setChatMode,
    handleModeChange,
    tryActivateMegsyOs,
  });

  const openInviteFlow = useCallback(async () => {
    if (!conversationId) {
      toast.error("Start a conversation first");
      return;
    }
    setInviteLink(null);
    setInviteEmail("");
    const user = await getCachedUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("conversation_invites")
      .insert({ conversation_id: conversationId, invited_by: user.id } as any)
      .select("invite_token")
      .single();
    if (!error && data) {
      setInviteLink(`${window.location.origin}/invite/${(data as any).invite_token}`);
    }
  }, [conversationId, setInviteLink, setInviteEmail]);

  useChatEntryEffects({
    conversationId,
    location,
    navigate,
    loadConversation,
    setConversationId,
    setConversationTitle,
    setMessages,
  });

  useRealtimeMembers({
    conversationId,
    chatUserId,
    setMembers,
    setSystemEvents,
    onSelfRemoved: handleNewChat,
  });

  // playNotificationSound extracted into ./utils/notificationSound

  useRealtimeChat({
    conversationId,
    chatUserId,
    messagesContainerRef,
    ownInsertedIdsRef,
    presenceChannelRef,
    scrollToBottom,
    playNotificationSound,
    setMessages,
    setNewMessagesCount,
    setUnreadCount,
    setTypingUsers,
    setRemoteAiBusy,
    setOnlineUsers,
  });

  // Throttled typing broadcast (extracted into hook).
  useTypingPresence({ input, chatUserId, userName, presenceChannelRef });

  const handleKickMember = useKickMember({ conversationId, members, setMembers });

  const {
    memberMap,
    readersByMessageId,
    lastMessageIdx,
    lastAssistantIdx,
    showReadersIdx,
    hasMembers,
  } = useMessageDerivations({
    members,
    chatUserId,
    userName,
    messages,
    messageReads,
  });
  const dismissOperatorRun = useCallback(() => setOperatorRunId(null), [setOperatorRunId]);

  // Load reactions + reads for current conversation, subscribe to realtime
  useReadsAndReactions({
    conversationId,
    chatUserId,
    messages,
    markedReadRef,
    setMessageReads,
    setMessageReactions,
  });

  // Mirror unread count into the document title while the tab is hidden.
  useUnreadDocumentTitle({ unreadCount, originalTitleRef, setUnreadCount });

  const toggleReaction = useMessageReactionToggle({
    conversationId,
    chatUserId,
    messageReactions,
    setMessageReactions,
    setReactionPickerFor,
  });

  // Mention detection + insertion (extracted into hook).
  const { mentionQuery, insertMention } = useMentionDetection({
    input,
    setInput,
    membersCount: members.length,
  });

  const confirmDelete = useDeleteConversation({
    conversationId,
    setIsDeleting,
    onDeleted: () => handleNewChat(),
  });

  const {
    editingIndex,
    setEditingIndex,
    editingOriginal,
    setEditingOriginal,
    handleEditUserMessageAt,
    cancelEdit,
  } = useMessageEdit({ setInput });

  const hasConversation = messages.length > 0;

  const { integrationCategories, filteredIntegrations } = useIntegrationsFilter(
    integrationsQuery,
    integrationsCategory,
  );
  // integrationGradient extracted into ./utils/integrationGradient
  const connectIntegration = useConnectIntegration({
    connectingApp,
    setConnectingApp,
    setPlusMenuOpen,
    navigate,
  });

  const renderPlusContent = () => (
    <PlusContent
      plusView={plusView as any}
      setPlusView={setPlusView as any}
      setPlusMenuOpen={setPlusMenuOpen}
      chatMode={chatMode}
      cameraInputRef={cameraInputRef}
      imageInputRef={imageInputRef}
      fileInputRef={fileInputRef}
      musicFileInputRef={musicFileInputRef}
      studyAudioRef={studyAudioRef}
      searchEnabled={searchEnabled}
      handleSearchToggle={handleSearchToggle}
      studyMusic={studyMusic}
      setStudyMusic={setStudyMusic}
      userTracks={userTracks}
      uploadingMusic={uploadingMusic}
      playUserTrack={playUserTrack}
      deleteUserTrack={deleteUserTrack}
      handleMusicUpload={handleMusicUpload}
      timerInputMin={timerInputMin}
      setTimerInputMin={setTimerInputMin}
      setStudyTimers={setStudyTimers}
      scrollToBottom={scrollToBottom}
      megsyTier={megsyTier as any}
      setMegsyTier={setMegsyTier as any}
      userPlan={userPlan}
      chatUserId={chatUserId}
      mySkills={mySkills}
      librarySkills={librarySkills}
      toggleEnabled={toggleEnabled}
      navigate={navigate}
      integrationCategories={integrationCategories}
      integrationsCategory={integrationsCategory}
      setIntegrationsCategory={setIntegrationsCategory}
      integrationsQuery={integrationsQuery}
      filteredIntegrations={filteredIntegrations}
      userIntegrations={userIntegrations as any}
      connectingApp={connectingApp}
      brokenLogos={brokenLogos}
      setBrokenLogos={setBrokenLogos}
      connectIntegration={connectIntegration}
    />
  );

  // Desktop-only popover. The mobile bottom sheet is rendered ONCE globally
  // (see <GlassSheet> near the end of the tree) so it never double-mounts.
  const renderPlusMenu = () => {
    // Mobile uses the GlassSheet below; skip the desktop popover entirely
    // on small viewports — rendering both was the source of the "+" lag.
    if (isMobileViewport) return null;
    const openUp = hasConversation || messages.length > 0;
    return (
      <>
        {/* Desktop: backdrop to close on outside click */}
        <div
          className="hidden md:block fixed inset-0 z-[55]"
          onClick={() => setPlusMenuOpen(false)}
        />
        {/* Desktop: anchored popover below input */}
        <motion.div
          initial={{ opacity: 0, y: openUp ? 6 : -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: openUp ? 6 : -6, scale: 0.98 }}
          transition={{ duration: 0.16, ease: [0.22, 0.9, 0.3, 1] }}
          data-plus-menu
          onClick={(e) => e.stopPropagation()}
          style={{
            maxHeight: "min(72vh, 600px)",
            background: "#000000",
            color: "hsl(var(--brand-parchment))",
          }}
          className={`hidden md:flex absolute left-2 ${openUp ? "bottom-full mb-2" : "top-full mt-0.5"} origin-bottom-left z-overlay w-[300px] rounded-2xl border-[1.5px] border-brand-ink shadow-[4px_4px_0_rgba(0,0,0,0.45)] overflow-y-auto overscroll-contain p-1.5 flex-col`}
        >
          {renderPlusContent()}
        </motion.div>

      </>
    );
  };

  const removeAttachment = useCallback(
    (index: number) => setAttachedFiles((prev) => prev.filter((_, idx) => idx !== index)),
    [setAttachedFiles],
  );

  const seoMeta = getSeoMeta(chatMode);

  const renderMobileServicePanel = () => (
    <MobileServicePanelRenderer
      selectedAgent={selectedAgent}
      chatMode={chatMode}
      setChatMode={setChatMode}
      setSelectedAgent={setSelectedAgent}
      setSelectedModel={setSelectedModel}
      slidesTemplate={slidesTemplate}
      setSlidesPickerOpen={setSlidesPickerOpen}
      videoStartEndMode={videoStartEndMode}
      setVideoStartEndMode={setVideoStartEndMode}
      startFrameUrl={startFrameUrl}
      endFrameUrl={endFrameUrl}
      setStartFrameUrl={setStartFrameUrl}
      setEndFrameUrl={setEndFrameUrl}
      frameUploading={frameUploading}
      setFrameUploading={setFrameUploading}
      uploadFrame={uploadFrame}
      setVideoDurationSec={setVideoDurationSec}
      tierMenuOpen={tierMenuOpen}
      setTierMenuOpen={setTierMenuOpen}
      selectedModel={selectedModel}
      megsyTier={megsyTier}
      setMegsyTier={setMegsyTier}
      userPlan={userPlan}
      mediaModel={mediaModel}
      setMediaModel={setMediaModel}
      researchDepth={researchDepth}
      setResearchDepth={setResearchDepth}
    />
  );

  const hasMobileServicePanel =
    selectedAgent?.id === "docs" ||
    chatMode === "learning" ||
    chatMode === "slides" ||
    chatMode === "slides-images" ||
    chatMode === "images" ||
    chatMode === "video" ||
    chatMode === "deep-research";

  return (
    <>
      <SEOHead title={seoMeta.title} description={seoMeta.description} path={seoMeta.path} />

      {/* Megsy Operator now renders as a tiny inline pill above the input — see below. */}
      <div
        data-shell="manus"
        data-skin="claude"
        className="flex bg-transparent overflow-hidden relative"
        style={{ height: "calc(100dvh - var(--promo-banner-h, 0px))" }}
      >
        {/* Desktop persistent sidebar */}
        <aside
          data-chat-sidebar="true"
          style={{
            width: !sidebarCollapsed ? 280 : 60,
            backgroundColor: "#000000",
            borderRightColor: "hsl(var(--surface-4))",
          }}
          className="theme-fixed hidden md:flex shrink-0 overflow-hidden border-r transition-[width] duration-200 ease-out"
        >
          <AppSidebar
            inline
            open
            forceExpanded={false}
            onClose={() => {}}
            onNewChat={handleNewChat}
            onSelectConversation={loadConversation}
            activeConversationId={conversationId}
            currentMode={
              chatMode === "learning"
                ? "learning"
                : chatMode === "deep-research"
                  ? "research"
                  : chatMode === "shopping"
                    ? "shopping"
                    : chatMode === "slides" || chatMode === "slides-images"
                      ? "slides"
                      : chatMode === "images"
                        ? "images"
                        : chatMode === "video"
                          ? "videos"
                          : (chatMode as string) === "website" ||
                              (chatMode as string) === "coding" ||
                              (chatMode as string) === "code"
                            ? "code"
                            : "chat"
            }
          />
        </aside>

        <div className="chat-surface-dark flex-1 flex flex-col min-w-0 relative overflow-hidden bg-transparent text-foreground md:!bg-black md:!text-[hsl(var(--brand-parchment))]">
          {/* Mobile animated blue gradient background */}
          <div className="md:hidden chat-mobile-blue-bg" aria-hidden="true" />
          {/* Mobile drawer sidebar */}
          <div className="md:hidden">
            <AppSidebar
              open={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
              onNewChat={handleNewChat}
              onSelectConversation={loadConversation}
              activeConversationId={conversationId}
              currentMode={
                chatMode === "learning"
                  ? "learning"
                  : chatMode === "deep-research"
                    ? "research"
                    : chatMode === "shopping"
                      ? "shopping"
                      : chatMode === "slides" || chatMode === "slides-images"
                        ? "slides"
                        : chatMode === "images"
                          ? "images"
                          : chatMode === "video"
                            ? "videos"
                            : (chatMode as string) === "website" ||
                                (chatMode as string) === "coding" ||
                                (chatMode as string) === "code"
                              ? "code"
                              : "chat"
              }
            />
          </div>

          {/* Mobile-only header — Luma Neutral */}
          <MobileChatHeaderMount
            conversationTitle={conversationTitle}
            conversationId={conversationId}
            hasConversation={hasConversation}
            isPinned={isPinned}
            isDeleting={isDeleting}
            setSidebarOpen={setSidebarOpen}
            handleNewChat={handleNewChat}
            handleShare={handleShare}
            handleInvite={handleInvite}
            setRenameValue={setRenameValue}
            performTogglePin={performTogglePin}
            confirmDelete={confirmDelete}
            chatMode={chatMode}
            tierMenuOpen={tierMenuOpen}
            setTierMenuOpen={setTierMenuOpen}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            megsyTier={megsyTier}
            setMegsyTier={setMegsyTier}
            userPlan={userPlan}
            mediaModel={mediaModel}
            setMediaModel={setMediaModel}
            chatUserId={chatUserId}
            renameValue={renameValue}
            handleRename={handleRename}
            inviteEmail={inviteEmail}
            setInviteEmail={setInviteEmail}
            inviteLink={inviteLink}
            setInviteLink={setInviteLink}
            inviteLoading={inviteLoading}
            handleSendInviteEmail={handleSendInviteEmail}
            handleCopyInviteLink={handleCopyInviteLink}
            shareMode={shareMode}
            setShareMode={setShareMode}
            generatedShareUrl={generatedShareUrl}
            setGeneratedShareUrl={setGeneratedShareUrl}
            handleCreateShareLink={handleCreateShareLink}
            handleCopyShareLink={handleCopyShareLink}
          />

          {/* Desktop/mobile combined header: title dropdown, Unlock Pro, options */}
          <DesktopChatHeader
            hasConversation={hasConversation}
            userPlan={userPlan}
            navigate={navigate}
            setSidebarOpen={setSidebarOpen}
            conversationId={conversationId}
            conversationTitle={conversationTitle}
            isPinned={isPinned}
            isDeleting={isDeleting}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            inviteEmail={inviteEmail}
            setInviteEmail={setInviteEmail}
            inviteLink={inviteLink}
            inviteLoading={inviteLoading}
            shareMode={shareMode}
            setShareMode={setShareMode}
            generatedShareUrl={generatedShareUrl}
            setGeneratedShareUrl={setGeneratedShareUrl}
            chatMenuView={chatMenuView}
            setChatMenuView={setChatMenuView}
            onNewChat={handleNewChat}
            onTogglePin={performTogglePin}
            onRename={handleRename}
            onSendInvite={handleSendInviteEmail}
            onCopyInviteLink={handleCopyInviteLink}
            onCopyShareLink={handleCopyShareLink}
            onCreateShareLink={handleCreateShareLink}
            onOpenInvite={openInviteFlow}
            onConfirmDelete={confirmDelete}
          />

          {/* Scrollable messages area (welcome → loading → transcript) */}
          <ChatMessagesArea
            ref={messagesEndRef}
            loadingMessages={loadingMessages}
            messages={messages}
            messagesContainerRef={messagesContainerRef}
            handleScroll={handleScroll}
            showScrollBtn={showScrollBtn}
            newMessagesCount={newMessagesCount}
            scrollToBottom={scrollToBottom}
            userName={userName}
            isFirstVisit={isFirstVisit}
            returningGreetingIdx={returningGreetingIdx}
            plusMenuOpen={plusMenuOpen}
            renderPlusMenu={renderPlusMenu}
            mobileLandingProps={{
              input,
              setInput,
              handleSend,
              isLoading,
              activeResearchJobId,
              selectedModel,
              setSelectedModel,
              megsyTier,
              userPlan,
              userName,
              plusMenuOpen,
              setPlusMenuOpen,
              setPlusView,
              hasMobileServicePanel,
              renderMobileServicePanel,
              chatMode,
              selectedAgent,
              setSelectedAgent,
              setChatMode,
              handleModeChange,
              tryActivateMegsyOs,
              setSlidesPickerOpen,
            }}
            messagesListProps={{
              messages,
              editingIndex,
              chatMode,
              studyTimers,
              setStudyTimers,
              systemEvents,
              typingUsers,
              colorForUser,
              chatUserId,
              conversationId,
              conversationTitle,
              isLoading,
              isThinking,
              searchStatus,
              toolActivity,
              parallelTasks,
              narrations,
              hasMembers,
              messageReactions,
              readersByMessageId,
              showReadersIdx,
              lastMessageIdx,
              handleLikeMessage,
              handleStructuredAction,
              handleEditUserMessageAt,
              handleResearchRunningChange,
              dismissOperatorRun,
              toggleReaction,
              setMessages,
              setInput,
              setIsLoading,
              setIsThinking,
              setSearchStatus,
              setChatMode,
              resetToolUi,
              startDocsStatusFallback,
              stopDocsStatusFallback,
              saveMessage,
              handleSendWithText,
            }}
          />

          {/* Floating bottom composer dock with attachments + mode bar + chips */}
          <ChatComposerSection
            sidebarCollapsed={sidebarCollapsed}
            loadingMessages={loadingMessages}
            messagesLength={messages.length}
            attachedFiles={attachedFiles}
            removeAttachment={removeAttachment}
            remoteAiBusy={remoteAiBusy}
            plusMenuOpen={plusMenuOpen}
            renderPlusMenu={renderPlusMenu}
            mentionQuery={mentionQuery}
            members={members}
            onlineUsers={onlineUsers}
            colorForUser={colorForUser}
            insertMention={insertMention}
            navigate={navigate}
            desktopGreeting={
              <DesktopGreeting
                userName={userName}
                isFirstVisit={isFirstVisit}
                returningGreetingIdx={returningGreetingIdx}
              />
            }
            composerMobileModeBarProps={{
              selectedAgent,
              chatMode,
              editingIndex,
              hasMobileServicePanel,
              renderMobileServicePanel,
              composerModeBarChange,
            }}
            composerAnimatedInputProps={{
              input,
              setInput,
              handleSend,
              handleCancel,
              plusMenuOpen,
              setPlusMenuOpen,
              setPlusView,
              isLoading,
              remoteAiBusy,
              activeResearchJobId,
              pendingQuestions,
              handleQuestionAnswer,
              handleQuestionSkip,
              chatMode,
              setChatMode,
              selectedAgent,
              setSelectedAgent,
              selectedModel,
              setSelectedModel,
              setSearchEnabled,
              handleModeChange,
              tryActivateMegsyOs,
              editingIndex,
              cancelEdit,
              isMobileViewport,
              tierMenuOpen,
              setTierMenuOpen,
              megsyTier,
              setMegsyTier,
              userPlan,
              mediaModel,
              setMediaModel,
              chatUserId,
              slidesTemplate,
              setSlidesPickerOpen,
              researchDepth,
              setResearchDepth,
              researchDepthOpen,
              setResearchDepthOpen,
            }}
            desktopModeChipsProps={{
              chatMode,
              selectedAgent,
              handleModeChange,
              setChatMode,
              setSelectedAgent,
              tryActivateMegsyOs,
              setInput,
            }}
          />

          <ChatHiddenFileInputs
            fileInputRef={fileInputRef}
            cameraInputRef={cameraInputRef}
            imageInputRef={imageInputRef}
            handleFileUpload={handleFileUpload}
            handleCameraCapture={handleCameraCapture}
            handleImageUpload={handleImageUpload}
          />

          <ChatGlobalModals
            connectorsOpen={connectorsOpen}
            setConnectorsOpen={setConnectorsOpen}
            directoryOpen={directoryOpen}
            setDirectoryOpen={setDirectoryOpen}
            slidesPickerOpen={slidesPickerOpen}
            setSlidesPickerOpen={setSlidesPickerOpen}
            slidesTemplate={slidesTemplate}
            setSlidesTemplate={setSlidesTemplate}
            navigate={navigate}
          />

          {/* Mobile plus menu — single always-mounted vaul sheet (pure black, draggable) */}
          <GlassSheet open={plusMenuOpen && isMobileViewport} onOpenChange={setPlusMenuOpen}>
            <GlassSheetContent
              overlayClassName="bg-black/0 backdrop-blur-0"
              contentClassName="px-0 pt-1 bg-surface-1"
              className="bg-surface-1 border-t-[2.5px] border-brand-ink shadow-[0_-4px_0_rgba(59,130,246,0.18)]"
              style={{
                background: "hsl(var(--surface-1))",
                backdropFilter: "none",
                WebkitBackdropFilter: "none",
              }}
            >
              <div ref={plusSheetScrollRef} data-plus-menu className="px-3 pt-1 pb-3 touch-pan-y">
                {renderPlusContent()}
              </div>
            </GlassSheetContent>
          </GlassSheet>
          <ChatDialogs
            shareDialogOpen={shareDialogOpen}
            setShareDialogOpen={setShareDialogOpen}
            shareMode={shareMode}
            setShareMode={setShareMode}
            generatedShareUrl={generatedShareUrl}
            setGeneratedShareUrl={setGeneratedShareUrl}
            handleCreateShareLink={handleCreateShareLink}
            handleCopyShareLink={handleCopyShareLink}
            isRenaming={isRenaming}
            setIsRenaming={setIsRenaming}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            handleRename={handleRename}
            inviteDialogOpen={inviteDialogOpen}
            setInviteDialogOpen={setInviteDialogOpen}
            inviteEmail={inviteEmail}
            setInviteEmail={setInviteEmail}
            inviteLink={inviteLink}
            setInviteLink={setInviteLink}
            inviteLoading={inviteLoading}
            handleSendInviteEmail={handleSendInviteEmail}
            handleCopyInviteLink={handleCopyInviteLink}
            members={members}
            chatUserId={chatUserId}
            conversationOwnerId={conversationOwnerId}
            onlineUsers={onlineUsers}
            colorForUser={colorForUser}
            handleKickMember={handleKickMember}
          />
        </div>
      </div>
      <MegsyOsIntro
        open={megsyOsIntroOpen}
        onClose={() => setMegsyOsIntroOpen(false)}
        isProPlusPlan={isProPlusPlan}
        navigate={navigate}
        handleModeChange={handleModeChange}
      />
    </>
  );
};

export default ChatPage;
