
-- Messages: most expensive table in slow queries
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_role_created ON public.messages (role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages (created_at DESC);

-- Conversations: user list queries
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON public.conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user_mode_pinned ON public.conversations (user_id, mode, is_pinned DESC, updated_at DESC) WHERE workspace_id IS NULL;

-- Service status: latest status per service
CREATE INDEX IF NOT EXISTS idx_service_status_name_checked ON public.service_status (service_name, checked_at DESC);

-- System skills: active sorted list
CREATE INDEX IF NOT EXISTS idx_system_skills_active_order ON public.system_skills (is_active, display_order) WHERE is_active = true;

-- Skills: workspace listing
CREATE INDEX IF NOT EXISTS idx_skills_workspace_created ON public.skills (workspace_id, created_at DESC);

-- Background jobs: pending dispatcher polling
CREATE INDEX IF NOT EXISTS idx_background_jobs_kind_status_created ON public.background_jobs (kind, status, created_at);

-- Agent runs: agent activity feed
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_id ON public.agent_runs (agent_id);

-- Research jobs lookups
CREATE INDEX IF NOT EXISTS idx_research_jobs_user_created ON public.research_jobs (user_id, created_at DESC);
