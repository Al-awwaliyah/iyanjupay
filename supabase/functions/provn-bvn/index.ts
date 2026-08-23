import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUser, json } from "../_shared/auth.ts";

const PROVN_API_URL =
  "https://api.provn.ng/verification/bvn";

Deno.serve(async (req) => {
  // ============================================================
  // CORS
  // ============================================================

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods":
          "POST, OPTIONS",
      },
    });
  }

  // ============================================================
  // METHOD
  // ============================================================

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
    // ==========================================================
    // AUTHENTICATED USER
    // ==========================================================

    const user = await getUser(req);

    if (!user) {
      return json(
        {
          success: false,
          error: "Unauthorized",
        },
        401,
      );
    }

    // ==========================================================
    // ENVIRONMENT
    // ==========================================================

    const provnApiKey =
      Deno.env.get("PROVN_API_KEY");

    const provnAccessKey =
      Deno.env.get("PROVN_ACCESS_KEY");

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY",
      );

    if (
      !provnApiKey ||
      !provnAccessKey
    ) {
      console.error(
        "PROVN credentials are not configured.",
      );

      return json(
        {
          success: false,
          error:
            "BVN verification service is not configured.",
        },
        500,
      );
    }

    if (
      !supabaseUrl ||
      !serviceRoleKey
    ) {
      console.error(
        "Supabase service role configuration is missing.",
      );

      return json(
        {
          success: false,
          error:
            "KYC database service is not configured.",
        },
        500,
      );
    }

    // ==========================================================
    // ADMIN SUPABASE CLIENT
    // ==========================================================

    const adminSupabase =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        },
      );

    // ==========================================================
    // REQUEST BODY
    // ==========================================================

    let body: any;

    try {
      body = await req.json();
    } catch {
      return json(
        {
          success: false,
          error:
            "Invalid JSON request body.",
        },
        400,
      );
    }

    const action =
      String(
        body?.action ?? "verify",
      ).toLowerCase();

    // ==========================================================
    // STATUS
    // ==========================================================

    if (action === "status") {
      const {
        data: profile,
        error: profileError,
      } =
        await adminSupabase
          .from("profiles")
          .select(
            `
              kyc_level,
              kyc_status,
              bvn_verified,
              bvn_masked,
              bvn_verified_at
            `,
          )
          .eq("id", user.id)
          .maybeSingle();

      if (profileError) {
        console.error(
          "KYC status database error:",
          profileError,
        );

        return json(
          {
            success: false,
            error:
              "Unable to load KYC status.",
          },
          500,
        );
      }

      const verified =
        Boolean(
          profile?.bvn_verified,
        ) ||
        String(
          profile?.kyc_status ??
            "",
        ).toLowerCase() ===
          "verified";

      return json(
        {
          success: true,

          verified,

          kyc_level:
            Number(
              profile?.kyc_level ??
                (verified ? 2 : 1),
            ),

          kyc_status:
            String(
              profile?.kyc_status ??
                (verified
                  ? "verified"
                  : "unverified"),
            ),

          bvn_masked:
            profile?.bvn_masked ??
            null,

          fee: 0,

          bvn_verified_at:
            profile?.bvn_verified_at ??
            null,
        },
        200,
      );
    }

    // ==========================================================
    // ONLY VERIFY ACTION IS SUPPORTED
    // ==========================================================

    if (action !== "verify") {
      return json(
        {
          success: false,
          error:
            "Unsupported BVN action.",
        },
        400,
      );
    }

    // ==========================================================
    // BVN
    // ==========================================================

    const bvn =
      String(
        body?.bvn ?? "",
      ).replace(/\D/g, "");

    if (!/^\d{11}$/.test(bvn)) {
      return json(
        {
          success: false,
          verified: false,
          error:
            "BVN must contain exactly 11 digits.",
        },
        400,
      );
    }

    console.log(
      "Starting PROVN BVN verification:",
      JSON.stringify({
        user_id: user.id,
        bvn_last_four:
          bvn.slice(-4),
      }),
    );

    // ==========================================================
    // CALL PROVN
    // ==========================================================

    let response: Response;

    try {
      response = await fetch(
        PROVN_API_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "API-Key":
              provnApiKey,

            "Access-Key":
              provnAccessKey,
          },

          body: JSON.stringify({
            bvn,
          }),
        },
      );
    } catch (error) {
      console.error(
        "PROVN network error:",
        error,
      );

      return json(
        {
          success: false,
          verified: false,
          error:
            "Unable to connect to the BVN verification service.",
        },
        503,
      );
    }

    // ==========================================================
    // READ PROVIDER RESPONSE
    // ==========================================================

    let providerData: any = null;

    try {
      providerData =
        await response.json();
    } catch {
      providerData = null;
    }

    console.log(
      "PROVN BVN response:",
      JSON.stringify({
        http_status:
          response.status,

        ok:
          response.ok,

        provider_status:
          providerData?.status ??
          null,

        provider_code:
          providerData?.code ??
          null,

        message:
          providerData?.message ??
          providerData?.detail ??
          null,
      }),
    );

    // ==========================================================
    // PROVIDER FAILURE
    // ==========================================================

    if (
      !response.ok ||
      providerData?.status !==
        "success"
    ) {
      const providerError =
        providerData?.detail ||
        providerData?.message ||
        "BVN verification failed.";

      return json(
        {
          success: false,

          verified: false,

          error:
            providerError,

          provider_status:
            providerData?.status ??
            null,

          provider_code:
            providerData?.code ??
            response.status,
        },
        response.status >= 400 &&
          response.status < 500
          ? 400
          : 503,
      );
    }

    // ==========================================================
    // PROVIDER SUCCESS
    // ==========================================================

    /*
     * IMPORTANT:
     *
     * PROVN TEST KEYS return DUMMY identity information.
     *
     * Therefore we intentionally DO NOT copy:
     *
     * - first_name
     * - last_name
     * - middle_name
     * - date_of_birth
     * - phone_number
     * - state_of_origin
     * - residential_address
     *
     * into the user's profile.
     *
     * We only mark the LOCAL IyanjuPay KYC state as verified.
     */

    const now =
      new Date().toISOString();

    const maskedBvn =
      `******${bvn.slice(-4)}`;

    // ==========================================================
    // UPDATE LOCAL KYC STATE
    // ==========================================================

    const {
      error: updateError,
    } =
      await adminSupabase
        .from("profiles")
        .update({
          kyc_level: 2,

          kyc_status:
            "verified",

          bvn_verified:
            true,

          bvn_masked:
            maskedBvn,

          bvn_verified_at:
            now,

          updated_at:
            now,
        })
        .eq(
          "id",
          user.id,
        );

    if (updateError) {
      console.error(
        "Unable to update KYC profile:",
        updateError,
      );

      return json(
        {
          success: false,
          verified: false,
          error:
            "BVN was accepted by the verification service, but your KYC profile could not be updated.",
        },
        500,
      );
    }

    // ==========================================================
    // SUCCESS
    // ==========================================================

    return json(
      {
        success: true,

        verified: true,

        message:
          "BVN verification successful.",

        kyc_level: 2,

        kyc_status:
          "verified",

        bvn_masked:
          maskedBvn,

        /*
         * The provider's identity payload is returned only
         * for the verification response. ProfilePage does
         * NOT use it to overwrite user information.
         *
         * This is especially important in test mode because
         * PROVN returns dummy data.
         */

        verification:
          providerData?.data ??
          null,

        test_mode:
          String(
            provnApiKey,
          ).startsWith(
            "test_",
          ),
      },
      200,
    );
  } catch (error) {
    console.error(
      "PROVN BVN INTERNAL ERROR:",
      error,
    );

    return json(
      {
        success: false,

        verified: false,

        error:
          error instanceof Error
            ? error.message
            : "Internal server error.",
      },
      500,
    );
  }
});
