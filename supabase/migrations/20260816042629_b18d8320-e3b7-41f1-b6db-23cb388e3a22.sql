-- =========================================================
-- 1. WALLETS hardening
-- =========================================================
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS held_balance numeric(20,4) NOT NULL DEFAULT 0;

ALTER TABLE public.wallets
  ALTER COLUMN balance TYPE numeric(20,4);

CREATE UNIQUE INDEX IF NOT EXISTS wallets_user_id_key ON public.wallets(user_id);

-- users must never mutate balances directly
DROP POLICY IF EXISTS "Users can update own wallet" ON public.wallets;
REVOKE INSERT, UPDATE, DELETE ON public.wallets FROM authenticated;
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;

-- =========================================================
-- 2. LEDGER ACCOUNTS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','revenue','expense','system')),
  purpose text NOT NULL CHECK (purpose IN ('wallet_main','wallet_hold','funding','fees','payout','suspense')),
  wallet_id uuid REFERENCES public.wallets(id) ON DELETE RESTRICT,
  user_id uuid,
  currency text NOT NULL DEFAULT 'NGN',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_accounts_wallet_idx ON public.ledger_accounts(wallet_id);

GRANT SELECT ON public.ledger_accounts TO authenticated;
GRANT ALL ON public.ledger_accounts TO service_role;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own ledger accounts" ON public.ledger_accounts;
CREATE POLICY "Users can view own ledger accounts" ON public.ledger_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- =========================================================
-- 3. TRANSACTIONS extension
-- =========================================================
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_reference text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS hold_transaction_id uuid REFERENCES public.transactions(id),
  ADD COLUMN IF NOT EXISTS reversal_of uuid REFERENCES public.transactions(id),
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE public.transactions ALTER COLUMN amount TYPE numeric(20,4);

CREATE UNIQUE INDEX IF NOT EXISTS transactions_reference_number_key ON public.transactions(reference_number);
CREATE INDEX IF NOT EXISTS transactions_user_created_idx ON public.transactions(user_id, created_at DESC);

REVOKE INSERT, UPDATE, DELETE ON public.transactions FROM authenticated;
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
DROP POLICY IF EXISTS "Users can create own transactions" ON public.transactions;

-- =========================================================
-- 4. LEDGER ENTRIES (immutable, balanced)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  ledger_account_id uuid NOT NULL REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT,
  user_id uuid,
  direction text NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
  entry_type text NOT NULL CHECK (entry_type IN ('CREDIT','DEBIT','HOLD','RELEASE','REFUND','REVERSAL','FEE')),
  amount numeric(20,4) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'NGN',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_entries_txn_idx ON public.ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS ledger_entries_account_idx ON public.ledger_entries(ledger_account_id);

GRANT SELECT ON public.ledger_entries TO authenticated;
GRANT SELECT, INSERT ON public.ledger_entries TO service_role;
GRANT ALL ON public.ledger_entries TO service_role;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own ledger entries" ON public.ledger_entries;
CREATE POLICY "Users can view own ledger entries" ON public.ledger_entries
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- immutability guard
CREATE OR REPLACE FUNCTION public.ledger_entries_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries are immutable: % is not allowed', TG_OP;
END;
$$;
REVOKE ALL ON FUNCTION public.ledger_entries_immutable() FROM PUBLIC, authenticated, anon;

DROP TRIGGER IF EXISTS ledger_entries_no_update ON public.ledger_entries;
CREATE TRIGGER ledger_entries_no_update BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.ledger_entries_immutable();

-- balanced-entries guard (deferred to end of transaction)
CREATE OR REPLACE FUNCTION public.ledger_entries_balanced()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  net numeric(20,4);
BEGIN
  SELECT COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END), 0)
    INTO net FROM public.ledger_entries WHERE transaction_id = NEW.transaction_id;
  IF net <> 0 THEN
    RAISE EXCEPTION 'Unbalanced ledger entries for transaction % (net %)', NEW.transaction_id, net;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.ledger_entries_balanced() FROM PUBLIC, authenticated, anon;

DROP TRIGGER IF EXISTS ledger_entries_balanced_check ON public.ledger_entries;
CREATE CONSTRAINT TRIGGER ledger_entries_balanced_check
  AFTER INSERT ON public.ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.ledger_entries_balanced();

