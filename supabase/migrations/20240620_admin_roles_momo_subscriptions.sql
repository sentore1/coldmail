-- =============================================================
-- Admin roles, user disabling, and MTN MoMo subscriptions
-- =============================================================
-- Adds:
--   * public.users.role       ('user' | 'admin')   default 'user'
--   * public.users.is_disabled (boolean)            default false
--   * public.subscriptions     (one row per user, active plan gating)
--   * public.momo_payments     (per-payment transaction log)
-- Auto-promotes abdousentore@gmail.com to admin (now and on future signup).
-- =============================================================

-- 1. Add role + disabled columns to the profile table -------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false;

-- 2. Promote the designated admin (if the profile row already exists) ---
UPDATE public.users
  SET role = 'admin',
      is_disabled = false
  WHERE LOWER(email) = 'abdousentore@gmail.com';

-- 3. Replace the new-user trigger so future signups get the right role ---
-- (abdousentore@gmail.com becomes admin automatically, everyone else 'user')
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

-- The existing trigger on_auth_user_created already calls handle_new_user(),
-- so no trigger change is needed — only the function body above changed.

-- 4. Subscriptions table ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL,                          -- 'monthly' | 'yearly'
  status text NOT NULL DEFAULT 'inactive',     -- 'active' | 'inactive' | 'expired' | 'cancelled'
  current_period_end timestamptz,
  momo_reference_id text,                      -- last successful MoMo reference id
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

-- 5. MoMo payments table -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.momo_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference_id text NOT NULL UNIQUE,           -- X-Reference-Id (UUID sent to MoMo)
  plan text NOT NULL,
  amount text NOT NULL,
  currency text NOT NULL,
  payer_phone text,
  status text NOT NULL DEFAULT 'pending',      -- pending | success | failed | cancelled | timeout
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

-- 6. updated_at trigger for both new tables -----------------------------
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
