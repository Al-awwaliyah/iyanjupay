/**
 * Returns a safe user-facing error message.
 *
 * Backend/Supabase/PostgreSQL/Edge Function details are intentionally
 * never displayed directly. Technical details remain available to
 * developers through console logging at the call site.
 */
export function getSafeErrorMessage(
  _error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  return fallback;
}