-- =========================================================
-- 5. TRANSACTION EVENTS (append-only audit)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.transaction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  user_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transaction_events_txn_idx ON public.transaction_events(transaction_id);

GRANT SELECT ON public.transaction_events TO authenticated;
GRANT ALL ON public.transaction_events TO service_role;
ALTER TABLE public.transaction_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own transaction events" ON public.transaction_events;
CREATE POLICY "Users can view own transaction events" ON public.transaction_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS transaction_events_no_update ON public.transaction_events;
CREATE TRIGGER transaction_events_no_update BEFORE UPDATE OR DELETE ON public.transaction_events
  FOR EACH ROW EXECUTE FUNCTION public.ledger_entries_immutable();

-- =========================================================
-- 6. IDEMPOTENCY KEYS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key text PRIMARY KEY,
  user_id uuid,
  scope text NOT NULL,
  request_hash text,
  transaction_id uuid REFERENCES public.transactions(id),
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.idempotency_keys TO service_role;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 7. VIRTUAL ACCOUNTS (Flutterwave DVA)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.virtual_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  wallet_id uuid REFERENCES public.wallets(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'flutterwave',
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text,
  provider_reference text,
  order_reference text,
  is_permanent boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, account_number)
);
CREATE INDEX IF NOT EXISTS virtual_accounts_user_idx ON public.virtual_accounts(user_id);

GRANT SELECT ON public.virtual_accounts TO authenticated;
GRANT ALL ON public.virtual_accounts TO service_role;
ALTER TABLE public.virtual_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own virtual accounts" ON public.virtual_accounts;
CREATE POLICY "Users can view own virtual accounts" ON public.virtual_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS update_virtual_accounts_updated_at ON public.virtual_accounts;
CREATE TRIGGER update_virtual_accounts_updated_at BEFORE UPDATE ON public.virtual_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 8. SYSTEM LEDGER ACCOUNTS
-- =========================================================
INSERT INTO public.ledger_accounts (code, name, account_type, purpose)
VALUES
  ('SYS_FUNDING', 'Bank settlement / funding', 'asset', 'funding'),
  ('SYS_FEES', 'Platform fees revenue', 'revenue', 'fees'),
  ('SYS_PAYOUT', 'Payouts and purchases', 'expense', 'payout'),
  ('SYS_SUSPENSE', 'Suspense', 'system', 'suspense')
ON CONFLICT (code) DO NOTHING;

