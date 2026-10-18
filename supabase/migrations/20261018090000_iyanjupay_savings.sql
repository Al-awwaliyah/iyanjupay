-- IyanjuPay Savings: recurring plans and ledger-backed contributions.
-- All wallet movements are performed by SECURITY DEFINER RPCs; clients cannot write balances.

ALTER TABLE public.ledger_accounts DROP CONSTRAINT IF EXISTS ledger_accounts_purpose_check;
ALTER TABLE public.ledger_accounts ADD CONSTRAINT ledger_accounts_purpose_check
  CHECK (purpose IN ('wallet_main','wallet_hold','funding','fees','payout','suspense','savings'));

CREATE TABLE IF NOT EXISTS public.savings_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'My Savings',
  frequency text NOT NULL CHECK (frequency IN ('daily','weekly','monthly','quarterly','bi_quarterly','yearly')),
  contribution_amount numeric(20,2) NOT NULL CHECK (contribution_amount > 0),
  balance numeric(20,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_saved numeric(20,2) NOT NULL DEFAULT 0 CHECK (total_saved >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  next_due_at date NOT NULL,
  last_contribution_at timestamptz,
  missed_contributions integer NOT NULL DEFAULT 0 CHECK (missed_contributions >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS savings_plans_due_idx ON public.savings_plans(status, next_due_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS savings_plans_user_idx ON public.savings_plans(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.savings_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.savings_plans(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE RESTRICT,
  amount numeric(20,2) NOT NULL CHECK (amount > 0),
  due_date date,
  contribution_type text NOT NULL CHECK (contribution_type IN ('scheduled','manual','withdrawal')),
  status text NOT NULL CHECK (status IN ('successful','failed')),
  reference_number text NOT NULL UNIQUE,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS savings_contributions_plan_due_unique
  ON public.savings_contributions(plan_id, due_date) WHERE due_date IS NOT NULL AND contribution_type = 'scheduled';
CREATE INDEX IF NOT EXISTS savings_contributions_user_idx ON public.savings_contributions(user_id, created_at DESC);

ALTER TABLE public.savings_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_contributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own savings plans" ON public.savings_plans;
CREATE POLICY "Users can read own savings plans" ON public.savings_plans FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can read own savings contributions" ON public.savings_contributions;
CREATE POLICY "Users can read own savings contributions" ON public.savings_contributions FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.savings_plans FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.savings_contributions FROM anon, authenticated;
GRANT SELECT ON public.savings_plans, public.savings_contributions TO authenticated;
GRANT ALL ON public.savings_plans, public.savings_contributions TO service_role;

DROP TRIGGER IF EXISTS savings_plans_updated_at ON public.savings_plans;
CREATE TRIGGER savings_plans_updated_at BEFORE UPDATE ON public.savings_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A separate ledger liability account per savings plan keeps savings out of the spendable wallet balance.
CREATE OR REPLACE FUNCTION public.ensure_savings_ledger_account(_plan_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.savings_plans; account_id uuid;
BEGIN
  SELECT * INTO p FROM public.savings_plans WHERE id = _plan_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Savings plan not found'; END IF;
  INSERT INTO public.ledger_accounts(code, name, account_type, purpose, user_id, currency)
  VALUES ('SAVINGS_PLAN_' || p.id::text, 'Savings plan: ' || p.name, 'liability', 'savings', p.user_id, 'NGN')
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO account_id;
  RETURN account_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_savings_ledger_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_savings_ledger_account(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.create_savings_plan(_name text, _frequency text, _amount numeric)
RETURNS public.savings_plans LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.savings_plans; first_due date; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _frequency NOT IN ('daily','weekly','monthly','quarterly','bi_quarterly','yearly') THEN RAISE EXCEPTION 'Invalid savings frequency'; END IF;
  IF _amount IS NULL OR round(_amount,2) <= 0 OR _amount > 100000000 THEN RAISE EXCEPTION 'Enter a valid savings amount'; END IF;
  IF length(trim(COALESCE(_name,''))) > 60 THEN RAISE EXCEPTION 'Savings name must be 60 characters or fewer'; END IF;
  first_due := CASE _frequency
    WHEN 'daily' THEN current_date + 1
    WHEN 'weekly' THEN current_date + 7
    WHEN 'monthly' THEN (current_date + interval '1 month')::date
    WHEN 'quarterly' THEN (current_date + interval '3 months')::date
    WHEN 'bi_quarterly' THEN (current_date + interval '6 months')::date
    WHEN 'yearly' THEN (current_date + interval '1 year')::date
  END;
  INSERT INTO public.savings_plans(user_id, name, frequency, contribution_amount, next_due_at)
  VALUES (uid, COALESCE(NULLIF(trim(_name),''),'My Savings'), _frequency, round(_amount,2), first_due)
  RETURNING * INTO p;
  PERFORM public.ensure_savings_ledger_account(p.id);
  RETURN p;
END;
$$;
REVOKE ALL ON FUNCTION public.create_savings_plan(text,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_savings_plan(text,text,numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_savings_plan_status(_plan_id uuid, _status text)
RETURNS public.savings_plans LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.savings_plans; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _status NOT IN ('active','paused','cancelled') THEN RAISE EXCEPTION 'Invalid savings status'; END IF;
  SELECT * INTO p FROM public.savings_plans WHERE id = _plan_id AND user_id = uid FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Savings plan not found'; END IF;
  IF p.status = 'cancelled' AND _status <> 'cancelled' THEN RAISE EXCEPTION 'Cancelled plans cannot be reactivated'; END IF;
  UPDATE public.savings_plans SET status = _status,
    next_due_at = CASE WHEN _status = 'active' AND p.status = 'paused' THEN CASE p.frequency
      WHEN 'daily' THEN current_date + 1
      WHEN 'weekly' THEN current_date + 7
      WHEN 'monthly' THEN (current_date + interval '1 month')::date
      WHEN 'quarterly' THEN (current_date + interval '3 months')::date
      WHEN 'bi_quarterly' THEN (current_date + interval '6 months')::date
      WHEN 'yearly' THEN (current_date + interval '1 year')::date
    END ELSE next_due_at END
    WHERE id = p.id RETURNING * INTO p;
  RETURN p;
END;
$$;
REVOKE ALL ON FUNCTION public.set_savings_plan_status(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_savings_plan_status(uuid,text) TO authenticated, service_role;

-- Core contribution helper. Locks the wallet, checks available funds and writes balanced ledger entries atomically.
CREATE OR REPLACE FUNCTION public.post_savings_contribution(_plan_id uuid, _amount numeric, _due_date date, _contribution_type text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.savings_plans; w public.wallets; main_account uuid; savings_account uuid; txn public.transactions; ref text; failure text;
BEGIN
  SELECT * INTO p FROM public.savings_plans WHERE id = _plan_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Savings plan not found'; END IF;
  IF _amount IS NULL OR round(_amount,2) <= 0 THEN RAISE EXCEPTION 'Contribution amount must be at least ₦0.01'; END IF;
  w := public.ensure_wallet(p.user_id);
  SELECT * INTO w FROM public.wallets WHERE id = w.id FOR UPDATE;
  SELECT id INTO main_account FROM public.ledger_accounts WHERE wallet_id = w.id AND purpose = 'wallet_main';
  savings_account := public.ensure_savings_ledger_account(p.id);
  ref := 'SAV_' || upper(replace(gen_random_uuid()::text, '-', ''));

  IF w.status <> 'active' THEN failure := 'Wallet is not active';
  ELSIF w.balance < _amount THEN failure := 'Insufficient wallet balance';
  END IF;

  IF failure IS NOT NULL THEN
    INSERT INTO public.savings_contributions(plan_id,user_id,amount,due_date,contribution_type,status,reference_number,failure_reason)
    VALUES (p.id,p.user_id,round(_amount,2),_due_date,_contribution_type,'failed',ref,failure);
    UPDATE public.savings_plans SET missed_contributions = missed_contributions + CASE WHEN _contribution_type = 'scheduled' THEN 1 ELSE 0 END WHERE id = p.id;
    RETURN false;
  END IF;

  INSERT INTO public.transactions(user_id,wallet_id,transaction_type,amount,description,status,reference_number,currency,category,provider,metadata,completed_at)
  VALUES (p.user_id,w.id,'savings_contribution',round(_amount,2),'Savings contribution - ' || p.name,'completed',ref,'NGN','savings','iyanjupay_savings',
    jsonb_build_object('savings_plan_id',p.id,'frequency',p.frequency,'contribution_type',_contribution_type,'due_date',_due_date),now()) RETURNING * INTO txn;
  PERFORM public.post_entry_pair(txn.id,main_account,savings_account,round(_amount,2),'DEBIT',p.user_id);
  PERFORM public.sync_wallet_balances(w.id);
  INSERT INTO public.savings_contributions(plan_id,user_id,transaction_id,amount,due_date,contribution_type,status,reference_number)
  VALUES (p.id,p.user_id,txn.id,round(_amount,2),_due_date,_contribution_type,'successful',ref);
  UPDATE public.savings_plans SET balance = balance + round(_amount,2), total_saved = total_saved + round(_amount,2), last_contribution_at = now() WHERE id = p.id;
  INSERT INTO public.transaction_events(transaction_id,user_id,event_type,payload)
  VALUES (txn.id,p.user_id,'savings.contribution',jsonb_build_object('plan_id',p.id,'amount',round(_amount,2),'reference',ref));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.post_savings_contribution(uuid,numeric,date,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_savings_contribution(uuid,numeric,date,text) TO service_role;

CREATE OR REPLACE FUNCTION public.withdraw_savings(_plan_id uuid, _amount numeric)
RETURNS public.transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); p public.savings_plans; w public.wallets; main_account uuid; savings_account uuid; txn public.transactions; ref text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _amount IS NULL OR round(_amount,2) <= 0 THEN RAISE EXCEPTION 'Withdrawal amount must be at least ₦0.01'; END IF;
  SELECT * INTO p FROM public.savings_plans WHERE id = _plan_id AND user_id = uid FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Savings plan not found'; END IF;
  IF p.balance < round(_amount,2) THEN RAISE EXCEPTION 'Withdrawal exceeds this savings balance'; END IF;
  w := public.ensure_wallet(uid);
  SELECT * INTO w FROM public.wallets WHERE id = w.id FOR UPDATE;
  IF w.status <> 'active' THEN RAISE EXCEPTION 'Wallet is not active'; END IF;
  SELECT id INTO main_account FROM public.ledger_accounts WHERE wallet_id = w.id AND purpose = 'wallet_main';
  savings_account := public.ensure_savings_ledger_account(p.id);
  ref := 'SAVW_' || upper(replace(gen_random_uuid()::text, '-', ''));
  INSERT INTO public.transactions(user_id,wallet_id,transaction_type,amount,description,status,reference_number,currency,category,provider,metadata,completed_at)
  VALUES(uid,w.id,'savings_withdrawal',round(_amount,2),'Savings withdrawal - ' || p.name,'completed',ref,'NGN','savings','iyanjupay_savings',jsonb_build_object('savings_plan_id',p.id),now()) RETURNING * INTO txn;
  PERFORM public.post_entry_pair(txn.id,savings_account,main_account,round(_amount,2),'CREDIT',uid);
  PERFORM public.sync_wallet_balances(w.id);
  UPDATE public.savings_plans SET balance = balance - round(_amount,2) WHERE id = p.id;
  INSERT INTO public.savings_contributions(plan_id,user_id,transaction_id,amount,contribution_type,status,reference_number)
  VALUES(p.id,uid,txn.id,round(_amount,2),'withdrawal','successful',ref);
  INSERT INTO public.transaction_events(transaction_id,user_id,event_type,payload)
  VALUES(txn.id,uid,'savings.withdrawal',jsonb_build_object('plan_id',p.id,'amount',round(_amount,2),'reference',ref));
  RETURN txn;
END;
$$;
REVOKE ALL ON FUNCTION public.withdraw_savings(uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_savings(uuid,numeric) TO authenticated, service_role;

-- Run once per day. Missed scheduled dates are skipped forward (never bulk-debited) and logged as failed if funds are insufficient.
CREATE OR REPLACE FUNCTION public.process_due_savings_contributions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.savings_plans; processed integer := 0; due_date date; next_date date;
BEGIN
  FOR p IN SELECT * FROM public.savings_plans WHERE status = 'active' AND next_due_at <= current_date ORDER BY next_due_at FOR UPDATE SKIP LOCKED LOOP
    due_date := p.next_due_at;
    PERFORM public.post_savings_contribution(p.id,p.contribution_amount,due_date,'scheduled');
    next_date := CASE p.frequency
      WHEN 'daily' THEN current_date + 1
      WHEN 'weekly' THEN current_date + 7
      WHEN 'monthly' THEN (current_date + interval '1 month')::date
      WHEN 'quarterly' THEN (current_date + interval '3 months')::date
      WHEN 'bi_quarterly' THEN (current_date + interval '6 months')::date
      WHEN 'yearly' THEN (current_date + interval '1 year')::date
    END;
    UPDATE public.savings_plans SET next_due_at = next_date WHERE id = p.id;
    processed := processed + 1;
  END LOOP;
  RETURN processed;
END;
$$;
REVOKE ALL ON FUNCTION public.process_due_savings_contributions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_due_savings_contributions() TO service_role;

-- Supabase-managed Postgres supports pg_cron. The job invokes only the database-side, atomic contribution processor.
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'iyanjupay-savings-contributions';
  PERFORM cron.schedule('iyanjupay-savings-contributions', '5 2 * * *', 'SELECT public.process_due_savings_contributions();');
EXCEPTION WHEN undefined_table OR undefined_function THEN
  RAISE NOTICE 'pg_cron is unavailable; configure a daily scheduler to call public.process_due_savings_contributions() with service_role privileges.';
END $$;
