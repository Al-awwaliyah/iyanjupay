import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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
    } = Deno.env.toObject();

    if (
      !TWILIO_ACCOUNT_SID ||
      !TWILIO_AUTH_TOKEN ||
      !TWILIO_VERIFY_SERVICE_SID
    ) {
      throw new Error("Twilio secrets are not configured");
    }

    const { action, phone, code } = await req.json();

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

    // ==============================
    // SEND OTP
    // ==============================

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

    // ==============================
    // VERIFY OTP
    // ==============================

    if (action === "check") {
      if (!code) {
        return new Response(
          JSON.stringify({
            success: false,
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

      return new Response(
        JSON.stringify({
          success: verified,
          verified,
          status: data.status,
          message: verified
            ? "Phone number verified successfully"
            : "Invalid verification code",
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
