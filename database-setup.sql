-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_deposit DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_bet DECIMAL(12,2) NOT NULL DEFAULT 0,
  referral_code TEXT UNIQUE,
  referred_by UUID REFERENCES public.profiles(id),
  referral_earnings DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create trades table for trade history
CREATE TABLE public.trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coin_symbol TEXT NOT NULL,
  coin_name TEXT NOT NULL,
  timeframe INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('up', 'down')),
  amount DECIMAL(12,2) NOT NULL,
  entry_price DECIMAL(20,8) NOT NULL,
  exit_price DECIMAL(20,8),
  return_rate DECIMAL(5,2) NOT NULL,
  result TEXT CHECK (result IN ('win', 'loss', 'pending')),
  pnl DECIMAL(12,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE
);

-- Create transactions table for deposit/withdraw history
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdraw', 'referral_bonus', 'referral_commission')),
  amount DECIMAL(12,2) NOT NULL,
  coin TEXT,
  wallet_address TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('trade_result', 'deposit', 'withdraw', 'referral', 'promo')),
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create referrals table
CREATE TABLE public.referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  signup_bonus_paid BOOLEAN NOT NULL DEFAULT false,
  total_earnings DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(referrer_id, referred_id)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Trades policies
CREATE POLICY "Users can view their own trades"
  ON public.trades FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trades"
  ON public.trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trades"
  ON public.trades FOR UPDATE
  USING (auth.uid() = user_id);

-- Transactions policies
CREATE POLICY "Users can view their own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Notifications policies
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Referrals policies
CREATE POLICY "Users can view referrals where they are referrer"
  ON public.referrals FOR SELECT
  USING (referrer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "System can insert referrals"
  ON public.referrals FOR INSERT
  WITH CHECK (true);

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := 'APNA';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger to auto-generate referral code on profile creation
CREATE OR REPLACE FUNCTION public.set_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_profile_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_referral_code();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();-- Fix the overly permissive referrals insert policy
DROP POLICY IF EXISTS "System can insert referrals" ON public.referrals;

-- Create a proper policy that allows users to create referral records when they sign up
CREATE POLICY "Users can insert referrals for themselves"
  ON public.referrals FOR INSERT
  WITH CHECK (
    referred_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );-- Create table for storing platform settings including API keys
CREATE TABLE public.platform_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Only allow service role to access (for edge functions)
-- No public access to API keys
CREATE POLICY "Service role only" ON public.platform_settings
  FOR ALL USING (false);

-- Create trigger for updated_at
CREATE TRIGGER update_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();-- Drop the restrictive policy
DROP POLICY IF EXISTS "Service role only" ON public.platform_settings;

-- Create policy for authenticated admins to read settings
-- For now, allow all authenticated users (we'll add admin check later)
CREATE POLICY "Authenticated users can read settings" ON public.platform_settings
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to insert/update settings
CREATE POLICY "Authenticated users can manage settings" ON public.platform_settings
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');-- Create enum for admin roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table for role-based access
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents infinite recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Add blocked column to profiles for user blocking
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT false;

-- Update RLS on profiles to allow admin to view/manage all profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can view own profile or admin can view all"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = user_id 
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can update own profile or admin can update all"
ON public.profiles
FOR UPDATE
USING (
  auth.uid() = user_id 
  OR public.has_role(auth.uid(), 'admin')
);

-- Update transactions RLS to allow admin to update
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.transactions;

CREATE POLICY "Users can view own transactions or admin can view all"
ON public.transactions
FOR SELECT
USING (
  auth.uid() = user_id 
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admin can update transactions"
ON public.transactions
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Update referrals RLS to allow admin to view all
DROP POLICY IF EXISTS "Users can view referrals where they are referrer" ON public.referrals;

CREATE POLICY "Users can view own referrals or admin can view all"
ON public.referrals
FOR SELECT
USING (
  referrer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);-- Enable realtime for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;-- Create storage bucket for avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access for avatars
CREATE POLICY "Avatars are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Allow authenticated users to upload their own avatars
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

-- Allow authenticated users to update their own avatars
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete their own avatars
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');-- Add avatar_url column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS avatar_url TEXT;-- Enable realtime for transactions table to support live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;-- Drop existing insecure policies on platform_settings
DROP POLICY IF EXISTS "Authenticated users can manage settings" ON public.platform_settings;
DROP POLICY IF EXISTS "Authenticated users can read settings" ON public.platform_settings;

-- Create admin-only policies for platform_settings
CREATE POLICY "Admins can read platform settings"
ON public.platform_settings
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert platform settings"
ON public.platform_settings
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update platform settings"
ON public.platform_settings
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete platform settings"
ON public.platform_settings
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));-- =====================================================
-- APNATRADE SECURITY HARDENING MIGRATION (FIXED)
-- Financial audit, idempotency, rate limiting, admin audit
-- =====================================================

-- 1. FINANCIAL AUDIT LOG (Append-only ledger)
CREATE TABLE public.financial_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  profile_id uuid REFERENCES public.profiles(id),
  
  -- Transaction details
  type text NOT NULL CHECK (type IN ('trade_bet', 'trade_win', 'trade_loss', 'deposit', 'withdrawal', 'referral_bonus', 'admin_credit', 'admin_debit', 'refund')),
  
  -- Financial state
  before_balance numeric NOT NULL,
  after_balance numeric NOT NULL,
  amount numeric NOT NULL,
  
  -- Traceability
  source_table text,
  source_id uuid,
  request_id text,
  
  -- Context
  metadata jsonb DEFAULT '{}',
  ip_address text,
  user_agent text,
  
  -- Integrity checksum (computed by trigger)
  checksum text
);

CREATE INDEX idx_financial_audit_user ON public.financial_audit_log(user_id, created_at DESC);
CREATE INDEX idx_financial_audit_type ON public.financial_audit_log(type, created_at DESC);
CREATE INDEX idx_financial_audit_source ON public.financial_audit_log(source_table, source_id);
CREATE INDEX idx_financial_audit_request ON public.financial_audit_log(request_id);

ALTER TABLE public.financial_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit logs" ON public.financial_audit_log
  FOR SELECT USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert audit logs" ON public.financial_audit_log
  FOR INSERT WITH CHECK (true);

-- Trigger to compute checksum on insert
CREATE OR REPLACE FUNCTION public.compute_audit_checksum()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.checksum := encode(sha256(
    (NEW.user_id::text || NEW.type || NEW.before_balance::text || NEW.after_balance::text || NEW.amount::text || NEW.created_at::text)::bytea
  ), 'hex');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_checksum
  BEFORE INSERT ON public.financial_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_audit_checksum();

-- 2. IDEMPOTENCY KEYS TABLE
CREATE TABLE public.idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  operation_type text NOT NULL CHECK (operation_type IN ('deposit', 'withdrawal', 'trade_settlement', 'referral_bonus')),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  result jsonb,
  user_id uuid,
  request_hash text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE(idempotency_key, operation_type)
);

CREATE INDEX idx_idempotency_key ON public.idempotency_keys(idempotency_key, operation_type);
CREATE INDEX idx_idempotency_expires ON public.idempotency_keys(expires_at);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.idempotency_keys
  FOR ALL USING (false);

