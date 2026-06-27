CREATE INDEX IF NOT EXISTS idx_service_status_name_checked ON public.service_status(service_name, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conv_role_created ON public.messages(conversation_id, role, created_at DESC) WHERE images IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_user_workspace ON public.conversations(user_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_conversations_user_mode_pinned_updated ON public.conversations(user_id, mode, is_pinned DESC, updated_at DESC) WHERE workspace_id IS NULL;