-- =============================================================
-- FIX: Add all columns missing from project qjsnwefgzmmpsuzjfniu
-- Run this once in: Supabase Dashboard → SQL Editor → New Query
-- Every statement uses IF NOT EXISTS / DROP IF EXISTS, so it is
-- safe to run more than once.
-- =============================================================


-- ── 1. phone, website and other base columns (migration 20240610) ─────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS confidence_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;


-- ── 2. Pipeline stage tracking (migration 20240613) ───────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'scraped',
  ADD COLUMN IF NOT EXISTS pipeline_updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS pipeline_error TEXT;

-- Backfill so existing rows have a stage
UPDATE public.leads
SET
  pipeline_stage      = COALESCE(pipeline_stage, 'scraped'),
  pipeline_updated_at = COALESCE(pipeline_updated_at, now())
WHERE pipeline_stage IS NULL OR pipeline_updated_at IS NULL;

-- Pipeline stage check constraint (full set including automation stages)
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_pipeline_stage_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_pipeline_stage_check
  CHECK (pipeline_stage IN (
    'scraped','verified','enriched','researched',
    'email_drafted','approval_pending','approved','queued',
    'sent','replied','followup_due','completed',
    'failed','call_list'
  ));

CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage      ON public.leads(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_updated_at ON public.leads(pipeline_updated_at DESC);


-- ── 3. Email verification reason (migration 20240614) ─────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS email_verification_reason TEXT;

-- email_verified was already added in step 1; this is a no-op if already present
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;


-- ── 4. Email source + confidence, call_list lane (migration 20240615) ─────────
-- Allow NULL email (phone-only / call_list leads have no email yet)
ALTER TABLE public.leads
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS email_source TEXT,
  ADD COLUMN IF NOT EXISTS email_confidence TEXT;

COMMENT ON COLUMN public.leads.email_source     IS 'maps_csv | website_mailto | website_visible | bing | domain_guess | manual';
COMMENT ON COLUMN public.leads.email_confidence IS 'high | medium | low';
COMMENT ON COLUMN public.leads.pipeline_stage   IS 'call_list = scraped from Maps with phone but no email yet';


-- ── 5. Automation scoring columns (migration 20240616) ────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS automation_score INTEGER,
  ADD COLUMN IF NOT EXISTS automation_fit_reason TEXT,
  ADD COLUMN IF NOT EXISTS automation_risk TEXT,
  ADD COLUMN IF NOT EXISTS automation_recommended_action TEXT,
  ADD COLUMN IF NOT EXISTS automation_review_required BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS automation_last_scored_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS automation_rejected_reason TEXT;


-- ── 6. Hybrid agent columns (migration 20240617) ──────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS agent_confidence TEXT,
  ADD COLUMN IF NOT EXISTS agent_risk TEXT,
  ADD COLUMN IF NOT EXISTS agent_recommended_action TEXT,
  ADD COLUMN IF NOT EXISTS agent_email_angle TEXT,
  ADD COLUMN IF NOT EXISTS agent_draft_allowed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS agent_auto_send_allowed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS agent_last_run_at TIMESTAMPTZ;


-- ── 7. Supporting tables (migration 20240616) ─────────────────────────────────

-- touch_updated_at() helper (may already exist)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.automation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  automation_mode TEXT NOT NULL DEFAULT 'assisted',
  provider TEXT NOT NULL DEFAULT 'groq',
  daily_send_limit INTEGER NOT NULL DEFAULT 500,
  per_account_daily_limit INTEGER NOT NULL DEFAULT 50,
  send_window_start TIME NOT NULL DEFAULT '09:00',
  send_window_end TIME NOT NULL DEFAULT '17:00',
  timezone TEXT NOT NULL DEFAULT 'Africa/Kigali',
  require_approval_before_send BOOLEAN NOT NULL DEFAULT true,
  allow_low_confidence_autosend BOOLEAN NOT NULL DEFAULT false,
  min_lead_score INTEGER NOT NULL DEFAULT 70,
  worker_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_suppression_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  reason TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'automation',
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, email)
);

ALTER TABLE public.automation_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_jobs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppression_list   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own automation settings" ON public.automation_settings;
CREATE POLICY "Users manage own automation settings" ON public.automation_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own automation jobs" ON public.automation_jobs;
CREATE POLICY "Users view own automation jobs" ON public.automation_jobs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own suppression list" ON public.email_suppression_list;
CREATE POLICY "Users manage own suppression list" ON public.email_suppression_list
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS touch_automation_settings_updated_at ON public.automation_settings;
CREATE TRIGGER touch_automation_settings_updated_at
  BEFORE UPDATE ON public.automation_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_automation_jobs_updated_at ON public.automation_jobs;
