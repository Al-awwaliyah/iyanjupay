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

  if (req.method === "OPTIONS") {
    return new Response(
      "ok",
      {
        headers: corsHeaders,
      }
    );
  }

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
      error: userError,
    } =
      await userClient.auth.getUser();


    if (
      userError ||
      !user
    ) {
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
      !/^[0-9]{6}$/.test(otp)
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
    // ALREADY USED
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
    // MAX ATTEMPTS
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
    // HASH SUPPLIED OTP
    // ========================================================

    const submittedHash =
      await hmacSha256(
        otp
      );


    // ========================================================
    // CONSTANT-TIME COMPARISON
    // ========================================================

    const expected =
      new TextEncoder()
        .encode(
          challenge.otp_hash
        );

    const supplied =
      new TextEncoder()
        .encode(
          submittedHash
        );

    let matches =
      expected.length ===
      supplied.length;

    if (matches) {

      let difference = 0;

      for (
        let i = 0;
        i < expected.length;
        i++
      ) {
        difference |=
          expected[i] ^
          supplied[i];
      }

      matches =
        difference === 0;
    }


    // ========================================================
    // INVALID OTP
    // ========================================================

    if (!matches) {

      const nextAttempts =
        challenge.attempts + 1;

      const exhausted =
        nextAttempts >=
        challenge.max_attempts;

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
        );

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
    // GENERATE RESET AUTHORIZATION
    // ========================================================

    const authorizationToken =
      generateAuthorizationToken();


    const authorizationHash =
      await hmacSha256(
        authorizationToken
      );


    // ========================================================
    // AUTHORIZATION EXPIRATION
    //
    // 10 minutes after successful OTP verification.
    // ========================================================

    const authorizationExpiresAt =
      new Date(
        Date.now() +
          10 * 60 * 1000
      ).toISOString();


    // ========================================================
    // INVALIDATE ANY OLD AUTHORIZATION
    // ========================================================

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
        .select("id")
        .single();


    if (
      authorizationError ||
      !authorization
    ) {

      console.error(
        "Reset authorization creation error:",
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
