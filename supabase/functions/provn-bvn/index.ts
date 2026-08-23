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
      console.error(
        "BVN verification: unauthorized request",
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
      "Authenticated user for BVN verification:",
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

    /*
     * IMPORTANT:
     *
     * We intentionally do NOT request bvn_masked here.
     *
     * The previous production error showed that PostgREST's
     * schema cache did not know about bvn_masked even though
     * the database SQL now contains the column.
     *
     * We therefore read bvn and calculate the masked value
     * locally.
     */

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

      const verified =
        Boolean(
          profile?.bvn_verified,
        ) ||
        String(
          profile?.kyc_status ?? "",
        ).toLowerCase() ===
          "verified";

      const storedBvn =
        String(
          profile?.bvn ?? "",
        ).replace(/\D/g, "");

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
    // ONLY VERIFY ACTION IS SUPPORTED
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
    // READ BVN
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

      console.error(
        "PROVN BVN verification failed:",
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
    // PROVIDER SUCCESS
    // ==========================================================

    /*
     * PROVN TEST MODE
     * ----------------
     *
     * Test credentials return dummy identity information.
     *
     * Therefore we DO NOT copy provider identity fields into
     * the user's profile.
     *
     * We only store:
     *
     *   bvn
     *   bvn_verified
     *   bvn_verified_at
     *   kyc_level
     *   kyc_status
     *
     * The bvn_masked value is calculated locally.
     */

    const now =
      new Date().toISOString();

    const maskedBvn =
      `******${bvn.slice(-4)}`;

    console.log(
      "PROVN accepted BVN. Updating local profile:",
      JSON.stringify({
        user_id: user.id,
        bvn_last_four:
          bvn.slice(-4),
        kyc_level: 2,
        kyc_status: "verified",
      }),
    );

    // ==========================================================
    // UPDATE PROFILE
    // ==========================================================

    /*
     * IMPORTANT:
     *
     * bvn_masked is intentionally NOT included here.
     *
     * Your previous log showed:
     *
     * PGRST204:
     * Could not find the 'bvn_masked' column of 'profiles'
     * in the schema cache
     *
     * Even though the SQL table now contains that column.
     *
     * By leaving bvn_masked out of this update, the critical
     * profile update will not fail because of the stale
     * PostgREST schema cache.
     */

    const {
      data: updatedProfile,
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

          bvn:
            bvn,

          bvn_verified_at:
            now,

          updated_at:
            now,
        })
        .eq(
          "id",
          user.id,
        )
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
        .maybeSingle();

    // ==========================================================
    // DATABASE UPDATE FAILURE
    // ==========================================================

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
            "BVN was accepted by the verification service, but your profile could not be updated.",

          database_error:
            updateError.message,
        },
        500,
      );
    }

    // ==========================================================
    // MAKE SURE A PROFILE ROW WAS ACTUALLY UPDATED
    // ==========================================================

    if (!updatedProfile) {
      console.error(
        "BVN profile update returned no profile row.",
      );

      return json(
        {
          success: false,
          verified: false,
          error:
            "BVN verification succeeded, but your profile record could not be found for updating.",
        },
        500,
      );
    }

    // ==========================================================
    // VERIFY DATABASE VALUES
    // ==========================================================

    const storedBvn =
      String(
        updatedProfile.bvn ??
          "",
      ).replace(/\D/g, "");

    const databaseUpdateConfirmed =
      storedBvn === bvn &&
      Boolean(
        updatedProfile.bvn_verified,
      ) === true &&
      Number(
        updatedProfile.kyc_level,
      ) === 2 &&
      String(
        updatedProfile.kyc_status ??
          "",
      ).toLowerCase() ===
        "verified";

    console.log(
      "KYC profile update result:",
      JSON.stringify({
        user_id:
          user.id,

        bvn_saved:
          storedBvn === bvn,

        bvn_verified:
          updatedProfile.bvn_verified,

        kyc_level:
          updatedProfile.kyc_level,

        kyc_status:
          updatedProfile.kyc_status,

        bvn_verified_at:
          updatedProfile.bvn_verified_at,

        database_update_confirmed:
          databaseUpdateConfirmed,
      }),
    );

    // ==========================================================
    // DATABASE VERIFICATION FAILED
    // ==========================================================

    if (!databaseUpdateConfirmed) {
      console.error(
        "Database update could not be confirmed.",
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
          updatedProfile.bvn_verified_at,

        /*
         * Provider identity payload is returned only as part
         * of the verification response.
         *
         * It is NOT copied into the user's profile.
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
