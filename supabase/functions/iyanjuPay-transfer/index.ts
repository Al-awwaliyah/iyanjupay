import {
  corsHeaders,
  json,
  adminClient,
  getUser,
} from "../_shared/auth.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * IyanjuPay — Internal Wallet Transfer
 *
 * Flow:
 *
 * 1. Receive authenticated user's JWT.
 * 2. Authenticate the user.
 * 3. Create a USER-SCOPED Supabase client using that JWT.
 * 4. Call execute_internal_transfer() through that client.
 *
 * IMPORTANT:
 *
 * The internal-transfer RPC uses auth.uid().
 *
 * Therefore the RPC MUST NOT be called using the service-role
 * client because auth.uid() would be NULL.
 *
 * adminClient is only used for trusted server-side operations
 * where appropriate. The transfer RPC itself is called using
 * the authenticated user's JWT.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  "";

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  ) {
    return String(
      (error as { message?: unknown }).message ?? "Unknown error",
    );
  }

  return String(error);
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

function isValidWalletId(value: string): boolean {
  /**
   * IyanjuPay public wallet IDs are 8 digits.
   *
   * Keep this validation aligned with the wallets.wallet_id
   * format used by the application.
   */
  return /^\d{8}$/.test(value);
}

function isValidIdempotencyKey(value: string): boolean {
  return value.length >= 1 && value.length <= 255;
}

