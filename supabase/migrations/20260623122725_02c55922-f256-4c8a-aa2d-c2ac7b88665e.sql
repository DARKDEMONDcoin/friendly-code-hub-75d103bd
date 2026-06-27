
-- Add user_id indexes for all tables missing them (33 tables)
CREATE INDEX IF NOT EXISTS idx_agent_messages_user_id ON public.agent_messages (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_project_snapshots_user_id ON public.ai_project_snapshots (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_project_usage_user_id ON public.ai_project_usage (user_id);
CREATE INDEX IF NOT EXISTS idx_app_kv_user_id ON public.app_kv (user_id);
CREATE INDEX IF NOT EXISTS idx_books_user_id ON public.books (user_id);
CREATE INDEX IF NOT EXISTS idx_e2b_keys_user_id ON public.e2b_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_user_id ON public.email_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_generated_songs_user_id ON public.generated_songs (user_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_id ON public.generation_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_key_usage_log_user_id ON public.key_usage_log (user_id);
CREATE INDEX IF NOT EXISTS idx_media_generation_log_user_id ON public.media_generation_log (user_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON public.message_reactions (user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_clients_user_id ON public.oauth_clients (user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_user_id ON public.oauth_codes (user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_id ON public.oauth_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_pptx_jobs_user_id ON public.pptx_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_processed_orders_user_id ON public.processed_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_project_custom_domains_user_id ON public.project_custom_domains (user_id);
CREATE INDEX IF NOT EXISTS idx_project_versions_user_id ON public.project_versions (user_id);
CREATE INDEX IF NOT EXISTS idx_research_sessions_user_id ON public.research_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_user_id ON public.revenue_ledger (user_id);
CREATE INDEX IF NOT EXISTS idx_security_findings_user_id ON public.security_findings (user_id);
CREATE INDEX IF NOT EXISTS idx_security_memory_user_id ON public.security_memory (user_id);
CREATE INDEX IF NOT EXISTS idx_security_scans_user_id ON public.security_scans (user_id);
CREATE INDEX IF NOT EXISTS idx_skill_files_user_id ON public.skill_files (user_id);
CREATE INDEX IF NOT EXISTS idx_slide_projects_user_id ON public.slide_projects (user_id);
CREATE INDEX IF NOT EXISTS idx_user_gallery_user_id ON public.user_gallery (user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_join_requests_user_id ON public.workspace_join_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_member_status_user_id ON public.workspace_member_status (user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_notification_prefs_user_id ON public.workspace_notification_prefs (user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_task_comments_user_id ON public.workspace_task_comments (user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_usage_user_id ON public.workspace_usage (user_id);
CREATE INDEX IF NOT EXISTS idx_youtube_conversations_user_id ON public.youtube_conversations (user_id);

-- Hot-path composite indexes for scale
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, created_at DESC) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_created ON public.credit_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_user_created ON public.media_assets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON public.projects (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON public.subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON public.workspace_members (user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_tasks_workspace_status ON public.workspace_tasks (workspace_id, status);

-- Background jobs dispatcher: pending queue scan
CREATE INDEX IF NOT EXISTS idx_background_jobs_pending ON public.background_jobs (kind, created_at) WHERE status = 'pending';

-- Pending video jobs polling
CREATE INDEX IF NOT EXISTS idx_pending_video_jobs_status_created ON public.pending_video_jobs (status, created_at);

-- Research jobs active polling
CREATE INDEX IF NOT EXISTS idx_research_jobs_active ON public.research_jobs (status, updated_at) WHERE status IN ('queued','running','processing');
