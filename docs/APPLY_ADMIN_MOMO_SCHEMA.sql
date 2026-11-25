-- =============================================================
-- RUN THIS ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → paste → Run)
--   OR run:  npm run supabase:push   (uses the migration in supabase/migrations/)
--
-- What it does:
--   1. Adds role + is_disabled columns to public.users
--   2. Makes abdousentore@gmail.com an admin (now and on any future signup)
--   3. Creates subscriptions + momo_payments tables (for MTN MoMo payments)
--
-- Safe to re-run (everything is IF NOT EXISTS / OR REPLACE / idempotent).
-- =============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false;

UPDATE public.users
  SET role = 'admin', is_disabled = false
  WHERE LOWER(email) = 'abdousentore@gmail.com';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (
    id, user_id, email, name, full_name, avatar_url, token_identifier,
    role, is_disabled, created_at, updated_at
  ) VALUES (
    NEW.id,
    NEW.id::text,
    NEW.email,
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email,
    CASE WHEN LOWER(NEW.email) = 'abdousentore@gmail.com' THEN 'admin' ELSE 'user' END,
    false,
    NEW.created_at,
    NEW.updated_at
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL,
  status text NOT NULL DEFAULT 'inactive',
  current_period_end timestamptz,
  momo_reference_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions'
      AND policyname = 'Users can view own subscription'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can view own subscription"
      ON public.subscriptions FOR SELECT
      USING (auth.uid() = user_id)';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.momo_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference_id text NOT NULL UNIQUE,
  plan text NOT NULL,
  amount text NOT NULL,
  currency text NOT NULL,
  payer_phone text,
  status text NOT NULL DEFAULT 'pending',
  momo_financial_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.momo_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'momo_payments'
      AND policyname = 'Users can view own payments'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can view own payments"
      ON public.momo_payments FOR SELECT
      USING (auth.uid() = user_id)';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscriptions_updated ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_momo_payments_updated ON public.momo_payments;
CREATE TRIGGER trg_momo_payments_updated
  BEFORE UPDATE ON public.momo_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Done. abdousentore@gmail.com is now an admin (will be after they sign up too).
