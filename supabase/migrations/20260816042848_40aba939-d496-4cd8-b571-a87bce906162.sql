REVOKE ALL ON FUNCTION public.ensure_wallet(uuid) FROM authenticated;
DROP FUNCTION IF EXISTS public.get_my_wallet();

DROP POLICY IF EXISTS "No client access to idempotency keys" ON public.idempotency_keys;
CREATE POLICY "No client access to idempotency keys" ON public.idempotency_keys
  FOR SELECT TO authenticated USING (false);