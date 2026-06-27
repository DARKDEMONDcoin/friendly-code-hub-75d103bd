CREATE INDEX IF NOT EXISTS idx_system_skills_active_order ON public.system_skills(is_active, display_order) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_skills_public_created ON public.skills(created_at DESC) WHERE workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_asc ON public.messages(conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_messages_role_created ON public.messages(role, created_at DESC) WHERE conversation_id IS NOT NULL;