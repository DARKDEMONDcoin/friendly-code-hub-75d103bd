
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_role_created_images
  ON public.messages (role, created_at DESC)
  WHERE images IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_created_at
  ON public.messages (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_embedding_null
  ON public.messages (id)
  WHERE embedding IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_user_pinned_updated
  ON public.conversations (user_id, is_pinned DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_user_mode_updated
  ON public.conversations (user_id, mode, updated_at DESC)
  WHERE workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_status_name_checked
  ON public.service_status (service_name, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_skills_active_order
  ON public.system_skills (display_order)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_skills_global_created
  ON public.skills (created_at DESC)
  WHERE workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_background_jobs_kind_status_created
  ON public.background_jobs (kind, status, created_at);

CREATE INDEX IF NOT EXISTS idx_background_jobs_user_status_updated
  ON public.background_jobs (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_jobs_user_status_updated
  ON public.research_jobs (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_key_usage_log_created_at
  ON public.key_usage_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_created_severity
  ON public.security_audit_log (created_at DESC, severity);

CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_enqueued
  ON public.dead_letter_jobs (enqueued_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_started
  ON public.agent_runs (agent_id, started_at DESC);

-- retention: service_status grows unboundedly (146k+ inserts visible)
DELETE FROM public.service_status
 WHERE checked_at < now() - interval '7 days';
