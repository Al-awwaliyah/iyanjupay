/**
 * Safe, user-facing error handling.
 *
 * The edge functions only ever return messages that were written for
 * customers. This module is the second line of defence: any text that looks
 * technical (SQL, HTTP, stack traces, provider names, JSON, ...) is dropped
 * and replaced with a friendly fallback. Technical details stay in the
 * browser console / Supabase function logs.
 */

export const DEFAULT_ERROR_MESSAGE =
  "Something went wrong. Please try again.";

const TECHNICAL_PATTERNS: RegExp[] = [
  /edge function/i,
  /non-2xx/i,
  /failed to fetch|networkerror|load failed|fetch failed/i,
  /\bpostgres|\bpgrst|\bsql\b|syntax error|violates|duplicate key|relation ".*"/i,
  /\bjwt\b|\btoken\b|bearer|apikey|api key|secret/i,
  /supabase|topupmate|flutterwave|clubkonnect|bilalsadasub|peyflex|termii|twilio/i,
  /\bhttp\b|https?:\/\/|status code|\b[45]\d{2}\b/i,
  /undefined|\bnull\b|\[object|typeerror|referenceerror|cannot read/i,
  /stack|at \w+\.\w+ \(|\.ts:\d+|\.js:\d+/i,
  /^\s*[{[]/,
  /"success"\s*:|"error"\s*:/i,
  /rpc|_wallet\b|idempotency/i,
];

/** Returns the message only if it is safe to show to a customer. */
export function sanitizeMessage(
  value: unknown,
  fallback = DEFAULT_ERROR_MESSAGE,
): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text || text.length > 220) return fallback;
  if (TECHNICAL_PATTERNS.some((pattern) => pattern.test(text))) {
    return fallback;
  }

  return text;
}

/**
 * Picks the most relevant message from an Error, an edge-function payload
 * ({ success:false, error }) or a plain string, then sanitises it.
 */
export function getSafeErrorMessage(
  source: unknown,
  fallback = DEFAULT_ERROR_MESSAGE,
): string {
  if (!source) return fallback;

  if (typeof source === "string") {
    return sanitizeMessage(source, fallback);
  }

  if (typeof source === "object") {
    const record = source as Record<string, unknown>;

    for (const key of ["error", "message"]) {
      const candidate = record[key];
      if (typeof candidate === "string") {
        const safe = sanitizeMessage(candidate, "");
        if (safe) return safe;
      }
    }
  }

  return fallback;
}

/**
 * Reads the JSON body of a failed supabase.functions.invoke() call (the SDK
 * hides it behind a generic "non-2xx" message) and returns only its safe
 * customer message.
 */
export async function getFunctionErrorMessage(
  error: unknown,
  fallback = DEFAULT_ERROR_MESSAGE,
): Promise<string> {
  const context = (error as { context?: { json?: () => Promise<unknown> } })
    ?.context;

  if (context && typeof context.json === "function") {
    try {
      const payload = await context.json();
      console.error("Edge function error payload:", payload);
      return getSafeErrorMessage(payload, fallback);
    } catch {
      // Body was not JSON; fall through.
    }
  }

  console.error("Function error:", error);
  return getSafeErrorMessage(error, fallback);
}
