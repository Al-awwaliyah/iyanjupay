import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUser, json } from "../_shared/auth.ts";

const PROVN_API_URL =
  "https://api.provn.ng/verification/bvn";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

// ============================================================
// MAIN
// ============================================================

Deno.serve(async (req) => {
  // ============================================================
  // CORS
  // ============================================================

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
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
      console.error(
        "PROVN BVN: unauthorized request",
      );

      return json(
        {
          success: false,
          verified: false,
          error: "Unauthorized",
        },
        401,
      );
    }

    console.log(
      "Authenticated BVN user:",
      user.id,
    );

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
          verified: false,
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
          verified: false,
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
          verified: false,
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
              id,
              kyc_level,
              kyc_status,
              bvn,
              bvn_verified,
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
            verified: false,
            error:
              "Unable to load KYC status.",
          },
          500,
        );
      }

      const storedBvn =
        String(
          profile?.bvn ?? "",
        ).replace(/\D/g, "");

      const verified =
        Boolean(
          profile?.bvn_verified,
        ) ||
        String(
          profile?.kyc_status ?? "",
        ).toLowerCase() ===
          "verified";

      const maskedBvn =
        storedBvn.length === 11
          ? `******${storedBvn.slice(-4)}`
          : null;

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
            maskedBvn,

          fee: 0,

          bvn_verified_at:
            profile?.bvn_verified_at ??
            null,
        },
        200,
      );
    }

    // ==========================================================
    // ONLY VERIFY IS SUPPORTED
    // ==========================================================

    if (action !== "verify") {
      return json(
        {
          success: false,
          verified: false,
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
    // PROVIDER RESPONSE
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

      console.error(
        "PROVN rejected BVN:",
        providerError,
      );

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
    // PROVN SUCCESS
    // ==========================================================

    console.log(
      "PROVN BVN verification successful.",
    );

    /*
     * PROVN TEST MODE returns dummy identity data.
     *
     * We therefore do NOT copy:
     *
     * - first_name
     * - last_name
     * - middle_name
     * - date_of_birth
     * - phone_number
     * - address
     *
     * We only save the verification state and submitted BVN.
     */

    const now =
      new Date().toISOString();

    const maskedBvn =
      `******${bvn.slice(-4)}`;

    // ==========================================================
    // CHECK PROFILE EXISTS
    // ==========================================================

    const {
      data: existingProfile,
      error: existingProfileError,
    } =
      await adminSupabase
        .from("profiles")
        .select(
          `
            id,
            full_name,
            phone_number,
            email
          `,
        )
        .eq("id", user.id)
        .maybeSingle();

    if (existingProfileError) {
      console.error(
        "Profile existence check failed:",
        existingProfileError,
      );

      return json(
        {
          success: false,
          verified: false,
          error:
            "BVN was verified, but we could not access your profile.",
        },
        500,
      );
    }

    // ==========================================================
    // CREATE PROFILE IF MISSING
    // ==========================================================

    if (!existingProfile) {
      console.warn(
        "Profile does not exist. Creating profile:",
        user.id,
      );

      const metadata =
        user.user_metadata ?? {};

      const fullName =
        String(
          metadata.full_name ??
            "",
        ).trim() || null;

      const phoneNumber =
        String(
          metadata.phone_number ??
            "",
        ).trim() || null;

      const email =
        user.email?.trim() ||
        null;

      const {
        error: createProfileError,
      } =
        await adminSupabase
          .from("profiles")
          .insert({
            id: user.id,
            full_name:
              fullName,
            phone_number:
              phoneNumber,
            email,
            kyc_level: 1,
            kyc_status:
              "unverified",
            bvn_verified:
              false,
          });

      if (createProfileError) {
        console.error(
          "Unable to create missing profile:",
          createProfileError,
        );

        return json(
          {
            success: false,
            verified: false,
            error:
              "BVN was verified, but your profile could not be created.",
          },
          500,
        );
      }

      console.log(
        "Missing profile created successfully:",
        user.id,
      );
    }

    // ==========================================================
    // UPDATE PROFILE
    // ==========================================================

    console.log(
      "Updating profile KYC fields:",
      JSON.stringify({
        user_id: user.id,
        bvn_last_four:
          bvn.slice(-4),
      }),
    );

    /*
     * IMPORTANT:
     *
     * Do NOT include bvn_masked here.
     *
     * The previous PGRST204 error came from that field.
     *
     * We calculate the masked BVN in the response instead.
     */

    const {
      error: updateError,
    } =
      await adminSupabase
        .from("profiles")
        .update({
          bvn:
            bvn,

          bvn_verified:
            true,

          bvn_verified_at:
            now,

          kyc_level:
            2,

          kyc_status:
            "verified",

          updated_at:
            now,
        })
        .eq(
          "id",
          user.id,
        );

    if (updateError) {
      console.error(
        "PROFILE KYC UPDATE FAILED:",
        updateError,
      );

      return json(
        {
          success: false,
          verified: false,
          error:
            "BVN was verified, but your KYC profile could not be updated.",
          database_error:
            updateError.message,
        },
        500,
      );
    }

    console.log(
      "Profile KYC update command completed.",
    );

    // ==========================================================
    // SEPARATE DATABASE VERIFICATION
    // ==========================================================

    /*
     * We intentionally perform a NEW SELECT.
     *
     * We no longer depend on:
     *
     * update(...).select(...).maybeSingle()
     *
     * to confirm the update.
     */

    const {
      data: savedProfile,
      error: verifyDatabaseError,
    } =
      await adminSupabase
        .from("profiles")
        .select(
          `
            id,
            kyc_level,
            kyc_status,
            bvn,
            bvn_verified,
            bvn_verified_at
          `,
        )
        .eq("id", user.id)
        .maybeSingle();

    if (verifyDatabaseError) {
      console.error(
        "Unable to verify saved KYC profile:",
        verifyDatabaseError,
      );

      return json(
        {
          success: false,
          verified: false,
          error:
            "BVN was verified, but we could not confirm the profile update.",
          database_error:
            verifyDatabaseError.message,
        },
        500,
      );
    }

    // ==========================================================
    // PROFILE STILL MISSING
    // ==========================================================

    if (!savedProfile) {
      console.error(
        "CRITICAL: Profile still not found after update:",
        user.id,
      );

      return json(
        {
          success: false,
          verified: false,
          error:
            "BVN was verified, but your profile record could not be found after the update.",
        },
        500,
      );
    }

    // ==========================================================
    // VERIFY ACTUAL VALUES
    // ==========================================================

    const savedBvn =
      String(
        savedProfile.bvn ??
          "",
      ).replace(/\D/g, "");

    const savedKycLevel =
      Number(
        savedProfile.kyc_level ??
          0,
      );

    const savedKycStatus =
      String(
        savedProfile.kyc_status ??
          "",
      ).toLowerCase();

    const savedBvnVerified =
      Boolean(
        savedProfile.bvn_verified,
      );

    const databaseUpdateConfirmed =
      savedBvn === bvn &&
      savedBvnVerified === true &&
      savedKycLevel === 2 &&
      savedKycStatus ===
        "verified";

    console.log(
      "DATABASE KYC VERIFICATION:",
      JSON.stringify({
        user_id: user.id,

        bvn_saved:
          savedBvn === bvn,

        bvn_verified:
          savedBvnVerified,

        kyc_level:
          savedKycLevel,

        kyc_status:
          savedKycStatus,

        database_update_confirmed:
          databaseUpdateConfirmed,
      }),
    );

    // ==========================================================
    // DATABASE VERIFICATION FAILED
    // ==========================================================

    if (!databaseUpdateConfirmed) {
      console.error(
        "KYC values do not match expected values.",
      );

      return json(
        {
          success: false,
          verified: false,
          error:
            "BVN was verified, but the saved KYC information could not be confirmed.",
        },
        500,
      );
    }

    // ==========================================================
    // SUCCESS
    // ==========================================================

    console.log(
      "BVN verification and profile update completed successfully:",
      user.id,
    );

    return json(
      {
        success: true,

        verified: true,

        message:
          "BVN verification successful. Your KYC profile has been updated.",

        kyc_level: 2,

        kyc_status:
          "verified",

        bvn_masked:
          maskedBvn,

        bvn_verified_at:
          savedProfile.bvn_verified_at,

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
