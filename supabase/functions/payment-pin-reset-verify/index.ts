import {
  createClient,
} from "https://esm.sh/@supabase/supabase-js@2";


// ============================================================
// ENVIRONMENT
// ============================================================

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL")!;

const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY")!;

const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get(
    "SUPABASE_SERVICE_ROLE_KEY"
  )!;

const RESET_SECRET =
  Deno.env.get(
    "PAYMENT_PIN_RESET_SECRET"
  )!;


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

const json = (
  body: unknown,
  status = 200
) =>
  new Response(
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


// ============================================================
// HMAC SHA-256
// ============================================================

async function hmacSha256(
  value: string
): Promise<string> {

  const encoder =
    new TextEncoder();

  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(RESET_SECRET),
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(value)
    );

  return Array.from(
    new Uint8Array(signature)
  )
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

function safeEqual(
  a: string,
  b: string
): boolean {

  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (
    let i = 0;
    i < a.length;
    i++
  ) {
    result |=
      a.charCodeAt(i) ^
      b.charCodeAt(i);
  }

  return result === 0;
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
          "Method not allowed",
      },
      405
    );
  }


  try {

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
      error:
        userError,
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
    // PARSE REQUEST
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
      !challengeId
    ) {

      return json(
        {
          success: false,
          message:
            "Recovery challenge is required.",
        },
        400
      );
    }


    if (
      !otp ||
      !/^\d{6}$/.test(otp)
    ) {

      return json(
        {
          success: false,
          message:
            "Enter the valid 6-digit recovery code.",
        },
        400
      );
    }


    // ========================================================
    // SERVICE ROLE CLIENT
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
      error:
        challengeError,
    } =
      await admin
        .from(
          "payment_pin_reset_challenges"
        )
        .select(
          `
            id,
            user_id,
            email,
            otp_digest,
            expires_at,
            attempts,
            max_attempts,
            verified_at,
            used_at
          `
        )
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
            "Invalid or expired recovery request.",
        },
        404
      );
    }


    // ========================================================
    // CHECK WHETHER ALREADY USED
    // ========================================================

    if (challenge.used_at) {

      return json(
        {
          success: false,
          message:
            "This recovery request has already been completed.",
        },
        400
      );
    }


    // ========================================================
    // CHECK EXPIRATION
    // ========================================================

    const expiresAt =
      new Date(
        challenge.expires_at
      ).getTime();

    if (
      !Number.isFinite(
        expiresAt
      ) ||
      Date.now() >= expiresAt
    ) {

      return json(
        {
          success: false,
          message:
            "This recovery code has expired. Please request a new code.",
        },
        400
      );
    }


    // ========================================================
    // CHECK ATTEMPTS
    // ========================================================

    const attempts =
      Number(
        challenge.attempts || 0
      );

    const maxAttempts =
      Number(
        challenge.max_attempts || 5
      );


    if (
      attempts >= maxAttempts
    ) {

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
    // GENERATE OTP DIGEST
    // ========================================================

    const otpDigest =
      await hmacSha256(
        otp
      );


    // ========================================================
    // VERIFY OTP
    // ========================================================

    const otpMatches =
      safeEqual(
        otpDigest,
        challenge.otp_digest
      );


    if (!otpMatches) {

      const nextAttempts =
        attempts + 1;


      await admin
        .from(
          "payment_pin_reset_challenges"
        )
        .update({
          attempts:
            nextAttempts,
        })
        .eq(
          "id",
          challenge.id
        )
        .eq(
          "user_id",
          user.id
        );


      const remaining =
        Math.max(
          0,
          maxAttempts -
            nextAttempts
        );


      if (
        remaining <= 0
      ) {

        return json(
          {
            success: false,
            message:
              "Too many incorrect attempts. Please request a new recovery code.",
          },
          429
        );
      }


      return json(
        {
          success: false,
          message:
            `Incorrect recovery code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
        },
        400
      );
    }


    // ========================================================
    // GENERATE ONE-TIME AUTHORIZATION TOKEN
    // ========================================================

    const authorizationToken =
      generateAuthorizationToken();


    const authorizationDigest =
      await hmacSha256(
        authorizationToken
      );


    // ========================================================
    // AUTHORIZATION EXPIRATION
    //
    // The OTP has been successfully verified.
    //
    // Give the client a short window to complete
    // the actual Payment PIN reset.
    // ========================================================

    const authorizationExpiresAt =
      new Date(
        Date.now() +
          10 * 60 * 1000
      ).toISOString();


    // ========================================================
    // MARK CHALLENGE VERIFIED
    // ========================================================

    const {
      error:
        verifyUpdateError,
    } =
      await admin
        .from(
          "payment_pin_reset_challenges"
        )
        .update({
          verified_at:
            new Date().toISOString(),
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
          "used_at",
          null
        );


    if (verifyUpdateError) {

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


    // ========================================================
    // CREATE RESET AUTHORIZATION
    // ========================================================

    const {
      data:
        authorization,
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

          authorization_digest:
            authorizationDigest,

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
        "Reset authorization creation error:",
        authorizationError
      );

      /*
       * Roll back the verification marker
       * if authorization could not be created.
       */

      await admin
        .from(
          "payment_pin_reset_challenges"
        )
        .update({
          verified_at:
            null,
        })
        .eq(
          "id",
          challenge.id
        )
        .eq(
          "user_id",
          user.id
        );


      return json(
        {
          success: false,
          message:
            "Unable to create secure PIN reset authorization.",
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
