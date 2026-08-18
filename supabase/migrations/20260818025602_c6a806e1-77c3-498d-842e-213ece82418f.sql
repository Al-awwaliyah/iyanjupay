-- KYC fields on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bvn_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bvn_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS bvn_first_name text,
  ADD COLUMN IF NOT EXISTS bvn_last_name text;

-- Users must never be able to self-declare verification status
REVOKE UPDATE (bvn_verified, bvn_verified_at, kyc_status, kyc_level, bvn_first_name, bvn_last_name)
  ON public.profiles FROM authenticated;

-- Virtual cards issued through Flutterwave
CREATE TABLE IF NOT EXISTS public.virtual_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'flutterwave',
  provider_card_id text NOT NULL,
  masked_pan text,
  last4 text,
  card_type text,
  currency text NOT NULL DEFAULT 'NGN',
  name_on_card text,
  expiry_month text,
  expiry_year text,
  status text NOT NULL DEFAULT 'active',
  amount_funded numeric(20,4) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_card_id)
);

GRANT SELECT ON public.virtual_cards TO authenticated;
GRANT ALL ON public.virtual_cards TO service_role;

ALTER TABLE public.virtual_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own virtual cards" ON public.virtual_cards;
CREATE POLICY "Users can view their own virtual cards"
  ON public.virtual_cards FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS update_virtual_cards_updated_at ON public.virtual_cards;
CREATE TRIGGER update_virtual_cards_updated_at
  BEFORE UPDATE ON public.virtual_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS virtual_cards_user_id_idx ON public.virtual_cards (user_id);