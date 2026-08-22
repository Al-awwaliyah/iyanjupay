import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizePhoneNumber(phone: string): string {
  let cleaned = phone.trim().replace(/[\s()-]/g, "");

  if (cleaned.startsWith("0")) {
    cleaned = `+234${cleaned.substring(1)}`;
  }

  if (cleaned.startsWith("234")) {
    cleaned = `+${cleaned}`;
  }

  return cleaned;
}

function generateOtp(): string {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

async function hashOtp(
  phone: string,
  code: string,
): Promise<string> {
  const encoder = new TextEncoder();

  const data = encoder.encode(
    `${phone}:${code}`,
  );

  const digest = await crypto.subtle.digest(
    "SHA-256",
    data,
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) =>
      byte.toString(16).padStart(2, "0"),
    )
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const {
      TERMII_API_KEY,
      TERMII_BASE_URL,
      TERMII_SENDER_ID,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    } = Deno.env.toObject();

    if (
      !TERMII_API_KEY ||
      !TERMII_BASE_URL ||
      !TERMII_SENDER_ID ||
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Required Termii or Supabase secrets are not configured.",
        },
        500,
      );
    }

    const supabaseAdmin = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    const body = await req.json();

    const action = body.action;
    const phone = body.phone
      ? normalizePhoneNumber(body.phone)
      : "";
    const code = body.code?.toString().trim() || "";

    if (!phone) {
      return jsonResponse(
        {
          success: false,
          error: "Phone number is required.",
        },
        400,
      );
    }

    // ==================================================
    // SEND 8-DIGIT OTP
    // ==================================================

    if (action === "send") {
      // Confirm that the phone belongs to an IyanjuPay account.
      const { data: profile, error: profileError } =
        await supabaseAdmin
          .from("profiles")
          .select("id, phone_number")
          .eq("phone_number", phone)
          .maybeSingle();

      if (profileError) {
        console.error(
          "Profile lookup error:",
          profileError,
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Unable to verify the phone number.",
          },
          500,
        );
      }

      if (!profile) {
        return jsonResponse(
          {
            success: false,
            error:
              "No IyanjuPay account was found for this phone number.",
          },
          404,
        );
      }

      // Prevent rapid repeated requests.
      const { data: recentCode } =
        await supabaseAdmin
          .from("phone_verification_codes")
          .select("id, created_at")
          .eq("phone_number", phone)
          .is("verified_at", null)
          .order("created_at", {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

      if (recentCode) {
        const createdAt =
          new Date(recentCode.created_at).getTime();

        const secondsSinceCreation =
          (Date.now() - createdAt) / 1000;

        if (secondsSinceCreation < 30) {
          return jsonResponse(
            {
              success: false,
              error:
                "Please wait 30 seconds before requesting another code.",
            },
            429,
          );
        }
      }

      const otp = generateOtp();
      const codeHash = await hashOtp(phone, otp);

      const expiresAt = new Date(
        Date.now() + 10 * 60 * 1000,
      ).toISOString();

      // Invalidate previous unused codes.
      await supabaseAdmin
        .from("phone_verification_codes")
        .update({
          verified_at: new Date().toISOString(),
        })
        .eq("phone_number", phone)
        .is("verified_at", null);

      const { error: insertError } =
        await supabaseAdmin
          .from("phone_verification_codes")
          .insert({
            phone_number: phone,
            code_hash: codeHash,
            expires_at: expiresAt,
            attempts: 0,
            max_attempts: 5,
          });

      if (insertError) {
        console.error(
          "OTP insert error:",
          insertError,
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Unable to create verification code.",
          },
          500,
        );
      }

      const baseUrl = TERMII_BASE_URL.replace(
        /\/+$/,
        "",
      );

      const termiiResponse = await fetch(
        `${baseUrl}/api/sms/send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_key: TERMII_API_KEY,
            to: phone,
            from: TERMII_SENDER_ID,
            sms: `Your IyanjuPay verification code is ${otp}. It expires in 10 minutes.`,
            type: "plain",
            channel: "generic",
          }),
        },
      );

      const termiiData =
        await termiiResponse.json();

      console.log(
        "Termii SMS response:",
        termiiData,
      );

      if (!termiiResponse.ok) {
        console.error(
          "Termii send error:",
          termiiData,
        );

        // Remove the unused code if sending failed.
        await supabaseAdmin
          .from("phone_verification_codes")
          .delete()
          .eq("phone_number", phone)
          .eq("code_hash", codeHash);

        return jsonResponse(
          {
            success: false,
            error:
              termiiData.message ||
              termiiData.error ||
              "Unable to send verification SMS.",
          },
          termiiResponse.status,
        );
      }

      return jsonResponse({
        success: true,
        message:
          "8-digit verification code sent successfully.",
      });
    }

    // ==================================================
    // VERIFY OTP
    // ==================================================

    if (action === "check") {
      if (!/^\d{8}$/.test(code)) {
        return jsonResponse(
          {
            success: false,
            verified: false,
            error:
              "Verification code must contain exactly 8 digits.",
          },
          400,
        );
      }

      const { data: verification, error: fetchError } =
        await supabaseAdmin
          .from("phone_verification_codes")
          .select(
            "id, code_hash, expires_at, attempts, max_attempts",
          )
          .eq("phone_number", phone)
          .is("verified_at", null)
          .order("created_at", {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

      if (fetchError) {
        console.error(
          "Verification lookup error:",
          fetchError,
        );

        return jsonResponse(
          {
            success: false,
            verified: false,
            error:
              "Unable to check verification code.",
          },
          500,
        );
      }

      if (!verification) {
        return jsonResponse(
          {
            success: false,
            verified: false,
            error:
              "No active verification code was found.",
          },
          400,
        );
      }

      if (
        new Date(verification.expires_at).getTime() <
        Date.now()
      ) {
        return jsonResponse(
          {
            success: false,
            verified: false,
            error:
              "This verification code has expired. Please request a new one.",
          },
          400,
        );
      }

      if (
        verification.attempts >=
        verification.max_attempts
      ) {
        return jsonResponse(
          {
            success: false,
            verified: false,
            error:
              "Too many incorrect attempts. Please request a new code.",
          },
          429,
        );
      }

      const enteredHash = await hashOtp(
        phone,
        code,
      );

      if (
        enteredHash !== verification.code_hash
      ) {
        const newAttempts =
          verification.attempts + 1;

        await supabaseAdmin
          .from("phone_verification_codes")
          .update({
            attempts: newAttempts,
          })
          .eq("id", verification.id);

        return jsonResponse({
          success: false,
          verified: false,
          error:
            "Invalid verification code.",
        });
      }

      // Mark OTP as used.
      await supabaseAdmin
        .from("phone_verification_codes")
        .update({
          verified_at: new Date().toISOString(),
        })
        .eq("id", verification.id);

      // Mark user's phone as verified.
      const { data: profile, error: profileError } =
        await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("phone_number", phone)
          .maybeSingle();

      if (profileError) {
        console.error(
          "Profile lookup after OTP error:",
          profileError,
        );

        return jsonResponse(
          {
            success: false,
            verified: false,
            error:
              "Phone was verified, but the account could not be updated.",
          },
          500,
        );
      }

      if (!profile) {
        return jsonResponse(
          {
            success: false,
            verified: false,
            error:
              "No IyanjuPay account was found for this phone number.",
          },
          404,
        );
      }

      const { error: updateError } =
        await supabaseAdmin
          .from("profiles")
          .update({
            phone_verified: true,
            phone_verified_at:
              new Date().toISOString(),
          })
          .eq("id", profile.id);

      if (updateError) {
        console.error(
          "Profile verification update error:",
          updateError,
        );

        return jsonResponse(
          {
            success: false,
            verified: false,
            error:
              "Phone was verified, but the verification status could not be saved.",
          },
          500,
        );
      }

      return jsonResponse({
        success: true,
        verified: true,
        message:
          "Phone number verified successfully.",
      });
    }

    return jsonResponse(
      {
        success: false,
        error:
          "Invalid action. Use 'send' or 'check'.",
      },
      400,
    );
  } catch (error) {
    console.error(
      "termii-verify error:",
      error,
    );

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error.",
      },
      500,
    );
  }
});