-- =========================================================
-- 9. CORE HELPERS
-- =========================================================
CREATE OR REPLACE FUNCTION public.ensure_wallet(_user_id uuid)
RETURNS public.wallets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w public.wallets;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user id required'; END IF;

  SELECT * INTO w FROM public.wallets WHERE user_id = _user_id;
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, balance, held_balance)
    VALUES (_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO w FROM public.wallets WHERE user_id = _user_id;
  END IF;

  INSERT INTO public.ledger_accounts (code, name, account_type, purpose, wallet_id, user_id)
  VALUES ('WALLET_MAIN_' || w.id, 'Wallet main', 'liability', 'wallet_main', w.id, _user_id)
  ON CONFLICT (code) DO NOTHING;

  INSERT INTO public.ledger_accounts (code, name, account_type, purpose, wallet_id, user_id)
  VALUES ('WALLET_HOLD_' || w.id, 'Wallet hold', 'liability', 'wallet_hold', w.id, _user_id)
  ON CONFLICT (code) DO NOTHING;

  RETURN w;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_wallet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_wallet(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_wallet()
RETURNS public.wallets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN public.ensure_wallet(auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_wallet() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_wallet() TO authenticated, service_role;

-- internal: post a balanced pair of entries
CREATE OR REPLACE FUNCTION public.post_entry_pair(
  _txn_id uuid, _debit_account uuid, _credit_account uuid,
  _amount numeric, _entry_type text, _user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  INSERT INTO public.ledger_entries (transaction_id, ledger_account_id, user_id, direction, entry_type, amount)
  VALUES (_txn_id, _debit_account, _user_id, 'DEBIT', _entry_type, _amount),
         (_txn_id, _credit_account, _user_id, 'CREDIT', _entry_type, _amount);
END;
$$;
REVOKE ALL ON FUNCTION public.post_entry_pair(uuid,uuid,uuid,numeric,text,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_wallet_balances(_wallet_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  main_bal numeric(20,4);
  hold_bal numeric(20,4);
BEGIN
  SELECT COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END), 0)
    INTO main_bal
  FROM public.ledger_entries e
  JOIN public.ledger_accounts a ON a.id = e.ledger_account_id
  WHERE a.wallet_id = _wallet_id AND a.purpose = 'wallet_main';

  SELECT COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END), 0)
    INTO hold_bal
  FROM public.ledger_entries e
  JOIN public.ledger_accounts a ON a.id = e.ledger_account_id
  WHERE a.wallet_id = _wallet_id AND a.purpose = 'wallet_hold';

  IF main_bal < 0 THEN RAISE EXCEPTION 'Wallet balance cannot go negative'; END IF;
  IF hold_bal < 0 THEN RAISE EXCEPTION 'Held balance cannot go negative'; END IF;

  UPDATE public.wallets SET balance = main_bal, held_balance = hold_bal WHERE id = _wallet_id;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_wallet_balances(uuid) FROM PUBLIC, anon, authenticated;

-- =========================================================
-- 10. WALLET OPERATIONS
-- =========================================================
CREATE OR REPLACE FUNCTION public.wallet_operation(
  _user_id uuid,
  _operation text,
  _amount numeric,
  _description text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _reference text DEFAULT NULL,
  _provider text DEFAULT NULL,
  _provider_reference text DEFAULT NULL,
  _category text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _hold_transaction_id uuid DEFAULT NULL
) RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w public.wallets;
  main_acct uuid;
  hold_acct uuid;
  sys_funding uuid;
  sys_fees uuid;
  sys_payout uuid;
  txn public.transactions;
  existing_txn_id uuid;
  ref text;
  hold_txn public.transactions;
  available numeric(20,4);
BEGIN
  IF _operation NOT IN ('CREDIT','DEBIT','HOLD','RELEASE','REFUND','FEE') THEN
    RAISE EXCEPTION 'Unsupported operation %', _operation;
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  -- idempotency: return the original transaction on replay
  IF _idempotency_key IS NOT NULL THEN
    SELECT transaction_id INTO existing_txn_id FROM public.idempotency_keys WHERE key = _idempotency_key;
    IF existing_txn_id IS NOT NULL THEN
      SELECT * INTO txn FROM public.transactions WHERE id = existing_txn_id;
      RETURN txn;
    END IF;
  END IF;

  w := public.ensure_wallet(_user_id);
  -- serialise concurrent movements on this wallet
  SELECT * INTO w FROM public.wallets WHERE id = w.id FOR UPDATE;

  IF w.status <> 'active' THEN RAISE EXCEPTION 'Wallet is not active'; END IF;

  SELECT id INTO main_acct FROM public.ledger_accounts WHERE wallet_id = w.id AND purpose = 'wallet_main';
  SELECT id INTO hold_acct FROM public.ledger_accounts WHERE wallet_id = w.id AND purpose = 'wallet_hold';
  SELECT id INTO sys_funding FROM public.ledger_accounts WHERE code = 'SYS_FUNDING';
  SELECT id INTO sys_fees FROM public.ledger_accounts WHERE code = 'SYS_FEES';
  SELECT id INTO sys_payout FROM public.ledger_accounts WHERE code = 'SYS_PAYOUT';

  available := w.balance;

  IF _operation IN ('DEBIT','HOLD','FEE') AND available < _amount THEN
    RAISE EXCEPTION 'Insufficient funds: available %, required %', available, _amount;
  END IF;

  ref := COALESCE(_reference, upper(_operation) || '_' || replace(gen_random_uuid()::text, '-', ''));

  INSERT INTO public.transactions (
    user_id, wallet_id, transaction_type, amount, description, status, reference_number,
    currency, category, provider, provider_reference, idempotency_key, metadata,
    hold_transaction_id, completed_at
  ) VALUES (
    _user_id, w.id, lower(_operation), _amount, _description, 'completed', ref,
    w.currency, _category, _provider, _provider_reference, _idempotency_key, COALESCE(_metadata, '{}'::jsonb),
    _hold_transaction_id, now()
  ) RETURNING * INTO txn;

  IF _operation = 'CREDIT' THEN
    PERFORM public.post_entry_pair(txn.id, sys_funding, main_acct, _amount, 'CREDIT', _user_id);
  ELSIF _operation = 'REFUND' THEN
    PERFORM public.post_entry_pair(txn.id, sys_payout, main_acct, _amount, 'REFUND', _user_id);
  ELSIF _operation = 'DEBIT' THEN
    PERFORM public.post_entry_pair(txn.id, main_acct, sys_payout, _amount, 'DEBIT', _user_id);
  ELSIF _operation = 'FEE' THEN
    PERFORM public.post_entry_pair(txn.id, main_acct, sys_fees, _amount, 'FEE', _user_id);
  ELSIF _operation = 'HOLD' THEN
    PERFORM public.post_entry_pair(txn.id, main_acct, hold_acct, _amount, 'HOLD', _user_id);
  ELSIF _operation = 'RELEASE' THEN
    IF _hold_transaction_id IS NULL THEN RAISE EXCEPTION 'hold transaction id required for RELEASE'; END IF;
    SELECT * INTO hold_txn FROM public.transactions
      WHERE id = _hold_transaction_id AND user_id = _user_id AND transaction_type = 'hold';
    IF hold_txn.id IS NULL THEN RAISE EXCEPTION 'Hold transaction not found'; END IF;
    IF hold_txn.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'Hold already settled'; END IF;
    IF _amount > hold_txn.amount THEN RAISE EXCEPTION 'Release exceeds held amount'; END IF;
    IF w.held_balance < _amount THEN RAISE EXCEPTION 'Insufficient held funds'; END IF;
    UPDATE public.transactions SET reversed_at = now() WHERE id = hold_txn.id;
    PERFORM public.post_entry_pair(txn.id, hold_acct, main_acct, _amount, 'RELEASE', _user_id);
  END IF;

  PERFORM public.sync_wallet_balances(w.id);

  INSERT INTO public.transaction_events (transaction_id, user_id, event_type, payload)
  VALUES (txn.id, _user_id, 'transaction.' || lower(_operation), jsonb_build_object('amount', _amount, 'reference', ref));

  IF _idempotency_key IS NOT NULL THEN
    INSERT INTO public.idempotency_keys (key, user_id, scope, transaction_id)
    VALUES (_idempotency_key, _user_id, lower(_operation), txn.id)
    ON CONFLICT (key) DO NOTHING;
  END IF;

  SELECT * INTO txn FROM public.transactions WHERE id = txn.id;
  RETURN txn;
END;
$$;
REVOKE ALL ON FUNCTION public.wallet_operation(uuid,text,numeric,text,text,text,text,text,text,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_operation(uuid,text,numeric,text,text,text,text,text,text,jsonb,uuid) TO service_role;

-- thin named wrappers (server-side only)
CREATE OR REPLACE FUNCTION public.credit_wallet(_user_id uuid, _amount numeric, _description text DEFAULT NULL, _idempotency_key text DEFAULT NULL, _reference text DEFAULT NULL, _provider text DEFAULT NULL, _provider_reference text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS public.transactions LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.wallet_operation(_user_id, 'CREDIT', _amount, _description, _idempotency_key, _reference, _provider, _provider_reference, 'funding', _metadata, NULL);
$$;

CREATE OR REPLACE FUNCTION public.debit_wallet(_user_id uuid, _amount numeric, _description text DEFAULT NULL, _idempotency_key text DEFAULT NULL, _reference text DEFAULT NULL, _category text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS public.transactions LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.wallet_operation(_user_id, 'DEBIT', _amount, _description, _idempotency_key, _reference, NULL, NULL, _category, _metadata, NULL);
$$;

CREATE OR REPLACE FUNCTION public.hold_funds(_user_id uuid, _amount numeric, _description text DEFAULT NULL, _idempotency_key text DEFAULT NULL, _reference text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS public.transactions LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.wallet_operation(_user_id, 'HOLD', _amount, _description, _idempotency_key, _reference, NULL, NULL, 'hold', _metadata, NULL);
$$;

CREATE OR REPLACE FUNCTION public.release_funds(_user_id uuid, _hold_transaction_id uuid, _amount numeric, _description text DEFAULT NULL, _idempotency_key text DEFAULT NULL)
RETURNS public.transactions LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.wallet_operation(_user_id, 'RELEASE', _amount, _description, _idempotency_key, NULL, NULL, NULL, 'hold_release', '{}'::jsonb, _hold_transaction_id);
$$;

CREATE OR REPLACE FUNCTION public.refund_wallet(_user_id uuid, _amount numeric, _description text DEFAULT NULL, _idempotency_key text DEFAULT NULL, _reference text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS public.transactions LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.wallet_operation(_user_id, 'REFUND', _amount, _description, _idempotency_key, _reference, NULL, NULL, 'refund', _metadata, NULL);
$$;

CREATE OR REPLACE FUNCTION public.charge_fee(_user_id uuid, _amount numeric, _description text DEFAULT NULL, _idempotency_key text DEFAULT NULL, _reference text DEFAULT NULL)
RETURNS public.transactions LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.wallet_operation(_user_id, 'FEE', _amount, _description, _idempotency_key, _reference, NULL, NULL, 'fee', '{}'::jsonb, NULL);
$$;

CREATE OR REPLACE FUNCTION public.reverse_transaction(_transaction_id uuid, _reason text DEFAULT NULL, _idempotency_key text DEFAULT NULL)
RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  orig public.transactions;
  w public.wallets;
  txn public.transactions;
  e record;
  existing_txn_id uuid;
BEGIN
  IF _idempotency_key IS NOT NULL THEN
    SELECT transaction_id INTO existing_txn_id FROM public.idempotency_keys WHERE key = _idempotency_key;
    IF existing_txn_id IS NOT NULL THEN
      SELECT * INTO txn FROM public.transactions WHERE id = existing_txn_id;
      RETURN txn;
    END IF;
  END IF;

  SELECT * INTO orig FROM public.transactions WHERE id = _transaction_id;
  IF orig.id IS NULL THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF orig.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'Transaction already reversed'; END IF;
  IF orig.status <> 'completed' THEN RAISE EXCEPTION 'Only completed transactions can be reversed'; END IF;

  SELECT * INTO w FROM public.wallets WHERE id = orig.wallet_id FOR UPDATE;

  INSERT INTO public.transactions (
    user_id, wallet_id, transaction_type, amount, description, status, reference_number,
    currency, category, idempotency_key, metadata, reversal_of, completed_at
  ) VALUES (
    orig.user_id, orig.wallet_id, 'reversal', orig.amount,
    COALESCE(_reason, 'Reversal of ' || orig.reference_number), 'completed',
    'REV_' || replace(gen_random_uuid()::text, '-', ''),
    orig.currency, 'reversal', _idempotency_key, jsonb_build_object('reason', _reason), orig.id, now()
  ) RETURNING * INTO txn;

  -- mirror every original entry with the opposite direction
  FOR e IN SELECT * FROM public.ledger_entries WHERE transaction_id = orig.id LOOP
    INSERT INTO public.ledger_entries (transaction_id, ledger_account_id, user_id, direction, entry_type, amount, currency)
    VALUES (txn.id, e.ledger_account_id, e.user_id,
            CASE WHEN e.direction = 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END,
            'REVERSAL', e.amount, e.currency);
  END LOOP;

  UPDATE public.transactions SET reversed_at = now(), status = 'reversed' WHERE id = orig.id;

  PERFORM public.sync_wallet_balances(orig.wallet_id);

  INSERT INTO public.transaction_events (transaction_id, user_id, event_type, payload)
  VALUES (orig.id, orig.user_id, 'transaction.reversed', jsonb_build_object('reversal_id', txn.id, 'reason', _reason));

  IF _idempotency_key IS NOT NULL THEN
    INSERT INTO public.idempotency_keys (key, user_id, scope, transaction_id)
    VALUES (_idempotency_key, orig.user_id, 'reversal', txn.id) ON CONFLICT (key) DO NOTHING;
  END IF;

  RETURN txn;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_wallet(uuid,numeric,text,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.debit_wallet(uuid,numeric,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hold_funds(uuid,numeric,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_funds(uuid,uuid,numeric,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_wallet(uuid,numeric,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.charge_fee(uuid,numeric,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_transaction(uuid,text,text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.credit_wallet(uuid,numeric,text,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_wallet(uuid,numeric,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.hold_funds(uuid,numeric,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_funds(uuid,uuid,numeric,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_wallet(uuid,numeric,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.charge_fee(uuid,numeric,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(uuid,text,text) TO service_role;

-- backfill: ledger accounts for existing wallets
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id FROM public.wallets LOOP
    PERFORM public.ensure_wallet(r.user_id);
  END LOOP;
END $$;