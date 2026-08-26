import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// ENVIRONMENT
// ============================================================

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL")!;

const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY")!;

const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================================
// CORS
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

// ============================================================
// RESPONSE
// ============================================================

function json(
  body: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    }
  );
}

// ============================================================
// SHA-256
// ============================================================

async function sha256Hex(
  value: string
): Promise<string> {
  const encoder =
    new TextEncoder();

  const data =
    encoder.encode(value);

  const hashBuffer =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array.from(
    new Uint8Array(hashBuffer)
  )
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

// ============================================================
// RANDOM AUTHORIZATION TOKEN
// ============================================================

function generateAuthorizationToken(): string {
  const bytes =
    new Uint8Array(32);

  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

// ============================================================
// CONSTANT-TIME STRING COMPARISON
// ============================================================

function constantTimeEqual(
  a: string,
  b: string
): boolean {
  const encoder =
    new TextEncoder();

  const aBytes =
    encoder.encode(a);

  const bBytes =
    encoder.encode(b);

  if (
    aBytes.length !==
    bBytes.length
  ) {
    return false;
  }

  let difference = 0;

  for (
    let i = 0;
    i < aBytes.length;
    i++
  ) {
    difference |=
      aBytes[i] ^
      bBytes[i];
  }

  return difference === 0;
}

// ============================================================
// MAIN
// ============================================================

Deno.serve(async (req) => {
  // ==========================================================
  // OPTIONS
  // ==========================================================

  if (req.method === "OPTIONS") {
    return new Response(
      "ok",
      {
        headers: corsHeaders,
      }
    );
  }

  // ==========================================================
  // METHOD
  // ==========================================================

  if (req.method !== "POST") {
    return json(
      {
        success: false,
        message:
          "Method not allowed.",
      },
      405
    );
  }

  try {
    // ========================================================
    // ENVIRONMENT
    // ========================================================

    if (
      !SUPABASE_URL ||
      !SUPABASE_ANON_KEY ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      console.error(
        "Supabase environment variables are missing."
      );

      return json(
        {
          success: false,
          message:
            "Server configuration error.",
        },
        500
      );
    }

    // ========================================================
    // AUTHENTICATION
    // ========================================================

    const authHeader =
      req.headers.get(
        "Authorization"
      );

    if (!authHeader) {
      return json(
        {
          success: false,
          message:
            "Authentication required.",
        },
        401
      );
    }

    const userClient =
      createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        {
          global: {
            headers: {
              Authorization:
                authHeader,
            },
          },
        }
      );

    const {
      data: {
        user,
      },
      error: userError,
    } =
      await userClient.auth.getUser();

    if (
      userError ||
      !user
    ) {
      console.error(
        "Authentication error:",
        userError
      );

      return json(
        {
          success: false,
          message:
            "Authentication could not be verified.",
        },
        401
      );
    }

    // ========================================================
    // REQUEST BODY
    // ========================================================

    let body: {
      challenge_id?: string;
      otp?: string;
    };

    try {
      body =
        await req.json();
    } catch {
      return json(
        {
          success: false,
          message:
            "Invalid request body.",
        },
        400
      );
    }

    const challengeId =
      body.challenge_id
        ?.trim();

    const otp =
      body.otp
        ?.trim();

    // ========================================================
    // VALIDATE INPUT
    // ========================================================

    if (
      !challengeId ||
      !otp
    ) {
      return json(
        {
          success: false,
          message:
            "Challenge ID and verification code are required.",
        },
        400
      );
    }

    if (
      !/^[0-9]{6}$/.test(
        otp
      )
    ) {
      return json(
        {
          success: false,
          message:
            "Verification code must contain exactly 6 digits.",
        },
        400
      );
    }

    // ========================================================
    // ADMIN CLIENT
    // ========================================================

    const admin =
      createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
      );

    // ========================================================
    // GET CHALLENGE
    // ========================================================

    const {
      data: challenge,
      error: challengeError,
    } =
      await admin
        .from(
          "payment_pin_reset_challenges"
        )
        .select(`
          id,
          user_id,
          email,
          otp_hash,
          expires_at,
          attempts,
          max_attempts,
          verified_at,
          used_at
        `)
        .eq(
          "id",
          challengeId
        )
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();

    if (challengeError) {
      console.error(
        "Challenge lookup error:",
        challengeError
      );

      return json(
        {
          success: false,
          message:
            "Unable to verify recovery request.",
        },
        500
      );
    }

    if (!challenge) {
      return json(
        {
          success: false,
          message:
            "Recovery request was not found.",
        },
        404
      );
    }

    // ========================================================
    // USED
    // ========================================================

    if (challenge.used_at) {
      return json(
        {
          success: false,
          message:
            "This recovery request has already been used.",
        },
        400
      );
    }

    // ========================================================
    // ALREADY VERIFIED
    // ========================================================

    if (challenge.verified_at) {
      return json(
        {
          success: false,
          message:
            "This recovery code has already been verified.",
        },
        400
      );
    }

    // ========================================================
    // EXPIRATION
    // ========================================================

    if (
      new Date(
        challenge.expires_at
      ).getTime() <= Date.now()
    ) {
      await admin
        .from(
          "payment_pin_reset_challenges"
        )
        .update({
          used_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          challenge.id
        )
        .is(
          "used_at",
          null
        );

      return json(
        {
          success: false,
          message:
            "This recovery code has expired. Please request a new one.",
        },
        400
      );
    }

    // ========================================================
    // ATTEMPTS
    // ========================================================

    if (
      challenge.attempts >=
      challenge.max_attempts
    ) {
      await admin
        .from(
          "payment_pin_reset_challenges"
        )
        .update({
          used_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          challenge.id
        )
        .is(
          "used_at",
          null
        );

      return json(
        {
          success: false,
          message:
            "Too many incorrect attempts. Please request a new recovery code.",
        },
        429
      );
    }

    // ========================================================
    // HASH SUBMITTED OTP
    // ========================================================

    const submittedHash =
      await sha256Hex(
        otp
      );

    // ========================================================
    // CONSTANT-TIME COMPARISON
    // ========================================================

    const matches =
      constantTimeEqual(
        challenge.otp_hash,
        submittedHash
      );

    // ========================================================
    // INVALID OTP
    // ========================================================

    if (!matches) {
      const nextAttempts =
        challenge.attempts + 1;

      const exhausted =
        nextAttempts >=
        challenge.max_attempts;

      const {
        error:
          attemptUpdateError,
      } =
        await admin
          .from(
            "payment_pin_reset_challenges"
          )
          .update({
            attempts:
              nextAttempts,

            used_at:
              exhausted
                ? new Date().toISOString()
                : null,
          })
          .eq(
            "id",
            challenge.id
          )
          .eq(
            "user_id",
            user.id
          );

      if (attemptUpdateError) {
        console.error(
          "OTP attempt update error:",
          attemptUpdateError
        );
      }

      return json(
        {
          success: false,
          message:
            exhausted
              ? "Too many incorrect attempts. Please request a new recovery code."
              : "Invalid recovery code.",
        },
        exhausted ? 429 : 400
      );
    }

    // ========================================================
    // MARK CHALLENGE VERIFIED
    // ========================================================

    const verifiedAt =
      new Date()
        .toISOString();

    const {
      data:
        updatedChallenge,
      error:
        verifyUpdateError,
    } =
      await admin
        .from(
          "payment_pin_reset_challenges"
        )
        .update({
          verified_at:
            verifiedAt,
        })
        .eq(
          "id",
          challenge.id
        )
        .eq(
          "user_id",
          user.id
        )
        .is(
          "verified_at",
          null
        )
        .is(
          "used_at",
          null
        )
        .select(
          "id"
        )
        .maybeSingle();

    if (
      verifyUpdateError
    ) {
      console.error(
        "Challenge verification update error:",
        verifyUpdateError
      );

      return json(
        {
          success: false,
          message:
            "Unable to complete recovery verification.",
        },
        500
      );
    }

    if (!updatedChallenge) {
      return json(
        {
          success: false,
          message:
            "This recovery request is no longer valid.",
        },
        400
      );
    }

    // ========================================================
    // GENERATE AUTHORIZATION TOKEN
    // ========================================================

    const authorizationToken =
      generateAuthorizationToken();

    // ========================================================
    // HASH AUTHORIZATION TOKEN
    //
    // IMPORTANT:
    //
    // reset_payment_pin() uses:
    //
    // extensions.digest(
    //     _authorization,
    //     'sha256'
    // )
    //
    // Therefore this MUST be plain SHA-256.
    // ========================================================

    const authorizationHash =
      await sha256Hex(
        authorizationToken
      );

    // ========================================================
    // AUTHORIZATION EXPIRATION
    // ========================================================

    const authorizationExpiresAt =
      new Date(
        Date.now() +
          10 * 60 * 1000
      ).toISOString();

    // ========================================================
    // INVALIDATE OLD AUTHORIZATIONS
    // ========================================================

    const {
      error:
        invalidateError,
    } =
      await admin
        .from(
          "payment_pin_reset_authorizations"
        )
        .update({
          used_at:
            new Date().toISOString(),
        })
        .eq(
          "user_id",
          user.id
        )
        .is(
          "used_at",
          null
        );

    if (invalidateError) {
      console.error(
        "Authorization invalidation error:",
        invalidateError
      );

      return json(
        {
          success: false,
          message:
            "Unable to create Payment PIN reset authorization.",
        },
        500
      );
    }

    // ========================================================
    // CREATE AUTHORIZATION
    // ========================================================

    const {
      data: authorization,
      error:
        authorizationError,
    } =
      await admin
        .from(
          "payment_pin_reset_authorizations"
        )
        .insert({
          challenge_id:
            challenge.id,

          user_id:
            user.id,

          authorization_hash:
            authorizationHash,

          expires_at:
            authorizationExpiresAt,

          used_at:
            null,
        })
        .select(
          "id"
        )
        .single();

    if (
      authorizationError ||
      !authorization
    ) {
      console.error(
        "Authorization creation error:",
        authorizationError
      );

      return json(
        {
          success: false,
          message:
            "Unable to create Payment PIN reset authorization.",
        },
        500
      );
    }

    // ========================================================
    // SUCCESS
    // ========================================================

    return json({
      success: true,

      message:
        "Payment PIN recovery verified successfully.",

      authorization_token:
        authorizationToken,

      authorization_expires_at:
        authorizationExpiresAt,

      authorization_id:
        authorization.id,
    });

  } catch (error) {
    console.error(
      "Payment PIN reset verification error:",
      error
    );

    return json(
      {
        success: false,
        message:
          "Unable to verify Payment PIN recovery.",
      },
      500
    );
  }
});
