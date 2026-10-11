-- IyanjuPay read-only admin customer dashboard inspection.
-- Customer accounts are sourced from auth.users, never from public.profiles.
-- This migration does not switch or impersonate Supabase Auth sessions.

CREATE TABLE IF NOT EXISTS public.admin_customer_inspection_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'expired')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  ended_at timestamptz,
  start_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  end_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT admin_customer_inspection_not_self CHECK (admin_user_id <> target_user_id)
);

CREATE INDEX IF NOT EXISTS admin_customer_inspection_admin_started_idx
  ON public.admin_customer_inspection_sessions (admin_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS admin_customer_inspection_target_started_idx
  ON public.admin_customer_inspection_sessions (target_user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_customer_inspection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.admin_customer_inspection_sessions(id) ON DELETE RESTRICT,
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('started', 'read_dashboard', 'ended', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS admin_customer_inspection_events_session_idx
  ON public.admin_customer_inspection_events (session_id, created_at DESC);

ALTER TABLE public.admin_customer_inspection_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_customer_inspection_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_customer_inspection_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admin_customer_inspection_events FROM PUBLIC, anon, authenticated;

-- Shared role gate: keep the project's existing admin role system authoritative.
CREATE OR REPLACE FUNCTION public.admin_customer_inspection_assert_admin()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_role text;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    COALESCE(public.is_active_admin(), false)
    OR COALESCE(public.is_active_support_admin(), false)
  ) THEN
    RAISE EXCEPTION 'Active administrator access required' USING ERRCODE = '42501';
  END IF;

  v_role := lower(COALESCE(public.admin_management_current_role(), ''));
  IF v_role NOT IN (
    'super_admin', 'operations_admin', 'support_admin',
    'finance_admin', 'compliance_admin', 'read_only_admin'
  ) THEN
    RAISE EXCEPTION 'This administrator role cannot inspect customer dashboards' USING ERRCODE = '42501';
  END IF;

  RETURN v_admin_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_customer_inspection_assert_admin() FROM PUBLIC, anon, authenticated;

-- Customer directory source: auth.users LEFT JOIN wallets. No profiles dependency.
CREATE OR REPLACE FUNCTION public.get_admin_auth_user_customers(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin_id uuid;
  v_search text := lower(trim(COALESCE(p_search, '')));
  v_result jsonb;
BEGIN
  v_admin_id := public.admin_customer_inspection_assert_admin();

  WITH matched AS (
    SELECT
      u.id,
      u.email,
      COALESCE(u.phone, u.raw_user_meta_data->>'phone_number', u.raw_user_meta_data->>'phone') AS phone_number,
      COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') AS full_name,
      u.raw_user_meta_data->>'nickname' AS nickname,
      u.created_at,
      w.id AS wallet_row_id,
      COALESCE(w.balance, 0)::numeric AS wallet_balance,
      COALESCE(NULLIF(to_jsonb(w)->>'held_balance', '')::numeric, 0)::numeric AS held_balance,
      COALESCE(NULLIF(to_jsonb(w)->>'currency', ''), 'NGN') AS wallet_currency,
      COALESCE(NULLIF(to_jsonb(w)->>'status', ''), 'active') AS wallet_status,
      (NULLIF(to_jsonb(w)->>'virtual_account_number', '') IS NOT NULL) AS has_virtual_account
    FROM auth.users u
    LEFT JOIN public.wallets w ON w.user_id = u.id
    WHERE v_search = ''
      OR lower(COALESCE(u.email, '')) LIKE '%' || v_search || '%'
      OR lower(COALESCE(u.raw_user_meta_data->>'full_name', '')) LIKE '%' || v_search || '%'
      OR lower(COALESCE(u.raw_user_meta_data->>'name', '')) LIKE '%' || v_search || '%'
      OR lower(COALESCE(u.raw_user_meta_data->>'nickname', '')) LIKE '%' || v_search || '%'
      OR lower(COALESCE(u.phone, u.raw_user_meta_data->>'phone_number', '')) LIKE '%' || v_search || '%'
      OR u.id::text ILIKE '%' || v_search || '%'
  ), page AS (
    SELECT * FROM matched
    ORDER BY created_at DESC NULLS LAST, id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'customers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'email', p.email,
        'phone_number', p.phone_number,
        'full_name', p.full_name,
        'nickname', p.nickname,
        'created_at', p.created_at,
        'kyc_level', 0,
        'kyc_status', 'unknown',
        'bvn_verified', false,
        'phone_verified', false,
        'wallet_id', p.wallet_row_id,
        'wallet_status', CASE WHEN p.wallet_row_id IS NULL THEN NULL ELSE p.wallet_status END,
        'wallet_balance', p.wallet_balance,
        'held_balance', p.held_balance,
        'wallet_currency', p.wallet_currency,
        'has_virtual_account', p.has_virtual_account
      )) FROM page p
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM matched)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_customer_inspection_start(p_target_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin_id uuid;
  v_session_id uuid;
BEGIN
  v_admin_id := public.admin_customer_inspection_assert_admin();

  IF p_target_user_id IS NULL OR p_target_user_id = v_admin_id THEN
    RAISE EXCEPTION 'A different customer account must be selected' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_target_user_id) THEN
    RAISE EXCEPTION 'Customer account not found in auth.users' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.admin_customer_inspection_sessions (
    admin_user_id, target_user_id, expires_at, start_metadata
  ) VALUES (
    v_admin_id, p_target_user_id, now() + interval '30 minutes',
    jsonb_build_object('source', 'admin_read_only_impersonation', 'mode', 'read_only')
  ) RETURNING id INTO v_session_id;

  INSERT INTO public.admin_customer_inspection_events (
    session_id, admin_user_id, target_user_id, action, metadata
  ) VALUES (
    v_session_id, v_admin_id, p_target_user_id, 'started',
    jsonb_build_object('mode', 'read_only', 'source', 'auth.users')
  );

  RETURN v_session_id;
END;
$$;

-- The payload is an allowlist built from auth.users, wallets, and transactions.
-- It intentionally excludes profiles, raw BVN/NIN, payment PINs, provider references,
-- virtual account numbers, auth tokens, and arbitrary transaction metadata.
CREATE OR REPLACE FUNCTION public.admin_customer_inspection_dashboard(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin_id uuid;
  v_target_id uuid;
  v_started_at timestamptz;
  v_expires_at timestamptz;
  v_user jsonb;
  v_wallet jsonb;
  v_transactions jsonb;
  v_notifications jsonb;
  v_announcement jsonb;
BEGIN
  v_admin_id := public.admin_customer_inspection_assert_admin();

  SELECT s.target_user_id, s.started_at, s.expires_at
    INTO v_target_id, v_started_at, v_expires_at
  FROM public.admin_customer_inspection_sessions s
  WHERE s.id = p_session_id
    AND s.admin_user_id = v_admin_id
    AND s.status = 'active'
    AND s.expires_at > now();

  IF v_target_id IS NULL THEN
    UPDATE public.admin_customer_inspection_sessions s
      SET status = 'expired', ended_at = now()
    WHERE s.id = p_session_id
      AND s.admin_user_id = v_admin_id
      AND s.status = 'active'
      AND s.expires_at <= now();

    RAISE EXCEPTION 'Inspection session is missing, ended, or expired' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'created_at', u.created_at,
    'user_metadata', jsonb_build_object(
      'full_name', COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
      'name', COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name')
    )
  ) INTO v_user
  FROM auth.users u
  WHERE u.id = v_target_id;

  SELECT CASE WHEN w.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id', w.id,
    'wallet_id', COALESCE(to_jsonb(w)->>'wallet_id', ''),
    'balance', COALESCE(w.balance, 0),
    'virtual_account_number', ''
  ) END INTO v_wallet
  FROM (SELECT 1) seed
  LEFT JOIN public.wallets w ON w.user_id = v_target_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'amount', t.amount,
    'transaction_type', t.transaction_type,
    'status', t.status,
    'category', to_jsonb(t)->>'category',
    'description', t.description,
    'metadata', jsonb_strip_nulls(jsonb_build_object(
      'direction', to_jsonb(t)->'metadata'->>'direction',
      'type', to_jsonb(t)->'metadata'->>'type',
      'transaction_type', to_jsonb(t)->'metadata'->>'transaction_type'
    )),
    'created_at', t.created_at
  ) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_transactions
  FROM (
    SELECT * FROM public.transactions
    WHERE user_id = v_target_id
    ORDER BY created_at DESC NULLS LAST
    LIMIT 500
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', n.id,
    'title', n.title,
    'message', n.message,
    'is_read', n.is_read,
    'created_at', n.created_at
  ) ORDER BY n.created_at DESC), '[]'::jsonb)
  INTO v_notifications
  FROM (
    SELECT id, title, message, is_read, created_at
    FROM public.notifications
    WHERE user_id = v_target_id
    ORDER BY created_at DESC NULLS LAST
    LIMIT 100
  ) n;

  SELECT jsonb_build_object(
    'id', n.id,
    'title', n.title,
    'message', n.message,
    'created_at', n.created_at,
    'metadata', jsonb_build_object(
      'expires_at', to_jsonb(n)->'metadata'->>'expires_at'
    )
  ) INTO v_announcement
  FROM public.notifications n
  WHERE n.user_id = v_target_id
    AND n.metadata @> '{"source":"admin","kind":"announcement"}'::jsonb
  ORDER BY n.created_at DESC NULLS LAST
  LIMIT 1;

  INSERT INTO public.admin_customer_inspection_events (
    session_id, admin_user_id, target_user_id, action, metadata
  ) VALUES (
    p_session_id, v_admin_id, v_target_id, 'read_dashboard',
    jsonb_build_object('read_only', true, 'data_source', 'auth.users')
  );

  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id', p_session_id,
      'target_user_id', v_target_id,
      'started_at', v_started_at,
      'expires_at', v_expires_at,
      'read_only', true
    ),
    'user', COALESCE(v_user, '{}'::jsonb),
    'wallet', v_wallet,
    'transactions', v_transactions,
    'notifications', COALESCE(v_notifications, '[]'::jsonb),
    'announcement', v_announcement
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_customer_inspection_end(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_target_id uuid;
  v_changed integer;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.admin_customer_inspection_sessions s
    SET status = 'ended', ended_at = now(),
        end_metadata = jsonb_build_object('reason', 'admin_ended')
  WHERE s.id = p_session_id
    AND s.admin_user_id = v_admin_id
    AND s.status = 'active'
  RETURNING s.target_user_id INTO v_target_id;

  GET DIAGNOSTICS v_changed = ROW_COUNT;

  IF v_changed > 0 THEN
    INSERT INTO public.admin_customer_inspection_events (
      session_id, admin_user_id, target_user_id, action, metadata
    ) VALUES (
      p_session_id, v_admin_id, v_target_id, 'ended', jsonb_build_object('reason', 'admin_ended')
    );
    RETURN true;
  END IF;

  -- Idempotent end: do not reveal another administrator's session.
  RETURN EXISTS (
    SELECT 1 FROM public.admin_customer_inspection_sessions s
    WHERE s.id = p_session_id AND s.admin_user_id = v_admin_id AND s.status IN ('ended', 'expired')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_auth_user_customers(text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_customer_inspection_start(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_customer_inspection_dashboard(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_customer_inspection_end(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_auth_user_customers(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_customer_inspection_start(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_customer_inspection_dashboard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_customer_inspection_end(uuid) TO authenticated;

COMMENT ON TABLE public.admin_customer_inspection_sessions IS
  'Short-lived read-only admin inspections of customer dashboards. Does not impersonate auth.users sessions.';
COMMENT ON TABLE public.admin_customer_inspection_events IS
  'Audit trail for admin customer dashboard inspections.';
