
-- Add missing columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS nickname text,
ADD COLUMN IF NOT EXISTS gender text,
ADD COLUMN IF NOT EXISTS date_of_birth date,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS bvn text,
ADD COLUMN IF NOT EXISTS nin text,
ADD COLUMN IF NOT EXISTS kyc_level integer DEFAULT 1;

-- Update the handle_new_user function to include new fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone_number, kyc_level)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'phone_number', ''),
    1
  );
  
  -- Create wallet for new user
  INSERT INTO public.wallets (user_id, virtual_account_number)
  VALUES (
    NEW.id,
    '70' || LPAD(FLOOR(RANDOM() * 100000000)::TEXT, 8, '0')
  );
  
  RETURN NEW;
END;
$function$;
