-- Prevent anonymous users from calling internal SECURITY DEFINER functions directly
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;

-- Prevent authenticated users from calling internal SECURITY DEFINER functions directly
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;