import { forwardRef } from "react";
import { ChatMessageItem } from "./ChatMessageItem";
import { StudyTimersOverlay } from "./StudyTimersOverlay";
import { SystemEventsList } from "./SystemEventsList";
import { TypingIndicator } from "./TypingIndicator";
import type { ChatMode } from "../chatConstants";

interface ChatMessagesListProps {
  messages: any[];
  editingIndex: number | null;
  chatMode: ChatMode;
  studyTimers: any;
  setStudyTimers: any;
  systemEvents: any[];
  typingUsers: any;
  colorForUser: any;
  // ChatMessageItem props
  chatUserId: string | null;
  conversationId: string | null;
  conversationTitle: string;
  isLoading: boolean;
  isThinking: boolean;
  searchStatus: any;
  toolActivity: any;
  parallelTasks: any;
  narrations: any;
  hasMembers: boolean;
  messageReactions: any;
  readersByMessageId: any;
  showReadersIdx: any;
  lastMessageIdx: number;
  handleLikeMessage: any;
  handleStructuredAction: any;
  handleEditUserMessageAt: any;
  handleResearchRunningChange: any;
  dismissOperatorRun: any;
  toggleReaction: any;
  setMessages: any;
  setInput: any;
  setIsLoading: any;
  setIsThinking: any;
  setSearchStatus: any;
  setChatMode: any;
  resetToolUi: any;
  startDocsStatusFallback: any;
  stopDocsStatusFallback: any;
  saveMessage: any;
  handleSendWithText: any;
}

export const ChatMessagesList = forwardRef<HTMLDivElement, ChatMessagesListProps>(
  function ChatMessagesList(props, messagesEndRef) {
    const {
      messages,
      editingIndex,
      chatMode,
      studyTimers,
      setStudyTimers,
      systemEvents,
      typingUsers,
      colorForUser,
      ...itemProps
    } = props;

    return (
      <div
        className="max-w-3xl mx-auto pt-20 pb-56 md:pb-64 px-4 md:px-6 space-y-2"
        style={editingIndex !== null ? { visibility: "hidden" } : undefined}
      >
        {messages.map((msg, i) => (
          <ChatMessageItem
            key={msg.clientId || msg.id || `idx-${i}`}
            msg={msg}
            i={i}
            messages={messages}
            colorForUser={colorForUser}
            {...(itemProps as any)}
          />
        ))}
        {chatMode === "learning" && (
          <StudyTimersOverlay timers={studyTimers} setTimers={setStudyTimers} />
        )}

        <SystemEventsList events={systemEvents} />

        <TypingIndicator typingUsers={typingUsers} colorForUser={colorForUser} />
        <div ref={messagesEndRef} />
      </div>
    );
  },
);
