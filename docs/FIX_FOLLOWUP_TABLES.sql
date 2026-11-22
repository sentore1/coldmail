-- ============================================================
-- FIX: Follow-Up module tables
-- Run once in: Supabase Dashboard → SQL Editor → New Query
-- Safe to re-run — all statements use IF NOT EXISTS.
-- ============================================================


-- ── 1. sent_emails ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sent_emails (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id           UUID        REFERENCES public.leads(id) ON DELETE SET NULL,
  campaign_id       UUID,
  smtp_account_id   UUID,
  to_email          TEXT,
  subject           TEXT,
  body              TEXT,
  status            TEXT        NOT NULL DEFAULT 'sent',
  bounce_reason     TEXT,
  smtp_message_id   TEXT,
  in_reply_to       TEXT,
  thread_id         TEXT,
  tracking_pixel_id TEXT,
  followup_count    INTEGER     NOT NULL DEFAULT 0,
  followup_stopped  BOOLEAN     NOT NULL DEFAULT false,
  next_followup_at  TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at         TIMESTAMPTZ,
  clicked_at        TIMESTAMPTZ,
  replied_at        TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Back-fill any missing columns on existing tables
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS smtp_account_id   UUID;
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS to_email          TEXT;
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS tracking_pixel_id TEXT;
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS opened_at         TIMESTAMPTZ;
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS clicked_at        TIMESTAMPTZ;
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS replied_at        TIMESTAMPTZ;
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS delivered_at      TIMESTAMPTZ;
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS bounce_reason     TEXT;
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS followup_count    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS followup_stopped  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS next_followup_at  TIMESTAMPTZ;
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS smtp_message_id   TEXT;
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS in_reply_to       TEXT;
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS thread_id         TEXT;

-- RLS
ALTER TABLE public.sent_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own sent_emails"    ON public.sent_emails;
DROP POLICY IF EXISTS "insert own sent_emails"  ON public.sent_emails;
DROP POLICY IF EXISTS "update own sent_emails"  ON public.sent_emails;
DROP POLICY IF EXISTS "service role bypass"     ON public.sent_emails;
-- also drop legacy names
DROP POLICY IF EXISTS "Users manage own sent_emails"              ON public.sent_emails;
DROP POLICY IF EXISTS "Users can view own sent_emails"            ON public.sent_emails;
DROP POLICY IF EXISTS "Users can insert own sent_emails"          ON public.sent_emails;
DROP POLICY IF EXISTS "Users can update own sent_emails"          ON public.sent_emails;
DROP POLICY IF EXISTS "Service role full access sent_emails"      ON public.sent_emails;

CREATE POLICY "read own sent_emails"
  ON public.sent_emails FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "insert own sent_emails"
  ON public.sent_emails FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update own sent_emails"
  ON public.sent_emails FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role bypass so API routes can insert without auth context
CREATE POLICY "service role bypass sent_emails"
  ON public.sent_emails
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sent_emails_user_id ON public.sent_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_lead_id ON public.sent_emails(lead_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_status  ON public.sent_emails(status);
CREATE INDEX IF NOT EXISTS idx_sent_emails_sent_at ON public.sent_emails(sent_at DESC);

-- Realtime
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sent_emails;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;


-- ── 2. email_replies ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_replies (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id         UUID        REFERENCES public.leads(id) ON DELETE SET NULL,
  sent_email_id   UUID        REFERENCES public.sent_emails(id) ON DELETE SET NULL,
  from_email      TEXT,
  from_name       TEXT,
  subject         TEXT,
  body            TEXT,
  raw_message_id  TEXT,
  in_reply_to     TEXT,
  thread_id       TEXT,
  sentiment       TEXT,          -- positive | neutral | negative
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own email_replies"   ON public.email_replies;
DROP POLICY IF EXISTS "insert own email_replies" ON public.email_replies;
DROP POLICY IF EXISTS "update own email_replies" ON public.email_replies;
DROP POLICY IF EXISTS "service role bypass email_replies" ON public.email_replies;

CREATE POLICY "read own email_replies"
  ON public.email_replies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "insert own email_replies"
  ON public.email_replies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update own email_replies"
  ON public.email_replies FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "service role bypass email_replies"
  ON public.email_replies
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_email_replies_user_id     ON public.email_replies(user_id);
CREATE INDEX IF NOT EXISTS idx_email_replies_lead_id     ON public.email_replies(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_replies_received_at ON public.email_replies(received_at DESC);

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.email_replies;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;


-- ── 3. ai_replies ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_replies (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id         UUID        REFERENCES public.leads(id) ON DELETE SET NULL,
  reply_id        UUID        REFERENCES public.email_replies(id) ON DELETE SET NULL,
  sent_email_id   UUID        REFERENCES public.sent_emails(id) ON DELETE SET NULL,
  subject         TEXT,
  body            TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'draft',  -- draft | sent | discarded
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own ai_replies"   ON public.ai_replies;
DROP POLICY IF EXISTS "insert own ai_replies" ON public.ai_replies;
DROP POLICY IF EXISTS "update own ai_replies" ON public.ai_replies;
DROP POLICY IF EXISTS "delete own ai_replies" ON public.ai_replies;
DROP POLICY IF EXISTS "service role bypass ai_replies" ON public.ai_replies;

CREATE POLICY "read own ai_replies"
  ON public.ai_replies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "insert own ai_replies"
  ON public.ai_replies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update own ai_replies"
  ON public.ai_replies FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "delete own ai_replies"
  ON public.ai_replies FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "service role bypass ai_replies"
  ON public.ai_replies
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ai_replies_user_id    ON public.ai_replies(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_replies_lead_id    ON public.ai_replies(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_replies_created_at ON public.ai_replies(created_at DESC);

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_replies;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;


-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('sent_emails', 'email_replies', 'ai_replies')
ORDER BY table_name;