CREATE TRIGGER touch_automation_jobs_updated_at
  BEFORE UPDATE ON public.automation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_automation_jobs_due
  ON public.automation_jobs(status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_automation_jobs_user_type
  ON public.automation_jobs(user_id, job_type, status);

CREATE INDEX IF NOT EXISTS idx_email_suppression_user_email
  ON public.email_suppression_list(user_id, email);


-- ── 8. Agent memory tables (migration 20240617) ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  product_shape TEXT NOT NULL DEFAULT 'hybrid',
  autonomy_mode TEXT NOT NULL DEFAULT 'semi_auto',
  search_provider TEXT NOT NULL DEFAULT 'free',
  ai_provider TEXT NOT NULL DEFAULT 'groq',
  min_auto_send_score INTEGER NOT NULL DEFAULT 85,
  min_draft_score INTEGER NOT NULL DEFAULT 65,
  require_verified_email_for_auto_send BOOLEAN NOT NULL DEFAULT true,
  allow_directory_evidence_for_drafts BOOLEAN NOT NULL DEFAULT true,
  allow_guessed_email_auto_send BOOLEAN NOT NULL DEFAULT false,
  browser_fallback_enabled BOOLEAN NOT NULL DEFAULT true,
  evidence_cache_ttl_days INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL DEFAULT 'research',
  status TEXT NOT NULL DEFAULT 'completed',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  model_used TEXT,
  search_cost INTEGER NOT NULL DEFAULT 0,
  token_cost INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.lead_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  agent_run_id UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT,
  snippet TEXT,
  extracted_facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence TEXT NOT NULL DEFAULT 'low',
  is_official_candidate BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  agent_run_id UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  contact_type TEXT NOT NULL,
  value TEXT NOT NULL,
  source_url TEXT,
  source_type TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  confidence TEXT NOT NULL DEFAULT 'low',
  is_business_owned BOOLEAN NOT NULL DEFAULT false,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, lead_id, contact_type, value)
);

ALTER TABLE public.agent_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_evidence    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_points   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own agent settings" ON public.agent_settings;
CREATE POLICY "Users manage own agent settings" ON public.agent_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own agent runs" ON public.agent_runs;
CREATE POLICY "Users manage own agent runs" ON public.agent_runs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own lead evidence" ON public.lead_evidence;
CREATE POLICY "Users manage own lead evidence" ON public.lead_evidence
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own contact points" ON public.contact_points;
CREATE POLICY "Users manage own contact points" ON public.contact_points
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS touch_agent_settings_updated_at ON public.agent_settings;
CREATE TRIGGER touch_agent_settings_updated_at
  BEFORE UPDATE ON public.agent_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_contact_points_updated_at ON public.contact_points;
CREATE TRIGGER touch_contact_points_updated_at
  BEFORE UPDATE ON public.contact_points
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_agent_runs_user_lead
  ON public.agent_runs(user_id, lead_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_evidence_lead
  ON public.lead_evidence(user_id, lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_points_lead
  ON public.contact_points(user_id, lead_id, contact_type, is_primary DESC);
CREATE INDEX IF NOT EXISTS idx_contact_points_value
  ON public.contact_points(user_id, contact_type, value);


-- ── 9. Agent skill overrides (migration 20240619) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_skill_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  skill_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  version_pin TEXT,
  prompt_override TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, skill_id)
);

ALTER TABLE public.agent_skill_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own agent skill overrides" ON public.agent_skill_overrides;
CREATE POLICY "Users manage own agent skill overrides"
  ON public.agent_skill_overrides FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS touch_agent_skill_overrides_updated_at ON public.agent_skill_overrides;
CREATE TRIGGER touch_agent_skill_overrides_updated_at
  BEFORE UPDATE ON public.agent_skill_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ── 10. generated_emails approval columns (migration 20240616) ────────────────
