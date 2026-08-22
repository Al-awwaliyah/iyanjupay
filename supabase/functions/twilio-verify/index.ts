import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const {
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN,
      TWILIO_VERIFY_SERVICE_SID,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    } = Deno.env.toObject();

    if (
      !TWILIO_ACCOUNT_SID ||
      !TWILIO_AUTH_TOKEN ||
      !TWILIO_VERIFY_SERVICE_SID ||
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      throw new Error("Required secrets are not configured");
    }

    const body = await req.json();

    const action = body.action;
    const phone = body.phone;
    const code = body.code;

    if (!phone) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Phone number is required",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const authHeader = btoa(
      `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`,
    );

    const serviceUrl =
      `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}`;

    // ------------------------------------------
    // SEND OTP
    // ------------------------------------------

    if (action === "send") {
      const response = await fetch(
        `${serviceUrl}/Verifications`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${authHeader}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: phone,
            Channel: "sms",
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Twilio send error:", data);

        return new Response(
          JSON.stringify({
            success: false,
            error:
              data.message ||
              "Unable to send verification code",
          }),
          {
            status: response.status,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: data.status,
          message: "Verification code sent",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // ------------------------------------------
    // CHECK OTP
    // ------------------------------------------

    if (action === "check") {
      if (!code) {
        return new Response(
          JSON.stringify({
            success: false,
            verified: false,
            error: "Verification code is required",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      const response = await fetch(
        `${serviceUrl}/VerificationCheck`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${authHeader}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: phone,
            Code: code,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Twilio verification error:", data);

        return new Response(
          JSON.stringify({
            success: false,
            verified: false,
            error:
              data.message ||
              "Unable to verify code",
          }),
          {
            status: response.status,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      const verified = data.status === "approved";

      if (!verified) {
        return new Response(
          JSON.stringify({
            success: false,
            verified: false,
            status: data.status,
            message: "Invalid verification code",
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // ------------------------------------------
      // UPDATE PROFILE USING SERVICE ROLE
      // ------------------------------------------

      const supabaseAdmin = createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
      );

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

        throw new Error(
          "Unable to find the account associated with this phone number.",
        );
      }

      if (!profile) {
        return new Response(
          JSON.stringify({
            success: false,
            verified: false,
            error:
              "No IyanjuPay account was found for this phone number.",
          }),
          {
            status: 404,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      const { error: updateError } =
        await supabaseAdmin
          .from("profiles")
          .update({
            phone_verified: true,
            phone_verified_at: new Date().toISOString(),
          })
          .eq("id", profile.id);

      if (updateError) {
        console.error(
          "Profile verification update error:",
          updateError,
        );

        throw new Error(
          "Phone was verified, but the verification status could not be saved.",
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          verified: true,
          status: data.status,
          message:
            "Phone number verified successfully",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: "Invalid action. Use 'send' or 'check'.",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("twilio-verify error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