-- 3. RATE LIMIT EVENTS TABLE
CREATE TABLE public.rate_limit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  identifier text NOT NULL,
  identifier_type text NOT NULL CHECK (identifier_type IN ('user_id', 'ip_address')),
  action_type text NOT NULL CHECK (action_type IN ('auth_attempt', 'bet_place', 'deposit_request', 'withdrawal_request', 'api_call')),
  count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  window_seconds integer NOT NULL,
  limit_max integer NOT NULL,
  is_blocked boolean NOT NULL DEFAULT false,
  blocked_until timestamptz,
  abuse_score integer DEFAULT 0,
  UNIQUE(identifier, identifier_type, action_type)
);

CREATE INDEX idx_rate_limit_identifier ON public.rate_limit_events(identifier, action_type);
CREATE INDEX idx_rate_limit_blocked ON public.rate_limit_events(is_blocked, blocked_until);

ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for rate limits" ON public.rate_limit_events
  FOR ALL USING (false);

-- 4. ADMIN AUDIT LOG
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  admin_user_id uuid NOT NULL,
  admin_email text,
  action_type text NOT NULL CHECK (action_type IN (
    'user_block', 'user_unblock', 
    'balance_credit', 'balance_debit',
    'transaction_approve', 'transaction_reject',
    'role_grant', 'role_revoke',
    'config_change', 'settings_update',
    'manual_override', 'data_export'
  )),
  target_user_id uuid,
  target_table text,
  target_id uuid,
  before_state jsonb,
  after_state jsonb,
  reason text,
  ip_address text,
  user_agent text,
  request_id text,
  checksum text
);

CREATE INDEX idx_admin_audit_admin ON public.admin_audit_log(admin_user_id, created_at DESC);
CREATE INDEX idx_admin_audit_target ON public.admin_audit_log(target_user_id, created_at DESC);
CREATE INDEX idx_admin_audit_action ON public.admin_audit_log(action_type, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view admin audit" ON public.admin_audit_log
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert admin audit" ON public.admin_audit_log
  FOR INSERT WITH CHECK (true);

-- Trigger for admin audit checksum
CREATE OR REPLACE FUNCTION public.compute_admin_audit_checksum()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.checksum := encode(sha256(
    (NEW.admin_user_id::text || NEW.action_type || COALESCE(NEW.target_user_id::text, '') || NEW.created_at::text)::bytea
  ), 'hex');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_admin_audit_checksum
  BEFORE INSERT ON public.admin_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_admin_audit_checksum();

-- 5. ATOMIC BALANCE MUTATION FUNCTION
CREATE OR REPLACE FUNCTION public.mutate_balance(
  p_user_id uuid,
  p_amount numeric,
  p_type text,
  p_source_table text DEFAULT NULL,
  p_source_id uuid DEFAULT NULL,
  p_request_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_new_balance numeric;
  v_audit_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount != p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount: NaN or NULL');
  END IF;
  
  IF p_type NOT IN ('trade_bet', 'trade_win', 'trade_loss', 'deposit', 'withdrawal', 'referral_bonus', 'admin_credit', 'admin_debit', 'refund') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid transaction type');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE user_id = p_user_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;
  
  v_new_balance := v_profile.balance + p_amount;
  
  IF v_new_balance < 0 THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Insufficient balance',
      'current_balance', v_profile.balance,
      'requested_amount', p_amount
    );
  END IF;
  
  IF v_new_balance > 999999999999 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Balance overflow protection');
  END IF;
  
  UPDATE profiles
  SET 
    balance = v_new_balance,
    updated_at = now(),
    total_bet = CASE WHEN p_type = 'trade_bet' THEN total_bet + ABS(p_amount) ELSE total_bet END,
    total_deposit = CASE WHEN p_type = 'deposit' THEN total_deposit + p_amount ELSE total_deposit END,
    referral_earnings = CASE WHEN p_type = 'referral_bonus' THEN referral_earnings + p_amount ELSE referral_earnings END
  WHERE user_id = p_user_id;
  
  INSERT INTO financial_audit_log (
    user_id, profile_id, type, before_balance, after_balance, amount,
    source_table, source_id, request_id, metadata
  ) VALUES (
    p_user_id, v_profile.id, p_type, v_profile.balance, v_new_balance, p_amount,
    p_source_table, p_source_id, p_request_id, p_metadata
  )
  RETURNING id INTO v_audit_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'before_balance', v_profile.balance,
    'after_balance', v_new_balance,
    'amount', p_amount,
    'audit_id', v_audit_id
  );
END;
$$;

