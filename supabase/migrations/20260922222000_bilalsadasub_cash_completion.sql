ALTER TABLE public.bilalsadasub_cash_sessions
  ADD COLUMN IF NOT EXISTS provider_transid text,
  ADD COLUMN IF NOT EXISTS credited_amount numeric,
  ADD COLUMN IF NOT EXISTS completion_payload jsonb;

CREATE INDEX IF NOT EXISTS bilalsadasub_cash_sessions_transid_idx
  ON public.bilalsadasub_cash_sessions(provider_transid);
