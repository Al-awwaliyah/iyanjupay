-- Read-only administrative customer inspection (not authentication impersonation).
-- Apply after the existing admin/auth and wallet/transaction migrations.

CREATE TABLE IF NOT EXISTS public.admin_customer_inspection_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'expired')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  start_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  end_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT admin_customer_inspection_not_self CHECK (admin_user_id <> target_user_id)
);
CREATE INDEX IF NOT EXISTS admin_customer_inspection_admin_idx
  ON public.admin_customer_inspection_sessions(admin_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS admin_customer_inspection_target_idx
  ON public.admin_customer_inspection_sessions(target_user_id, started_at DESC);
ALTER TABLE public.admin_customer_inspection_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_customer_inspection_sessions FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.admin_customer_inspection_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.admin_customer_inspection_sessions(id) ON DELETE SET NULL,
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('started', 'viewed', 'ended', 'expired')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_customer_inspection_audit_admin_idx
  ON public.admin_customer_inspection_audit(admin_user_id, created_at DESC);
ALTER TABLE public.admin_customer_inspection_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_customer_inspection_audit FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_customer_inspection_assert_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF NOT (public.is_active_admin() OR public.is_active_support_admin()) THEN
    RAISE EXCEPTION 'Active administrator access required' USING ERRCODE = '42501';
  END IF;

  v_role := lower(coalesce(public.admin_management_current_role(), ''));
  IF v_role NOT IN (
    'super_admin', 'operations_admin', 'support_admin',
    'finance_admin', 'compliance_admin', 'read_only_admin',
    'operations', 'support', 'compliance', 'read_only'
  ) THEN
    RAISE EXCEPTION 'Administrator role is not permitted to inspect customers' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_customer_inspection_assert_admin() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_admin_customer_inspection(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_session public.admin_customer_inspection_sessions%ROWTYPE;
BEGIN
  PERFORM public.admin_customer_inspection_assert_admin();
  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Customer ID is required' USING ERRCODE = '22023';
  END IF;
  IF p_target_user_id = v_admin_id THEN
    RAISE EXCEPTION 'Administrators cannot inspect their own account' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_target_user_id) THEN
    RAISE EXCEPTION 'Customer account not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.admin_customer_inspection_sessions
    (admin_user_id, target_user_id, expires_at, start_metadata)
  VALUES
    (v_admin_id, p_target_user_id, now() + interval '30 minutes', jsonb_build_object('source', 'admin_customer_inspection'))
  RETURNING * INTO v_session;

  INSERT INTO public.admin_customer_inspection_audit
    (session_id, admin_user_id, target_user_id, action, metadata)
  VALUES
    (v_session.id, v_admin_id, p_target_user_id, 'started', jsonb_build_object('read_only', true));

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'target_user_id', v_session.target_user_id,
    'started_at', v_session.started_at,
    'expires_at', v_session.expires_at,
    'read_only', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_customer_inspection(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_session public.admin_customer_inspection_sessions%ROWTYPE;
  v_customer jsonb;
BEGIN
  PERFORM public.admin_customer_inspection_assert_admin();
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Inspection session ID is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_session
  FROM public.admin_customer_inspection_sessions s
  WHERE s.id = p_session_id
    AND s.admin_user_id = v_admin_id
    AND s.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inspection session is invalid or has ended' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.expires_at <= now() THEN
    UPDATE public.admin_customer_inspection_sessions
      SET status = 'expired', ended_at = now(), end_metadata = jsonb_build_object('reason', 'expired')
      WHERE id = v_session.id;
    INSERT INTO public.admin_customer_inspection_audit(session_id, admin_user_id, target_user_id, action, metadata)
      VALUES (v_session.id, v_admin_id, v_session.target_user_id, 'expired', '{}'::jsonb);
    RAISE EXCEPTION 'Inspection session expired. Start a new session.' USING ERRCODE = 'P0002';
  END IF;

  -- Explicit allowlist: never return BVN, NIN, PINs, auth tokens, provider secrets,
  -- wallet virtual-account numbers, transaction metadata, or provider references.
  SELECT jsonb_build_object(
    'profile', jsonb_build_object(
      'id', u.id,
      'full_name', p.full_name,
      'nickname', p.nickname,
      'email', u.email,
      'phone_number', p.phone_number,
      'gender', p.gender,
      'kyc_level', p.kyc_level,
      'kyc_status', p.kyc_status,
      'bvn_verified', coalesce(p.bvn_verified, false),
      'phone_verified', coalesce(p.phone_verified, false),
      'created_at', coalesce(p.created_at, u.created_at)
    ),
    'wallet', (
      SELECT jsonb_build_object(
        'id', w.id,
        'balance', w.balance,
        'held_balance', w.held_balance,
        'currency', w.currency,
        'status', w.status,
        'created_at', w.created_at,
        'updated_at', w.updated_at
      )
      FROM public.wallets w
      WHERE w.user_id = u.id
      LIMIT 1
    ),
    'transactions', coalesce((
      SELECT jsonb_agg(tj.transaction_json ORDER BY tj.created_at DESC)
      FROM (
        SELECT t.created_at,
          jsonb_build_object(
            'id', t.id,
            'transaction_type', t.transaction_type,
            'amount', t.amount,
            'currency', t.currency,
            'description', t.description,
            'status', t.status,
            'reference_number', t.reference_number,
            'category', t.category,
            'provider', t.provider,
            'created_at', t.created_at,
            'completed_at', t.completed_at
          ) AS transaction_json
        FROM public.transactions t
        WHERE t.user_id = u.id
        ORDER BY t.created_at DESC
        LIMIT 50
      ) tj
    ), '[]'::jsonb)
  ) INTO v_customer
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = v_session.target_user_id;

  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'Customer account not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.admin_customer_inspection_audit
    (session_id, admin_user_id, target_user_id, action, metadata)
  VALUES
    (v_session.id, v_admin_id, v_session.target_user_id, 'viewed', jsonb_build_object('transaction_count', jsonb_array_length(coalesce(v_customer->'transactions', '[]'::jsonb))));

  RETURN jsonb_build_object(
    'inspection', jsonb_build_object(
      'session_id', v_session.id,
      'target_user_id', v_session.target_user_id,
      'started_at', v_session.started_at,
      'expires_at', v_session.expires_at,
      'read_only', true
    ),
    'customer', v_customer
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.end_admin_customer_inspection(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_session public.admin_customer_inspection_sessions%ROWTYPE;
BEGIN
  PERFORM public.admin_customer_inspection_assert_admin();
  UPDATE public.admin_customer_inspection_sessions s
    SET status = 'ended', ended_at = now(), end_metadata = jsonb_build_object('reason', 'admin_ended')
    WHERE s.id = p_session_id
      AND s.admin_user_id = v_admin_id
      AND s.status = 'active'
    RETURNING s.* INTO v_session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active inspection session not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.admin_customer_inspection_audit
    (session_id, admin_user_id, target_user_id, action, metadata)
  VALUES (v_session.id, v_admin_id, v_session.target_user_id, 'ended', '{}'::jsonb);

  RETURN jsonb_build_object('session_id', v_session.id, 'status', 'ended', 'ended_at', v_session.ended_at);
END;
$$;

REVOKE ALL ON FUNCTION public.start_admin_customer_inspection(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_customer_inspection(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_admin_customer_inspection(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_admin_customer_inspection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_customer_inspection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_admin_customer_inspection(uuid) TO authenticated;