-- 6. IDEMPOTENCY CHECK/CREATE FUNCTION
CREATE OR REPLACE FUNCTION public.check_idempotency(
  p_key text,
  p_operation text,
  p_user_id uuid DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing idempotency_keys%ROWTYPE;
BEGIN
  SELECT * INTO v_existing
  FROM idempotency_keys
  WHERE idempotency_key = p_key AND operation_type = p_operation AND expires_at > now();
  
  IF FOUND THEN
    IF v_existing.status = 'completed' THEN
      RETURN jsonb_build_object('duplicate', true, 'status', 'completed', 'result', v_existing.result);
    ELSIF v_existing.status = 'processing' THEN
      RETURN jsonb_build_object('duplicate', true, 'status', 'processing', 'message', 'Operation in progress');
    ELSE
      DELETE FROM idempotency_keys WHERE id = v_existing.id;
    END IF;
  END IF;
  
  INSERT INTO idempotency_keys (idempotency_key, operation_type, user_id, request_hash, status)
  VALUES (p_key, p_operation, p_user_id, p_request_hash, 'processing');
  
  RETURN jsonb_build_object('duplicate', false, 'status', 'new');
END;
$$;

-- 7. COMPLETE IDEMPOTENCY FUNCTION
CREATE OR REPLACE FUNCTION public.complete_idempotency(
  p_key text,
  p_operation text,
  p_status text,
  p_result jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE idempotency_keys SET status = p_status, result = p_result
  WHERE idempotency_key = p_key AND operation_type = p_operation;
END;
$$;

-- 8. RATE LIMIT CHECK FUNCTION
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier text,
  p_identifier_type text,
  p_action text,
  p_window_seconds integer,
  p_limit_max integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event rate_limit_events%ROWTYPE;
  v_new_count integer;
BEGIN
  SELECT * INTO v_event FROM rate_limit_events
  WHERE identifier = p_identifier AND identifier_type = p_identifier_type AND action_type = p_action
  FOR UPDATE;
  
  IF FOUND AND v_event.is_blocked AND v_event.blocked_until > now() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'blocked', 'blocked_until', v_event.blocked_until, 'abuse_score', v_event.abuse_score);
  END IF;
  
  IF FOUND THEN
    IF v_event.window_start + (v_event.window_seconds || ' seconds')::interval < now() THEN
      UPDATE rate_limit_events
      SET count = 1, window_start = now(), window_seconds = p_window_seconds, limit_max = p_limit_max, is_blocked = false, blocked_until = NULL
      WHERE id = v_event.id;
      RETURN jsonb_build_object('allowed', true, 'count', 1, 'limit', p_limit_max);
    END IF;
    
    v_new_count := v_event.count + 1;
    
    IF v_new_count > p_limit_max THEN
      UPDATE rate_limit_events
      SET count = v_new_count, is_blocked = true, blocked_until = now() + interval '5 minutes' * (v_event.abuse_score + 1), abuse_score = v_event.abuse_score + 1
      WHERE id = v_event.id;
      RETURN jsonb_build_object('allowed', false, 'reason', 'rate_limited', 'count', v_new_count, 'limit', p_limit_max, 'blocked_until', now() + interval '5 minutes' * (v_event.abuse_score + 1));
    END IF;
    
    UPDATE rate_limit_events SET count = v_new_count WHERE id = v_event.id;
    RETURN jsonb_build_object('allowed', true, 'count', v_new_count, 'limit', p_limit_max);
  ELSE
    INSERT INTO rate_limit_events (identifier, identifier_type, action_type, count, window_seconds, limit_max)
    VALUES (p_identifier, p_identifier_type, p_action, 1, p_window_seconds, p_limit_max);
    RETURN jsonb_build_object('allowed', true, 'count', 1, 'limit', p_limit_max);
  END IF;
END;
$$;

-- 9. LOG ADMIN ACTION FUNCTION
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_admin_user_id uuid,
  p_action_type text,
  p_target_user_id uuid DEFAULT NULL,
  p_target_table text DEFAULT NULL,
  p_target_id uuid DEFAULT NULL,
  p_before_state jsonb DEFAULT NULL,
  p_after_state jsonb DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_request_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_email text;
  v_audit_id uuid;
BEGIN
  SELECT email INTO v_admin_email FROM auth.users WHERE id = p_admin_user_id;
  
  INSERT INTO admin_audit_log (
    admin_user_id, admin_email, action_type, target_user_id, target_table, target_id,
    before_state, after_state, reason, ip_address, request_id
  ) VALUES (
    p_admin_user_id, v_admin_email, p_action_type, p_target_user_id, p_target_table, p_target_id,
    p_before_state, p_after_state, p_reason, p_ip_address, p_request_id
  )
  RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$;

-- 10. CLEANUP EXPIRED IDEMPOTENCY KEYS
CREATE OR REPLACE FUNCTION public.cleanup_expired_idempotency()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH deleted AS (
    DELETE FROM idempotency_keys WHERE expires_at < now() RETURNING *
  )
  SELECT count(*) INTO v_deleted FROM deleted;
  RETURN COALESCE(v_deleted, 0);
END;
$$;

-- 11. BALANCE CONSTRAINT (non-negative)
ALTER TABLE public.profiles 
ADD CONSTRAINT chk_balance_non_negative CHECK (balance >= 0);

-- 12. FINANCIAL AMOUNTS CONSTRAINT
ALTER TABLE public.financial_audit_log
ADD CONSTRAINT chk_amounts_finite CHECK (
  amount = amount AND before_balance = before_balance AND after_balance = after_balance
);-- Fix RLS warnings: Remove permissive INSERT policies, rely on SECURITY DEFINER functions only
DROP POLICY IF EXISTS "System can insert audit logs" ON public.financial_audit_log;
DROP POLICY IF EXISTS "System can insert admin audit" ON public.admin_audit_log;

-- These tables are insert-only via SECURITY DEFINER functions (mutate_balance, log_admin_action)
-- No direct client inserts allowed-- =====================================================
-- LAYER 6: CRYPTOGRAPHIC TRUST LAYER
-- =====================================================

-- Add hash chaining to financial_audit_log
ALTER TABLE public.financial_audit_log 
ADD COLUMN IF NOT EXISTS prev_hash TEXT,
ADD COLUMN IF NOT EXISTS chain_sequence BIGINT;

-- Create sequence for chain ordering
CREATE SEQUENCE IF NOT EXISTS financial_audit_chain_seq START 1;

-- Trigger to chain hashes for financial audit
CREATE OR REPLACE FUNCTION public.chain_financial_audit_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_hash TEXT;
  v_seq BIGINT;
BEGIN
  -- Get previous hash from the most recent audit entry
  SELECT checksum INTO v_prev_hash 
  FROM financial_audit_log 
  ORDER BY created_at DESC, chain_sequence DESC NULLS LAST
  LIMIT 1;
  
  v_seq := nextval('financial_audit_chain_seq');
  
  NEW.prev_hash := COALESCE(v_prev_hash, 'GENESIS');
  NEW.chain_sequence := v_seq;
  
  -- Compute checksum including prev_hash for tamper detection
  NEW.checksum := encode(sha256(
    (NEW.user_id::text || NEW.type || NEW.before_balance::text || NEW.after_balance::text || 
     NEW.amount::text || NEW.created_at::text || COALESCE(NEW.prev_hash, ''))::bytea
  ), 'hex');
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chain_financial_audit ON financial_audit_log;
CREATE TRIGGER chain_financial_audit
  BEFORE INSERT ON financial_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION chain_financial_audit_hash();

-- Add hash chaining to admin_audit_log
ALTER TABLE public.admin_audit_log 
ADD COLUMN IF NOT EXISTS prev_hash TEXT,
ADD COLUMN IF NOT EXISTS chain_sequence BIGINT;

CREATE SEQUENCE IF NOT EXISTS admin_audit_chain_seq START 1;

CREATE OR REPLACE FUNCTION public.chain_admin_audit_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_hash TEXT;
  v_seq BIGINT;
BEGIN
  SELECT checksum INTO v_prev_hash 
  FROM admin_audit_log 
  ORDER BY created_at DESC, chain_sequence DESC NULLS LAST
  LIMIT 1;
  
  v_seq := nextval('admin_audit_chain_seq');
  
  NEW.prev_hash := COALESCE(v_prev_hash, 'GENESIS');
  NEW.chain_sequence := v_seq;
  
  NEW.checksum := encode(sha256(
    (NEW.admin_user_id::text || NEW.action_type || COALESCE(NEW.target_user_id::text, '') || 
     NEW.created_at::text || COALESCE(NEW.prev_hash, ''))::bytea
  ), 'hex');
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chain_admin_audit ON admin_audit_log;
CREATE TRIGGER chain_admin_audit
  BEFORE INSERT ON admin_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION chain_admin_audit_hash();

-- Webhook archive table for signature verification replay
CREATE TABLE IF NOT EXISTS public.webhook_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  headers JSONB,
  signature TEXT,
  signature_verified BOOLEAN DEFAULT false,
  idempotency_key TEXT,
  processing_status TEXT DEFAULT 'received' CHECK (processing_status IN ('received', 'processing', 'completed', 'failed', 'replayed')),
  error_message TEXT,
  ip_address TEXT,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.webhook_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for webhooks"
  ON public.webhook_archive FOR ALL
  USING (false);

CREATE INDEX IF NOT EXISTS idx_webhook_archive_provider ON webhook_archive(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_archive_idempotency ON webhook_archive(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_webhook_archive_received_at ON webhook_archive(received_at DESC);

-- Key management table
CREATE TABLE IF NOT EXISTS public.security_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name TEXT NOT NULL UNIQUE,
  key_purpose TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_compromised BOOLEAN NOT NULL DEFAULT false,
  compromised_at TIMESTAMP WITH TIME ZONE,
  compromised_reason TEXT,
  rotation_due_at TIMESTAMP WITH TIME ZONE,
  last_rotated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID,
  metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.security_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage security keys"
  ON public.security_keys FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Function to mark key as compromised (kill-switch)
CREATE OR REPLACE FUNCTION public.compromise_key(p_key_name TEXT, p_reason TEXT, p_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key security_keys%ROWTYPE;
BEGIN
  -- Verify admin role
  IF NOT has_role(p_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  UPDATE security_keys
  SET 
    is_compromised = true,
    is_active = false,
    compromised_at = now(),
    compromised_reason = p_reason
  WHERE key_name = p_key_name
  RETURNING * INTO v_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Key not found');
  END IF;

  -- Log the action
  PERFORM log_admin_action(
    p_admin_id,
    'key_compromised',
    NULL,
    'security_keys',
    v_key.id,
    row_to_json(v_key)::jsonb,
    jsonb_build_object('is_compromised', true, 'reason', p_reason),
    p_reason
  );

  RETURN jsonb_build_object('success', true, 'key_name', p_key_name, 'compromised_at', now());
END;
$$;

-- Function to verify audit chain integrity
CREATE OR REPLACE FUNCTION public.verify_audit_chain(p_table TEXT, p_limit INTEGER DEFAULT 1000)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_broken_links INTEGER := 0;
  v_total_checked INTEGER := 0;
  v_first_broken_id UUID;
  v_rec RECORD;
  v_prev_checksum TEXT := 'GENESIS';
BEGIN
  IF p_table = 'financial' THEN
    FOR v_rec IN 
      SELECT id, checksum, prev_hash, chain_sequence 
      FROM financial_audit_log 
      ORDER BY chain_sequence ASC NULLS LAST, created_at ASC
      LIMIT p_limit
    LOOP
      v_total_checked := v_total_checked + 1;
      IF v_rec.prev_hash != v_prev_checksum THEN
        v_broken_links := v_broken_links + 1;
        IF v_first_broken_id IS NULL THEN
          v_first_broken_id := v_rec.id;
        END IF;
      END IF;
      v_prev_checksum := v_rec.checksum;
    END LOOP;
  ELSIF p_table = 'admin' THEN
    FOR v_rec IN 
      SELECT id, checksum, prev_hash, chain_sequence 
      FROM admin_audit_log 
      ORDER BY chain_sequence ASC NULLS LAST, created_at ASC
      LIMIT p_limit
    LOOP
      v_total_checked := v_total_checked + 1;
      IF v_rec.prev_hash != v_prev_checksum THEN
        v_broken_links := v_broken_links + 1;
        IF v_first_broken_id IS NULL THEN
          v_first_broken_id := v_rec.id;
        END IF;
      END IF;
      v_prev_checksum := v_rec.checksum;
    END LOOP;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid table. Use financial or admin');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'table', p_table,
    'total_checked', v_total_checked,
    'broken_links', v_broken_links,
    'chain_valid', v_broken_links = 0,
    'first_broken_id', v_first_broken_id
  );
END;
$$;-- =====================================================
-- LAYER 7: DETECTION & INTELLIGENCE
-- =====================================================

-- User security profile for risk scoring
CREATE TABLE IF NOT EXISTS public.user_security_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  shadow_banned BOOLEAN NOT NULL DEFAULT false,
  shadow_banned_at TIMESTAMP WITH TIME ZONE,
  shadow_banned_reason TEXT,
  under_investigation BOOLEAN NOT NULL DEFAULT false,
  investigation_started_at TIMESTAMP WITH TIME ZONE,
  investigation_notes TEXT,
  last_risk_update TIMESTAMP WITH TIME ZONE DEFAULT now(),
  risk_factors JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.user_security_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage security profiles"
  ON public.user_security_profile FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_user_security_risk ON user_security_profile(risk_level);
CREATE INDEX IF NOT EXISTS idx_user_security_shadow ON user_security_profile(shadow_banned) WHERE shadow_banned = true;
CREATE INDEX IF NOT EXISTS idx_user_security_investigation ON user_security_profile(under_investigation) WHERE under_investigation = true;

-- Login history for impossible travel detection
CREATE TABLE IF NOT EXISTS public.login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  ip_address TEXT NOT NULL,
  country_code TEXT,
  city TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  user_agent TEXT,
  device_fingerprint TEXT,
  login_successful BOOLEAN NOT NULL DEFAULT true,
  failure_reason TEXT,
  is_suspicious BOOLEAN NOT NULL DEFAULT false,
  suspicion_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own login history"
  ON public.login_history FOR SELECT
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert login history"
  ON public.login_history FOR INSERT
  WITH CHECK (false); -- Only service role via RPC

CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_suspicious ON login_history(is_suspicious) WHERE is_suspicious = true;
CREATE INDEX IF NOT EXISTS idx_login_history_ip ON login_history(ip_address);

-- Trade velocity fingerprinting
CREATE TABLE IF NOT EXISTS public.trade_velocity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  window_end TIMESTAMP WITH TIME ZONE NOT NULL,
  trade_count INTEGER NOT NULL DEFAULT 0,
  total_volume NUMERIC NOT NULL DEFAULT 0,
  win_count INTEGER NOT NULL DEFAULT 0,
  loss_count INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC,
  avg_bet_size NUMERIC,
  max_bet_size NUMERIC,
  velocity_score INTEGER DEFAULT 0,
  pattern_flags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.trade_velocity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view trade velocity"
  ON public.trade_velocity FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_trade_velocity_user ON trade_velocity(user_id, window_start DESC);

-- Function to record login and check for impossible travel
CREATE OR REPLACE FUNCTION public.record_login(
  p_user_id UUID,
  p_ip_address TEXT,
  p_country_code TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_latitude NUMERIC DEFAULT NULL,
  p_longitude NUMERIC DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_device_fingerprint TEXT DEFAULT NULL,
  p_login_successful BOOLEAN DEFAULT true,
  p_failure_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_login login_history%ROWTYPE;
  v_time_diff INTERVAL;
  v_distance_km NUMERIC;
  v_speed_kmh NUMERIC;
  v_is_suspicious BOOLEAN := false;
  v_suspicion_reason TEXT;
  v_login_id UUID;
BEGIN
  -- Get last successful login
  SELECT * INTO v_last_login
  FROM login_history
  WHERE user_id = p_user_id AND login_successful = true
  ORDER BY created_at DESC
  LIMIT 1;

  -- Check for impossible travel (if we have coordinates)
  IF v_last_login.id IS NOT NULL AND 
     p_latitude IS NOT NULL AND p_longitude IS NOT NULL AND
     v_last_login.latitude IS NOT NULL AND v_last_login.longitude IS NOT NULL THEN
    
    v_time_diff := now() - v_last_login.created_at;
    
    -- Calculate distance using Haversine formula (approximate)
    v_distance_km := 6371 * acos(
      LEAST(1, GREATEST(-1,
        cos(radians(v_last_login.latitude)) * cos(radians(p_latitude)) *
        cos(radians(p_longitude) - radians(v_last_login.longitude)) +
        sin(radians(v_last_login.latitude)) * sin(radians(p_latitude))
      ))
    );
    
    -- Calculate speed in km/h
    IF EXTRACT(EPOCH FROM v_time_diff) > 0 THEN
      v_speed_kmh := v_distance_km / (EXTRACT(EPOCH FROM v_time_diff) / 3600);
    END IF;
    
    -- Flag as suspicious if speed > 1000 km/h (faster than commercial planes)
    IF v_speed_kmh > 1000 THEN
      v_is_suspicious := true;
      v_suspicion_reason := format('Impossible travel: %s km in %s (%.0f km/h)', 
        ROUND(v_distance_km, 0), v_time_diff, v_speed_kmh);
    END IF;
  END IF;

  -- Check for rapid IP changes
  IF v_last_login.id IS NOT NULL AND 
     v_last_login.ip_address != p_ip_address AND
     v_time_diff < interval '5 minutes' THEN
    v_is_suspicious := true;
    v_suspicion_reason := COALESCE(v_suspicion_reason || '; ', '') || 
      'Rapid IP change within 5 minutes';
  END IF;

  -- Insert login record
  INSERT INTO login_history (
    user_id, ip_address, country_code, city, latitude, longitude,
    user_agent, device_fingerprint, login_successful, failure_reason,
    is_suspicious, suspicion_reason
  ) VALUES (
    p_user_id, p_ip_address, p_country_code, p_city, p_latitude, p_longitude,
    p_user_agent, p_device_fingerprint, p_login_successful, p_failure_reason,
    v_is_suspicious, v_suspicion_reason
  )
  RETURNING id INTO v_login_id;

  -- If suspicious, update user's risk score
  IF v_is_suspicious THEN
    INSERT INTO user_security_profile (user_id, risk_score, risk_level, risk_factors)
    VALUES (p_user_id, 25, 'medium', jsonb_build_array(jsonb_build_object(
      'type', 'impossible_travel',
      'detected_at', now(),
      'details', v_suspicion_reason
    )))
    ON CONFLICT (user_id) DO UPDATE SET
      risk_score = LEAST(100, user_security_profile.risk_score + 15),
      risk_level = CASE 
        WHEN user_security_profile.risk_score + 15 >= 75 THEN 'critical'
        WHEN user_security_profile.risk_score + 15 >= 50 THEN 'high'
        WHEN user_security_profile.risk_score + 15 >= 25 THEN 'medium'
        ELSE 'low'
      END,
      risk_factors = user_security_profile.risk_factors || jsonb_build_array(jsonb_build_object(
        'type', 'impossible_travel',
        'detected_at', now(),
        'details', v_suspicion_reason
      )),
      last_risk_update = now(),
      updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'login_id', v_login_id,
    'is_suspicious', v_is_suspicious,
    'suspicion_reason', v_suspicion_reason
  );
END;
$$;

-- Function to analyze trade velocity
CREATE OR REPLACE FUNCTION public.analyze_trade_velocity(p_user_id UUID, p_window_hours INTEGER DEFAULT 24)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMP WITH TIME ZONE;
  v_stats RECORD;
  v_velocity_score INTEGER := 0;
  v_pattern_flags JSONB := '[]'::jsonb;
  v_result_id UUID;
BEGIN
  v_window_start := now() - (p_window_hours || ' hours')::interval;

  -- Calculate trade statistics
  SELECT 
    COUNT(*) as trade_count,
    COALESCE(SUM(amount), 0) as total_volume,
    COUNT(*) FILTER (WHERE result = 'win') as win_count,
    COUNT(*) FILTER (WHERE result = 'loss') as loss_count,
    CASE WHEN COUNT(*) > 0 THEN 
      (COUNT(*) FILTER (WHERE result = 'win')::NUMERIC / COUNT(*)::NUMERIC * 100)
    ELSE 0 END as win_rate,
    COALESCE(AVG(amount), 0) as avg_bet_size,
    COALESCE(MAX(amount), 0) as max_bet_size
  INTO v_stats
  FROM trades
  WHERE user_id = p_user_id 
    AND created_at >= v_window_start
    AND result IS NOT NULL;

  -- Calculate velocity score based on patterns
  -- High volume
  IF v_stats.trade_count > 100 THEN
    v_velocity_score := v_velocity_score + 20;
    v_pattern_flags := v_pattern_flags || jsonb_build_array('high_frequency');
  END IF;

  -- Unusual win rate (>70% or <10% over many trades)
  IF v_stats.trade_count > 20 THEN
    IF v_stats.win_rate > 70 THEN
      v_velocity_score := v_velocity_score + 30;
      v_pattern_flags := v_pattern_flags || jsonb_build_array('abnormal_win_rate_high');
    ELSIF v_stats.win_rate < 10 THEN
      v_velocity_score := v_velocity_score + 15;
      v_pattern_flags := v_pattern_flags || jsonb_build_array('abnormal_win_rate_low');
    END IF;
  END IF;

  -- Large bet sizes
  IF v_stats.max_bet_size > 50000 THEN
    v_velocity_score := v_velocity_score + 25;
    v_pattern_flags := v_pattern_flags || jsonb_build_array('large_bets');
  END IF;

  -- Store the analysis
  INSERT INTO trade_velocity (
    user_id, window_start, window_end, trade_count, total_volume,
    win_count, loss_count, win_rate, avg_bet_size, max_bet_size,
    velocity_score, pattern_flags
  ) VALUES (
    p_user_id, v_window_start, now(), v_stats.trade_count, v_stats.total_volume,
    v_stats.win_count, v_stats.loss_count, v_stats.win_rate, v_stats.avg_bet_size,
    v_stats.max_bet_size, v_velocity_score, v_pattern_flags
  )
  RETURNING id INTO v_result_id;

  -- Update user risk if velocity score is high
  IF v_velocity_score >= 40 THEN
    INSERT INTO user_security_profile (user_id, risk_score, risk_level, risk_factors)
    VALUES (p_user_id, v_velocity_score, 
      CASE WHEN v_velocity_score >= 60 THEN 'high' ELSE 'medium' END,
      jsonb_build_array(jsonb_build_object(
        'type', 'trade_velocity',
        'detected_at', now(),
        'score', v_velocity_score,
        'patterns', v_pattern_flags
      )))
    ON CONFLICT (user_id) DO UPDATE SET
      risk_score = GREATEST(user_security_profile.risk_score, v_velocity_score),
      risk_level = CASE 
        WHEN GREATEST(user_security_profile.risk_score, v_velocity_score) >= 75 THEN 'critical'
        WHEN GREATEST(user_security_profile.risk_score, v_velocity_score) >= 50 THEN 'high'
        WHEN GREATEST(user_security_profile.risk_score, v_velocity_score) >= 25 THEN 'medium'
        ELSE 'low'
      END,
      risk_factors = user_security_profile.risk_factors || jsonb_build_array(jsonb_build_object(
        'type', 'trade_velocity',
        'detected_at', now(),
        'score', v_velocity_score,
        'patterns', v_pattern_flags
      )),
      last_risk_update = now(),
      updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'velocity_id', v_result_id,
    'trade_count', v_stats.trade_count,
    'total_volume', v_stats.total_volume,
    'win_rate', v_stats.win_rate,
    'velocity_score', v_velocity_score,
    'pattern_flags', v_pattern_flags
  );
END;
$$;

-- Function to shadow ban a user
CREATE OR REPLACE FUNCTION public.shadow_ban_user(p_user_id UUID, p_reason TEXT, p_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(p_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  INSERT INTO user_security_profile (user_id, shadow_banned, shadow_banned_at, shadow_banned_reason, risk_level)
  VALUES (p_user_id, true, now(), p_reason, 'critical')
  ON CONFLICT (user_id) DO UPDATE SET
    shadow_banned = true,
    shadow_banned_at = now(),
    shadow_banned_reason = p_reason,
    risk_level = 'critical',
    updated_at = now();

  PERFORM log_admin_action(
    p_admin_id, 'shadow_ban', p_user_id, 'user_security_profile', NULL,
    NULL, jsonb_build_object('shadow_banned', true), p_reason
  );

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'shadow_banned', true);
END;
$$;

-- Function to start investigation
CREATE OR REPLACE FUNCTION public.start_investigation(p_user_id UUID, p_notes TEXT, p_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(p_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  INSERT INTO user_security_profile (user_id, under_investigation, investigation_started_at, investigation_notes)
  VALUES (p_user_id, true, now(), p_notes)
  ON CONFLICT (user_id) DO UPDATE SET
    under_investigation = true,
    investigation_started_at = now(),
    investigation_notes = p_notes,
    updated_at = now();

  PERFORM log_admin_action(
    p_admin_id, 'start_investigation', p_user_id, 'user_security_profile', NULL,
    NULL, jsonb_build_object('under_investigation', true, 'notes', p_notes), p_notes
  );

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'under_investigation', true);
END;
$$;-- =====================================================
-- LAYER 8: INFRASTRUCTURE & RUNTIME DEFENSE
-- =====================================================

-- RPC allow-list table
CREATE TABLE IF NOT EXISTS public.rpc_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL UNIQUE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  requires_auth BOOLEAN NOT NULL DEFAULT true,
  requires_admin BOOLEAN NOT NULL DEFAULT false,
  rate_limit_per_minute INTEGER DEFAULT 60,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.rpc_allowlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage RPC allowlist"
  ON public.rpc_allowlist FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Insert default allowed RPCs
INSERT INTO rpc_allowlist (function_name, requires_auth, requires_admin, description) VALUES
  ('mutate_balance', true, false, 'Balance mutation - internal use only'),
  ('check_idempotency', true, false, 'Idempotency check'),
  ('complete_idempotency', true, false, 'Complete idempotency'),
  ('log_admin_action', true, true, 'Admin audit logging'),
  ('check_rate_limit', false, false, 'Rate limiting'),
  ('record_login', true, false, 'Login recording'),
  ('analyze_trade_velocity', true, true, 'Trade velocity analysis'),
  ('shadow_ban_user', true, true, 'Shadow ban user'),
  ('start_investigation', true, true, 'Start investigation'),
  ('compromise_key', true, true, 'Key compromise kill-switch'),
  ('verify_audit_chain', true, true, 'Audit chain verification'),
  ('freeze_account', true, true, 'Account freeze'),
  ('create_forensic_snapshot', true, true, 'Forensic snapshot creation')
ON CONFLICT (function_name) DO NOTHING;

-- Blocked IP addresses table
CREATE TABLE IF NOT EXISTS public.ip_blocklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  ip_range_start INET,
  ip_range_end INET,
  block_type TEXT NOT NULL DEFAULT 'permanent' CHECK (block_type IN ('permanent', 'temporary', 'rate_limited')),
  reason TEXT NOT NULL,
  blocked_by UUID,
  blocked_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.ip_blocklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage IP blocklist"
  ON public.ip_blocklist FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_ip_blocklist_ip ON ip_blocklist(ip_address) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ip_blocklist_expires ON ip_blocklist(expires_at) WHERE expires_at IS NOT NULL;

-- Security events table for runtime monitoring
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  source TEXT NOT NULL,
  user_id UUID,
  ip_address TEXT,
  request_id TEXT,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  handled BOOLEAN NOT NULL DEFAULT false,
  handled_by UUID,
  handled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage security events"
  ON public.security_events FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity) WHERE severity IN ('error', 'critical');
CREATE INDEX IF NOT EXISTS idx_security_events_unhandled ON security_events(handled) WHERE handled = false;

-- Function to check if IP is blocked
CREATE OR REPLACE FUNCTION public.is_ip_blocked(p_ip_address TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_block ip_blocklist%ROWTYPE;
BEGIN
  SELECT * INTO v_block
  FROM ip_blocklist
  WHERE ip_address = p_ip_address
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'block_type', v_block.block_type,
      'reason', v_block.reason,
      'expires_at', v_block.expires_at
    );
  END IF;

  RETURN jsonb_build_object('blocked', false);
END;
$$;

-- Function to log security event
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type TEXT,
  p_severity TEXT,
  p_source TEXT,
  p_event_data JSONB,
  p_user_id UUID DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO security_events (
    event_type, severity, source, user_id, ip_address, request_id, event_data
  ) VALUES (
    p_event_type, p_severity, p_source, p_user_id, p_ip_address, p_request_id, p_event_data
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- Function to block IP
CREATE OR REPLACE FUNCTION public.block_ip(
  p_ip_address TEXT,
  p_reason TEXT,
  p_block_type TEXT DEFAULT 'permanent',
  p_expires_hours INTEGER DEFAULT NULL,
  p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_block_id UUID;
BEGIN
  IF p_admin_id IS NOT NULL AND NOT has_role(p_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  IF p_expires_hours IS NOT NULL THEN
    v_expires_at := now() + (p_expires_hours || ' hours')::interval;
  END IF;

  INSERT INTO ip_blocklist (ip_address, block_type, reason, blocked_by, expires_at)
  VALUES (p_ip_address, p_block_type, p_reason, p_admin_id, v_expires_at)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_block_id;

  IF v_block_id IS NOT NULL THEN
    PERFORM log_security_event(
      'ip_blocked', 'warning', 'block_ip',
      jsonb_build_object('ip_address', p_ip_address, 'reason', p_reason, 'expires_at', v_expires_at),
      p_admin_id, p_ip_address
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'block_id', v_block_id);
END;
$$;

-- Function to validate RPC call
CREATE OR REPLACE FUNCTION public.validate_rpc_call(
  p_function_name TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rpc rpc_allowlist%ROWTYPE;
BEGIN
  SELECT * INTO v_rpc
  FROM rpc_allowlist
  WHERE function_name = p_function_name AND is_enabled = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Function not in allowlist');
  END IF;

  IF v_rpc.requires_auth AND p_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Authentication required');
  END IF;

  IF v_rpc.requires_admin AND NOT has_role(p_user_id, 'admin') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Admin access required');
  END IF;

  RETURN jsonb_build_object(
    'allowed', true, 
    'rate_limit_per_minute', v_rpc.rate_limit_per_minute
  );
END;
$$;-- =====================================================
-- LAYER 9: CONTAINMENT & RECOVERY
-- =====================================================

-- Enhanced account freeze with full protocol
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS frozen BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS frozen_by UUID,
ADD COLUMN IF NOT EXISTS frozen_reason TEXT,
ADD COLUMN IF NOT EXISTS freeze_level TEXT DEFAULT 'none' CHECK (freeze_level IN ('none', 'soft', 'hard', 'total'));

-- Incident snapshots table
CREATE TABLE IF NOT EXISTS public.incident_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id TEXT NOT NULL,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('user', 'system', 'forensic', 'recovery')),
  target_user_id UUID,
  snapshot_data JSONB NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_exported BOOLEAN NOT NULL DEFAULT false,
  exported_at TIMESTAMP WITH TIME ZONE,
  exported_by UUID
);

ALTER TABLE public.incident_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage incident snapshots"
  ON public.incident_snapshots FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_incident_snapshots_incident ON incident_snapshots(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_snapshots_user ON incident_snapshots(target_user_id);

-- Disaster recovery checkpoints
CREATE TABLE IF NOT EXISTS public.recovery_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_name TEXT NOT NULL,
  checkpoint_type TEXT NOT NULL CHECK (checkpoint_type IN ('scheduled', 'manual', 'pre_migration', 'incident')),
  tables_included TEXT[] NOT NULL,
  row_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  checksum TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  verified_at TIMESTAMP WITH TIME ZONE,
  verified_by UUID,
  notes TEXT
);

ALTER TABLE public.recovery_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage recovery checkpoints"
  ON public.recovery_checkpoints FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Function to freeze account with protocol
CREATE OR REPLACE FUNCTION public.freeze_account(
  p_user_id UUID,
  p_freeze_level TEXT,
  p_reason TEXT,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_before_state JSONB;
BEGIN
  IF NOT has_role(p_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  IF p_freeze_level NOT IN ('none', 'soft', 'hard', 'total') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid freeze level');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_before_state := row_to_json(v_profile)::jsonb;

  -- Update profile freeze status
  UPDATE profiles SET
    frozen = (p_freeze_level != 'none'),
    blocked = (p_freeze_level IN ('hard', 'total')),
    frozen_at = CASE WHEN p_freeze_level != 'none' THEN now() ELSE NULL END,
    frozen_by = CASE WHEN p_freeze_level != 'none' THEN p_admin_id ELSE NULL END,
    frozen_reason = CASE WHEN p_freeze_level != 'none' THEN p_reason ELSE NULL END,
    freeze_level = p_freeze_level,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- Log the action
  PERFORM log_admin_action(
    p_admin_id, 
    CASE WHEN p_freeze_level = 'none' THEN 'unfreeze_account' ELSE 'freeze_account' END,
    p_user_id, 'profiles', v_profile.id,
    v_before_state,
    jsonb_build_object('freeze_level', p_freeze_level, 'frozen', p_freeze_level != 'none'),
    p_reason
  );

  -- Log security event
  PERFORM log_security_event(
    'account_frozen', 
    CASE WHEN p_freeze_level = 'total' THEN 'critical' ELSE 'warning' END,
    'freeze_account',
    jsonb_build_object('user_id', p_user_id, 'freeze_level', p_freeze_level, 'reason', p_reason),
    p_user_id
  );

  -- Send notification to user (except for total freeze to avoid tipping off)
  IF p_freeze_level != 'total' AND p_freeze_level != 'none' THEN
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (
      p_user_id,
      'Account Restricted',
      'Your account has been temporarily restricted. Please contact support for assistance.',
      'security'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'freeze_level', p_freeze_level,
    'frozen_at', now()
  );
END;
$$;

-- Function to create forensic snapshot
CREATE OR REPLACE FUNCTION public.create_forensic_snapshot(
  p_user_id UUID,
  p_incident_id TEXT,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot JSONB;
  v_snapshot_id UUID;
BEGIN
  IF NOT has_role(p_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  -- Collect all user data
  v_snapshot := jsonb_build_object(
    'snapshot_timestamp', now(),
    'incident_id', p_incident_id,
    'user_id', p_user_id,
    'profile', (SELECT row_to_json(p) FROM profiles p WHERE user_id = p_user_id),
    'security_profile', (SELECT row_to_json(s) FROM user_security_profile s WHERE user_id = p_user_id),
    'roles', (SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) FROM user_roles r WHERE user_id = p_user_id),
    'trades', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM trades t WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 500),
    'transactions', (SELECT COALESCE(jsonb_agg(row_to_json(tx)), '[]'::jsonb) FROM transactions tx WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 200),
    'financial_audit', (SELECT COALESCE(jsonb_agg(row_to_json(fa)), '[]'::jsonb) FROM financial_audit_log fa WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 500),
    'login_history', (SELECT COALESCE(jsonb_agg(row_to_json(lh)), '[]'::jsonb) FROM login_history lh WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 100),
    'notifications', (SELECT COALESCE(jsonb_agg(row_to_json(n)), '[]'::jsonb) FROM notifications n WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 100),
    'trade_velocity', (SELECT COALESCE(jsonb_agg(row_to_json(tv)), '[]'::jsonb) FROM trade_velocity tv WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 50)
  );

  -- Store the snapshot
  INSERT INTO incident_snapshots (
    incident_id, snapshot_type, target_user_id, snapshot_data, created_by
  ) VALUES (
    p_incident_id, 'forensic', p_user_id, v_snapshot, p_admin_id
  )
  RETURNING id INTO v_snapshot_id;

  -- Log the action
  PERFORM log_admin_action(
    p_admin_id, 'forensic_snapshot', p_user_id, 'incident_snapshots', v_snapshot_id,
    NULL, jsonb_build_object('snapshot_id', v_snapshot_id, 'incident_id', p_incident_id),
    'Forensic snapshot created for incident: ' || p_incident_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'snapshot_id', v_snapshot_id,
    'incident_id', p_incident_id,
    'user_id', p_user_id,
    'data_collected', jsonb_build_object(
      'trades', jsonb_array_length(v_snapshot->'trades'),
      'transactions', jsonb_array_length(v_snapshot->'transactions'),
      'audit_entries', jsonb_array_length(v_snapshot->'financial_audit'),
      'login_entries', jsonb_array_length(v_snapshot->'login_history')
    )
  );
END;
$$;

-- Function to create recovery checkpoint
CREATE OR REPLACE FUNCTION public.create_recovery_checkpoint(
  p_checkpoint_name TEXT,
  p_checkpoint_type TEXT,
  p_admin_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_counts JSONB;
  v_checkpoint_id UUID;
  v_checksum TEXT;
BEGIN
  IF NOT has_role(p_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  -- Get row counts for critical tables
  SELECT jsonb_build_object(
    'profiles', (SELECT COUNT(*) FROM profiles),
    'trades', (SELECT COUNT(*) FROM trades),
    'transactions', (SELECT COUNT(*) FROM transactions),
    'financial_audit_log', (SELECT COUNT(*) FROM financial_audit_log),
    'admin_audit_log', (SELECT COUNT(*) FROM admin_audit_log),
    'user_roles', (SELECT COUNT(*) FROM user_roles),
    'user_security_profile', (SELECT COUNT(*) FROM user_security_profile)
  ) INTO v_row_counts;

  -- Calculate checksum of row counts
  v_checksum := encode(sha256(v_row_counts::text::bytea), 'hex');

  INSERT INTO recovery_checkpoints (
    checkpoint_name, checkpoint_type, tables_included, row_counts, checksum, created_by, notes
  ) VALUES (
    p_checkpoint_name, p_checkpoint_type,
    ARRAY['profiles', 'trades', 'transactions', 'financial_audit_log', 'admin_audit_log', 'user_roles', 'user_security_profile'],
    v_row_counts, v_checksum, p_admin_id, p_notes
  )
  RETURNING id INTO v_checkpoint_id;

  RETURN jsonb_build_object(
    'success', true,
    'checkpoint_id', v_checkpoint_id,
    'checkpoint_name', p_checkpoint_name,
    'row_counts', v_row_counts,
    'checksum', v_checksum
  );
END;
$$;

-- Function to export user data (GDPR compliance + forensics)
CREATE OR REPLACE FUNCTION public.export_user_data(p_user_id UUID, p_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_export JSONB;
BEGIN
  IF NOT has_role(p_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  v_export := jsonb_build_object(
    'export_timestamp', now(),
    'user_id', p_user_id,
    'profile', (SELECT row_to_json(p) FROM profiles p WHERE user_id = p_user_id),
    'trades_summary', (
      SELECT jsonb_build_object(
        'total_trades', COUNT(*),
        'total_volume', COALESCE(SUM(amount), 0),
        'wins', COUNT(*) FILTER (WHERE result = 'win'),
        'losses', COUNT(*) FILTER (WHERE result = 'loss'),
        'total_pnl', COALESCE(SUM(pnl), 0)
      ) FROM trades WHERE user_id = p_user_id
    ),
    'transactions_summary', (
      SELECT jsonb_build_object(
        'total_deposits', COALESCE(SUM(amount) FILTER (WHERE type = 'deposit' AND status = 'completed'), 0),
        'total_withdrawals', COALESCE(SUM(amount) FILTER (WHERE type = 'withdraw' AND status = 'completed'), 0),
        'pending_count', COUNT(*) FILTER (WHERE status = 'pending')
      ) FROM transactions WHERE user_id = p_user_id
    ),
    'login_count', (SELECT COUNT(*) FROM login_history WHERE user_id = p_user_id),
    'account_created', (SELECT created_at FROM profiles WHERE user_id = p_user_id)
  );

  PERFORM log_admin_action(
    p_admin_id, 'export_user_data', p_user_id, 'profiles', NULL,
    NULL, jsonb_build_object('export_size', pg_column_size(v_export)),
    'User data exported for compliance'
  );

  RETURN jsonb_build_object('success', true, 'data', v_export);
END;
$$;-- Create indexes for performance (simple column indexes)
CREATE INDEX IF NOT EXISTS idx_financial_audit_source ON financial_audit_log(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_financial_audit_created ON financial_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_status_type ON transactions(status, type);
CREATE INDEX IF NOT EXISTS idx_trades_user_result ON trades(user_id, result, created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type, created_at);-- Create check_operation_allowed function for kill-switch functionality
CREATE OR REPLACE FUNCTION public.check_operation_allowed(p_operation text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setting platform_settings%ROWTYPE;
BEGIN
  -- Check for operation-specific kill-switch
  SELECT * INTO v_setting 
  FROM platform_settings 
  WHERE key = 'kill_' || p_operation;
  
  -- If kill-switch exists and is set to 'true', operation is blocked
  IF FOUND AND v_setting.value = 'true' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Operation disabled by admin');
  END IF;
  
  -- Check for global kill-switch
  SELECT * INTO v_setting 
  FROM platform_settings 
  WHERE key = 'kill_all';
  
  IF FOUND AND v_setting.value = 'true' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'All operations disabled');
  END IF;
  
  -- Operation allowed by default
  RETURN jsonb_build_object('allowed', true);
END;
$$;-- Add missing check_payout_circuit_breaker function
CREATE OR REPLACE FUNCTION public.check_payout_circuit_breaker(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_daily_limit numeric := 100000;
  v_hourly_limit numeric := 25000;
  v_today_total numeric;
  v_hour_total numeric;
  v_remaining numeric;
BEGIN
  -- Get configurable limits from platform_settings
  SELECT COALESCE((SELECT value::numeric FROM platform_settings WHERE key = 'daily_payout_limit'), v_daily_limit) INTO v_daily_limit;
  SELECT COALESCE((SELECT value::numeric FROM platform_settings WHERE key = 'hourly_payout_limit'), v_hourly_limit) INTO v_hourly_limit;

  -- Calculate today's total payouts
  SELECT COALESCE(SUM(amount), 0) INTO v_today_total
  FROM transactions
  WHERE type = 'withdraw'
    AND status = 'completed'
    AND created_at >= CURRENT_DATE;

  -- Calculate last hour's payouts
  SELECT COALESCE(SUM(amount), 0) INTO v_hour_total
  FROM transactions
  WHERE type = 'withdraw'
    AND status = 'completed'
    AND created_at >= now() - interval '1 hour';

  -- Check limits
  IF v_hour_total + p_amount > v_hourly_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Hourly payout limit reached',
      'current_hour_total', v_hour_total,
      'hourly_limit', v_hourly_limit,
      'remaining', v_hourly_limit - v_hour_total
    );
  END IF;

  IF v_today_total + p_amount > v_daily_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Daily payout limit reached',
      'current_day_total', v_today_total,
      'daily_limit', v_daily_limit,
      'remaining', v_daily_limit - v_today_total
    );
  END IF;

  v_remaining := LEAST(v_daily_limit - v_today_total, v_hourly_limit - v_hour_total);

  RETURN jsonb_build_object(
    'allowed', true,
    'current_day_total', v_today_total,
    'current_hour_total', v_hour_total,
    'remaining', v_remaining
  );
END;
$$;

-- Add honeypot tracking table for security traps
CREATE TABLE IF NOT EXISTS public.honeypot_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  user_agent text,
  endpoint_hit text NOT NULL,
  request_data jsonb DEFAULT '{}'::jsonb,
  triggered_at timestamp with time zone DEFAULT now(),
  action_taken text DEFAULT 'logged'
);

ALTER TABLE public.honeypot_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for honeypot" ON public.honeypot_triggers
FOR ALL USING (false);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_honeypot_ip ON honeypot_triggers(ip_address);
CREATE INDEX IF NOT EXISTS idx_honeypot_triggered ON honeypot_triggers(triggered_at);

-- Add request signature validation table
CREATE TABLE IF NOT EXISTS public.request_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  signature_hash text NOT NULL,
  timestamp_used bigint NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT now() + interval '5 minutes'
);

ALTER TABLE public.request_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for signatures" ON public.request_signatures
FOR ALL USING (false);

CREATE INDEX IF NOT EXISTS idx_signatures_hash ON request_signatures(signature_hash);
CREATE INDEX IF NOT EXISTS idx_signatures_expires ON request_signatures(expires_at);

-- Cleanup old signatures function
CREATE OR REPLACE FUNCTION public.cleanup_expired_signatures()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH deleted AS (
    DELETE FROM request_signatures WHERE expires_at < now() RETURNING *
  )
  SELECT count(*) INTO v_deleted FROM deleted;
  RETURN COALESCE(v_deleted, 0);
END;
$$;

-- Add default platform settings if not exists
INSERT INTO platform_settings (key, value) VALUES 
  ('daily_payout_limit', '100000'),
  ('hourly_payout_limit', '25000'),
  ('min_deposit', '100'),
  ('max_deposit', '5000'),
  ('min_withdrawal', '200'),
  ('max_withdrawal', '5000'),
  ('bet_min', '10'),
  ('bet_max', '5000'),
  ('win_probability', '30'),
  ('return_rate', '85')
ON CONFLICT (key) DO NOTHING;-- Notifications table is already created above, skipping duplicate
-- Enable realtime for transactions table (only if not already enabled)
DO $$
BEGIN
    -- Check if transactions table is already in the publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND tablename = 'transactions'
    ) THEN
        -- Add table to realtime publication
        ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
    END IF;
END $$;

-- Optional: Enable realtime for other admin-related tables if needed
-- DO $$
-- BEGIN
--     IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'profiles') THEN
--         ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
--     END IF;
-- END $$;