Deno.serve(async (req: Request): Promise<Response> => {
  /**
   * ============================================================
   * CORS
   * ============================================================
   */

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      {
        success: false,
        error: "Method not allowed",
      },
      405,
    );
  }

  try {
    /**
     * ==========================================================
     * 1. READ AUTHORIZATION HEADER
     * ==========================================================
     */

    const authorization =
      req.headers.get("Authorization") ??
      req.headers.get("authorization");

    if (!authorization) {
      console.error(
        "IyanjuPay transfer rejected: Authorization header missing",
      );

      return json(
        {
          success: false,
          error: "Authentication required",
        },
        401,
      );
    }

    if (!authorization.startsWith("Bearer ")) {
      console.error(
        "IyanjuPay transfer rejected: Invalid Authorization header",
      );

      return json(
        {
          success: false,
          error: "Invalid authorization token",
        },
        401,
      );
    }

    const accessToken = authorization.substring("Bearer ".length).trim();

    if (!accessToken) {
      return json(
        {
          success: false,
          error: "Authentication token is missing",
        },
        401,
      );
    }

    /**
     * ==========================================================
     * 2. AUTHENTICATE USER
     * ==========================================================
     *
     * getUser() is responsible for validating the JWT.
     *
     * We intentionally do NOT trust a user_id sent by the
     * frontend.
     */

    const user = await getUser(req);

    if (!user) {
      console.error(
        "IyanjuPay transfer rejected: User authentication failed",
      );

      return json(
        {
          success: false,
          error: "Authentication required",
        },
        401,
      );
    }

    const authenticatedUserId = user.id;

    console.log(
      "IyanjuPay transfer authenticated user:",
      authenticatedUserId,
    );

    /**
     * ==========================================================
     * 3. CREATE USER-SCOPED SUPABASE CLIENT
     * ==========================================================
     *
     * THIS IS THE IMPORTANT FIX.
     *
     * Do NOT use adminClient.rpc() for execute_internal_transfer().
     *
     * The RPC contains:
     *
     *     auth.uid()
     *
     * and therefore must receive the user's JWT.
     */

    if (!SUPABASE_URL) {
      throw new Error("SUPABASE_URL is not configured");
    }

    if (!SUPABASE_ANON_KEY) {
      throw new Error(
        "SUPABASE_ANON_KEY/SUPABASE_PUBLISHABLE_KEY is not configured",
      );
    }

    const userClient = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },

        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      },
    );

    /**
     * ==========================================================
     * 4. READ REQUEST BODY
     * ==========================================================
     */

    let body: Record<string, unknown>;

    try {
      body = await req.json();
    } catch {
      return json(
        {
          success: false,
          error: "Invalid JSON request body",
        },
        400,
      );
    }

    /**
     * ==========================================================
     * 5. EXTRACT INPUT
     * ==========================================================
     *
     * Supported frontend names:
     *
     * recipient_wallet_id
     * recipientWalletId
     *
     * amount
     *
     * narration
     *
     * idempotency_key
     * idempotencyKey
     */

    const recipientWalletId = String(
      body.recipient_wallet_id ??
        body.recipientWalletId ??
        "",
    ).trim();

    const narration = String(
      body.narration ??
        body.description ??
        "",
    ).trim();

    const rawAmount =
      body.amount;

    const rawIdempotencyKey =
      body.idempotency_key ??
      body.idempotencyKey ??
      crypto.randomUUID();

    const idempotencyKey = String(
      rawIdempotencyKey,
    ).trim();

    /**
     * ==========================================================
     * 6. VALIDATE RECIPIENT WALLET
     * ==========================================================
     */

    if (!recipientWalletId) {
      return json(
        {
          success: false,
          error: "Recipient wallet ID is required",
        },
        400,
      );
    }

    if (!isValidWalletId(recipientWalletId)) {
      return json(
        {
          success: false,
          error:
            "Invalid recipient wallet ID. Enter the 8-digit IyanjuPay wallet ID.",
        },
        400,
      );
    }

    /**
     * ==========================================================
     * 7. VALIDATE AMOUNT
     * ==========================================================
     */

    const amount =
      typeof rawAmount === "number"
        ? rawAmount
        : Number(rawAmount);

    if (!Number.isFinite(amount)) {
      return json(
        {
          success: false,
          error: "Invalid transfer amount",
        },
        400,
      );
    }

    if (amount <= 0) {
      return json(
        {
          success: false,
          error:
            "Transfer amount must be greater than zero",
        },
        400,
      );
    }

    /**
     * Monetary precision.
     *
     * Prevent values such as:
     *
     * 100.123
     */

    const roundedAmount =
      Math.round((amount + Number.EPSILON) * 100) / 100;

    if (Math.abs(amount - roundedAmount) > 0.00000001) {
      return json(
        {
          success: false,
          error:
            "Transfer amount cannot have more than 2 decimal places",
        },
        400,
      );
    }

    /**
     * ==========================================================
     * 8. VALIDATE IDEMPOTENCY KEY
     * ==========================================================
     */

    if (!isValidIdempotencyKey(idempotencyKey)) {
      return json(
        {
          success: false,
          error: "Invalid idempotency key",
        },
        400,
      );
    }

    /**
     * ==========================================================
     * 9. OPTIONAL NARRATION LIMIT
     * ==========================================================
     */

    if (narration.length > 500) {
      return json(
        {
          success: false,
          error:
            "Narration cannot exceed 500 characters",
        },
        400,
      );
    }

    /**
     * ==========================================================
     * 10. LOG REQUEST
     * ==========================================================
     *
     * Never log access tokens, passwords, PINs, or sensitive
     * authentication data.
     */

    console.log(
      "Calling execute_internal_transfer:",
      {
        sender_user_id: authenticatedUserId,
        recipient_wallet_id: recipientWalletId,
        amount: roundedAmount,
      },
    );

    /**
     * ==========================================================
     * 11. CALL INTERNAL TRANSFER RPC
     * ==========================================================
     *
     * CRITICAL:
     *
     * userClient.rpc()
     *
     * NOT:
     *
     * adminClient.rpc()
     *
     * Because execute_internal_transfer() uses auth.uid().
     */

    const { data, error } =
      await userClient.rpc(
        "execute_internal_transfer",
        {
          _sender_user_id: authenticatedUserId,

          _recipient_wallet_id:
            recipientWalletId,

          _amount: roundedAmount,

          _narration:
            narration || null,

          _idempotency_key:
            idempotencyKey,
        },
      );

    /**
     * ==========================================================
     * 12. HANDLE RPC ERROR
     * ==========================================================
     */

    if (error) {
      console.error(
        "Internal transfer RPC failed:",
        {
          code: error.code,
          details: error.details,
          hint: error.hint,
          message: error.message,
        },
      );

      /**
       * Authentication errors
       */

      if (
        error.message ===
          "Authentication required" ||
        error.message ===
          "Unauthorized transfer request"
      ) {
        return json(
          {
            success: false,
            error:
              "Your authentication session is invalid or expired. Please sign in again.",
          },
          401,
        );
      }

      /**
       * Common user-facing validation errors.
       *
       * These originate from the secure RPC.
       */

      const knownUserErrors = [
        "Sender wallet not found",
        "Recipient wallet not found",
        "You cannot transfer money to yourself",
        "Sender wallet is not active",
        "Recipient wallet is not active",
        "Only NGN wallet transfers are supported",
        "Insufficient wallet balance",
        "Transfer amount must be greater than zero",
        "Transfer amount cannot have more than 2 decimal places",
        "Recipient wallet is required",
        "Sender user ID is required",
        "Unable to debit sender wallet",
        "Unable to credit recipient wallet",
      ];

      if (
        knownUserErrors.includes(error.message)
      ) {
        return json(
          {
            success: false,
            error: error.message,
          },
          400,
        );
      }

      /**
       * Do not expose internal database details to the
       * frontend.
       */

      return json(
        {
          success: false,
          error:
            "Unable to complete the wallet transfer",
        },
        500,
      );
    }

    /**
     * ==========================================================
     * 13. VALIDATE RPC RESULT
     * ==========================================================
     */

    if (!data) {
      console.error(
        "Internal transfer RPC returned no data",
      );

      return json(
        {
          success: false,
          error:
            "Transfer could not be completed",
        },
        500,
      );
    }

    /**
     * ==========================================================
     * 14. NORMALIZE RESULT
     * ==========================================================
     */

    const result =
      typeof data === "object" &&
      data !== null
        ? data as Record<string, unknown>
        : {
            result: data,
          };

    /**
     * ==========================================================
     * 15. SUCCESS RESPONSE
     * ==========================================================
     */

    console.log(
      "IyanjuPay internal transfer completed:",
      {
        sender_user_id:
          authenticatedUserId,

        recipient_wallet_id:
          recipientWalletId,

        amount:
          roundedAmount,

        reference:
          result.reference ?? null,

        already_processed:
          result.already_processed ?? false,
      },
    );

    return json(
      {
        success: true,

        ...result,
      },
      200,
    );
  } catch (error) {
    console.error(
      "IyanjuPay transfer unexpected error:",
      errorMessage(error),
    );

    return json(
      {
        success: false,
        error:
          "An unexpected error occurred while processing the transfer",
      },
      500,
    );
  }
});