ALTER TABLE public.generated_emails
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS quality_score INTEGER,
  ADD COLUMN IF NOT EXISTS ai_score INTEGER,
  ADD COLUMN IF NOT EXISTS ai_score_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'generated_emails_approval_status_check'
      AND conrelid = 'public.generated_emails'::regclass
  ) THEN
    ALTER TABLE public.generated_emails
      ADD CONSTRAINT generated_emails_approval_status_check
      CHECK (approval_status IN ('draft','pending','approved','rejected','sent'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_generated_emails_approval
  ON public.generated_emails(user_id, approval_status, created_at DESC);


-- =============================================================
-- Done. All 18 missing columns + supporting tables are now in
-- place. Reload the app — the Pipeline tab should load cleanly.
-- =============================================================


-- =============================================================
-- PART 2: Base tables missing entirely from qjsnwefgzmmpsuzjfniu
-- (email_campaigns, smtp_accounts, email_queue + related tables)
-- These come from migrations 20240602 / 20240603 / 20240605
-- =============================================================


-- ── Helper trigger function (may already exist from Part 1) ──────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ── smtp_accounts ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.smtp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL DEFAULT 587,
  user_name VARCHAR(255) NOT NULL,
  password TEXT NOT NULL,
  provider VARCHAR(50) NOT NULL,
  daily_limit INTEGER NOT NULL DEFAULT 100,
  sent_today INTEGER NOT NULL DEFAULT 0,
  last_reset TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  warmup_enabled BOOLEAN DEFAULT false,
  warmup_count INTEGER DEFAULT 0,
  health_score INTEGER DEFAULT 100,
  last_error TEXT,
  total_sent INTEGER DEFAULT 0,
  total_bounced INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.smtp_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own SMTP accounts"   ON public.smtp_accounts;
DROP POLICY IF EXISTS "Users can insert their own SMTP accounts" ON public.smtp_accounts;
DROP POLICY IF EXISTS "Users can update their own SMTP accounts" ON public.smtp_accounts;
DROP POLICY IF EXISTS "Users can delete their own SMTP accounts" ON public.smtp_accounts;

CREATE POLICY "Users can view their own SMTP accounts"
  ON public.smtp_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own SMTP accounts"
  ON public.smtp_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own SMTP accounts"
  ON public.smtp_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own SMTP accounts"
  ON public.smtp_accounts FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_smtp_accounts_updated_at ON public.smtp_accounts;
CREATE TRIGGER update_smtp_accounts_updated_at
  BEFORE UPDATE ON public.smtp_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_smtp_accounts_user_id ON public.smtp_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_smtp_accounts_status   ON public.smtp_accounts(status);


-- ── email_campaigns ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  template_subject TEXT NOT NULL DEFAULT '',
  template_body TEXT NOT NULL DEFAULT '',
  tone VARCHAR(50) DEFAULT 'professional',
  purpose VARCHAR(50) DEFAULT 'introduction',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  clicked_count INTEGER DEFAULT 0,
  replied_count INTEGER DEFAULT 0,
  bounced_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  niche TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own campaigns"   ON public.email_campaigns;
DROP POLICY IF EXISTS "Users can insert their own campaigns" ON public.email_campaigns;
DROP POLICY IF EXISTS "Users can update their own campaigns" ON public.email_campaigns;
DROP POLICY IF EXISTS "Users can delete their own campaigns" ON public.email_campaigns;

CREATE POLICY "Users can view their own campaigns"
  ON public.email_campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own campaigns"
  ON public.email_campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own campaigns"
  ON public.email_campaigns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own campaigns"
  ON public.email_campaigns FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_email_campaigns_updated_at ON public.email_campaigns;
CREATE TRIGGER update_email_campaigns_updated_at
  BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_email_campaigns_user_id ON public.email_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status  ON public.email_campaigns(status);


-- ── email_queue ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  smtp_account_id UUID REFERENCES public.smtp_accounts(id) ON DELETE SET NULL,
  recipient_email VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(255),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own email queue"   ON public.email_queue;
DROP POLICY IF EXISTS "Users can insert their own email queue" ON public.email_queue;
DROP POLICY IF EXISTS "Users can update their own email queue" ON public.email_queue;
DROP POLICY IF EXISTS "Users can delete their own email queue" ON public.email_queue;

CREATE POLICY "Users can view their own email queue"
  ON public.email_queue FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own email queue"
  ON public.email_queue FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own email queue"
  ON public.email_queue FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own email queue"
  ON public.email_queue FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_email_queue_updated_at ON public.email_queue;
CREATE TRIGGER update_email_queue_updated_at
  BEFORE UPDATE ON public.email_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_email_queue_user_id      ON public.email_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_status       ON public.email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_campaign_id  ON public.email_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled_at ON public.email_queue(scheduled_at);


-- ── lead_status_history ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);


-- ── Realtime publications ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'email_campaigns') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_campaigns;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'email_queue') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_queue;
  END IF;
END $$;


-- =============================================================
-- Done. Run this entire file in the Supabase SQL Editor.
-- Both Part 1 (leads columns) and Part 2 (missing tables) are
-- safe to re-run — all statements use IF NOT EXISTS.
-- =============================================================
