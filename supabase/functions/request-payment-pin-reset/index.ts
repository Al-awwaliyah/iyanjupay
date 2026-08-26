import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

// ============================================================
// ENVIRONMENT
// ============================================================

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL")!;

const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY")!;

const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SMTP_HOST =
  Deno.env.get("BREVO_SMTP_HOST")!;

const SMTP_PORT =
  Number(
    Deno.env.get("BREVO_SMTP_PORT") || "587"
  );

const SMTP_USER =
  Deno.env.get("BREVO_SMTP_USER")!;

const SMTP_PASSWORD =
  Deno.env.get("BREVO_SMTP_PASSWORD")!;

const FROM_EMAIL =
  Deno.env.get("BREVO_FROM_EMAIL")!;

const FROM_NAME =
  Deno.env.get("BREVO_FROM_NAME") ||
  "IyanjuPay";

const RESET_SECRET =
  Deno.env.get("PAYMENT_PIN_RESET_SECRET")!;


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
// OTP
// ============================================================

function generateOtp(): string {
  const array =
    new Uint32Array(1);

  crypto.getRandomValues(array);

  return String(
    array[0] % 1000000
  ).padStart(6, "0");
}


// ============================================================
// HMAC SHA-256
// ============================================================

async function hmacSha256(
  value: string
): Promise<string> {

  if (!RESET_SECRET) {
    throw new Error(
      "PAYMENT_PIN_RESET_SECRET is not configured."
    );
  }

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
        message: "Method not allowed",
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
    // EMAIL
    // ========================================================

    if (!user.email) {
      return json(
        {
          success: false,
          message:
            "No email address is associated with this account.",
        },
        400
      );
    }


    if (!user.email_confirmed_at) {
      return json(
        {
          success: false,
          message:
            "Your email address must be verified before resetting your Payment PIN.",
        },
        403
      );
    }


    const email =
      user.email
        .trim()
        .toLowerCase();


    // ========================================================
    // SERVICE ROLE CLIENT
    // ========================================================

    const admin =
      createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
      );


    // ========================================================
    // VERIFY PAYMENT PIN EXISTS
    // ========================================================

    const {
      data: pinRecord,
      error: pinError,
    } =
      await admin
        .from("payment_pins")
        .select("user_id")
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();


    if (pinError) {

      console.error(
        "Payment PIN lookup error:",
        pinError
      );

      return json(
        {
          success: false,
          message:
            "Unable to verify Payment PIN status.",
        },
        500
      );
    }


    if (!pinRecord) {
      return json(
        {
          success: false,
          message:
            "Payment PIN has not been created.",
        },
        400
      );
    }


    // ========================================================
    // RATE LIMIT
    // ========================================================

    const {
      data: recentChallenge,
      error: recentError,
    } =
      await admin
        .from(
          "payment_pin_reset_challenges"
        )
        .select(
          "id, created_at, expires_at, used_at"
        )
        .eq(
          "user_id",
          user.id
        )
        .is(
          "used_at",
          null
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle();


    if (recentError) {

      console.error(
        "Reset challenge lookup error:",
        recentError
      );

      return json(
        {
          success: false,
          message:
            "Unable to start PIN recovery.",
        },
        500
      );
    }


    if (recentChallenge) {

      const createdAt =
        new Date(
          recentChallenge.created_at
        ).getTime();

      const age =
        Date.now() -
        createdAt;


      if (age < 60_000) {

        return json(
          {
            success: false,
            message:
              "Please wait before requesting another recovery code.",
          },
          429
        );
      }
    }


    // ========================================================
    // INVALIDATE OLD CHALLENGES
    // ========================================================

    const {
      error:
        invalidateError,
    } =
      await admin
        .from(
          "payment_pin_reset_challenges"
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
        "Challenge invalidation error:",
        invalidateError
      );

      return json(
        {
          success: false,
          message:
            "Unable to start PIN recovery.",
        },
        500
      );
    }


    // ========================================================
    // GENERATE OTP
    // ========================================================

    const otp =
      generateOtp();


    const otpHash =
      await hmacSha256(
        otp
      );


    // ========================================================
    // EXPIRATION
    // ========================================================

    const expiresAt =
      new Date(
        Date.now() +
          10 * 60 * 1000
      ).toISOString();


    // ========================================================
    // CREATE CHALLENGE
    //
    // IMPORTANT:
    //
    // The database column is:
    //
    //     otp_hash
    //
    // NOT otp_digest.
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
        .insert({
          user_id:
            user.id,

          email,

          otp_hash:
            otpHash,

          expires_at:
            expiresAt,

          attempts:
            0,

          max_attempts:
            5,

          verified_at:
            null,

          used_at:
            null,
        })
        .select(
          "id"
        )
        .single();


    if (
      challengeError ||
      !challenge
    ) {

      console.error(
        "Challenge creation error:",
        challengeError
      );

      return json(
        {
          success: false,
          message:
            "Unable to create PIN recovery request.",
        },
        500
      );
    }


    // ========================================================
    // BREVO SMTP TRANSPORT
    // ========================================================

    const transporter =
      nodemailer.createTransport({
        host:
          SMTP_HOST,

        port:
          SMTP_PORT,

        secure:
          SMTP_PORT === 465,

        auth: {
          user:
            SMTP_USER,

          pass:
            SMTP_PASSWORD,
        },
      });


    // ========================================================
    // SEND EMAIL
    // ========================================================

    try {

      await transporter.sendMail({

        from:
          `"${FROM_NAME}" <${FROM_EMAIL}>`,

        to:
          email,

        subject:
          "IyanjuPay Payment PIN Reset Code",

        text:
          `Your IyanjuPay Payment PIN reset code is ${otp}.

This code expires in 10 minutes.

If you did not request a Payment PIN reset, you can safely ignore this email.

Never share this code or your Payment PIN with anyone.`,

        html: `
          <div
            style="
              font-family:Arial,sans-serif;
              max-width:600px;
              margin:auto;
              padding:24px;
            "
          >

            <h2 style="color:#082A63">
              IyanjuPay Payment PIN Reset
            </h2>

            <p>
              We received a request to reset
              your Payment PIN.
            </p>

            <p>
              Your verification code is:
            </p>

            <div
              style="
                font-size:32px;
                font-weight:bold;
                letter-spacing:8px;
                text-align:center;
                padding:20px;
                background:#f3f6fa;
                border-radius:8px;
                color:#082A63;
              "
            >
              ${otp}
            </div>

            <p>
              This code expires in
              <strong>10 minutes</strong>.
            </p>

            <p style="color:#666">
              If you did not request this reset,
              you can safely ignore this email.
            </p>

            <p
              style="
                color:#999;
                font-size:12px;
              "
            >
              Never share your verification
              code or Payment PIN with anyone.
            </p>

          </div>
        `,
      });

    } catch (mailError) {

      console.error(
        "Brevo SMTP email error:",
        mailError
      );


      // ------------------------------------------------------
      // Do not leave an active challenge if email failed.
      // ------------------------------------------------------

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
        );


      return json(
        {
          success: false,
          message:
            "Unable to send the Payment PIN recovery email.",
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
        "A Payment PIN recovery code has been sent to your verified email address.",

      challenge_id:
        challenge.id,

      expires_at:
        expiresAt,
    });

  } catch (error) {

    console.error(
      "Payment PIN reset request error:",
      error
    );

    return json(
      {
        success: false,
        message:
          "Unable to start Payment PIN recovery.",
      },
      500
    );
  }
});
