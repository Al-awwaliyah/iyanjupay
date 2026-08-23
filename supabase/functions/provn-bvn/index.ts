import { getUser, json } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    // ENVIRONMENT VARIABLES
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
        "Supabase service credentials are not configured.",
      );

      return json(
        {
          success: false,
          error:
            "Database service is not configured.",
        },
        500,
      );
    }

    // ==========================================================
    // ADMIN SUPABASE CLIENT
    // ==========================================================

    const supabaseAdmin =
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
        await supabaseAdmin
          .from("profiles")
          .select(
            "kyc_level, kyc_status, bvn_masked",
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
        profile?.kyc_status ===
        "verified";

      return json(
        {
          success: true,
          verified,
          kyc_level:
            Number(
              profile?.kyc_level ?? 1,
            ),
          kyc_status:
            profile?.kyc_status ??
            "unverified",
          bvn_masked:
            profile?.bvn_masked ??
            null,
          fee: 0,
        },
        200,
      );
    }

    // ==========================================================
    // ONLY VERIFY IS SUPPORTED AFTER THIS POINT
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

    const bvn = String(
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
    // READ PROVN RESPONSE
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
    // PROVIDER ERROR
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
          error: providerError,
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
    // VERIFICATION DATA
    // ==========================================================

    const data =
      providerData?.data ?? {};

    const firstName =
      String(
        data?.first_name ?? "",
      ).trim();

    const lastName =
      String(
        data?.last_name ?? "",
      ).trim();

    const middleName =
      String(
        data?.middle_name ?? "",
      ).trim();

    const phoneNumber =
      String(
        data?.phone_number ?? "",
      ).trim();

    const dateOfBirth =
      String(
        data?.date_of_birth ?? "",
      ).trim();

    const residentialAddress =
      String(
        data?.residential_address ??
          "",
      ).trim();

    const stateOfOrigin =
      String(
        data?.state_of_origin ?? "",
      ).trim();

    // ==========================================================
    // BUILD FULL NAME FROM BVN
    // ==========================================================

    const fullName = [
      firstName,
      middleName,
      lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    // ==========================================================
    // MASK BVN
    // ==========================================================

    const bvnMasked =
      `******${bvn.slice(-4)}`;

    // ==========================================================
    // UPDATE USER PROFILE
    // ==========================================================

    const profileUpdate: Record<
      string,
      any
    > = {
      kyc_status: "verified",
      kyc_level: 2,
      bvn_masked: bvnMasked,
      updated_at:
        new Date().toISOString(),
    };

    if (fullName) {
      profileUpdate.full_name =
        fullName;
    }

    if (phoneNumber) {
      profileUpdate.phone_number =
        phoneNumber;
    }

    if (dateOfBirth) {
      profileUpdate.date_of_birth =
        dateOfBirth;
    }

    if (residentialAddress) {
      profileUpdate.address =
        residentialAddress;
    }

    const {
      error: profileUpdateError,
    } =
      await supabaseAdmin
        .from("profiles")
        .update(profileUpdate)
        .eq("id", user.id);

    if (profileUpdateError) {
      console.error(
        "Failed to update profile after BVN verification:",
        profileUpdateError,
      );

      return json(
        {
          success: false,
          verified: false,
          error:
            "BVN was verified, but your profile could not be updated. Please try again.",
        },
        500,
      );
    }

    // ==========================================================
    // SUCCESS
    // ==========================================================

    console.log(
      "BVN verification successful and profile updated:",
      JSON.stringify({
        user_id: user.id,
        bvn_last_four:
          bvn.slice(-4),
        kyc_level: 2,
      }),
    );

    return json(
      {
        success: true,

        verified: true,

        message:
          providerData?.message ||
          "BVN verification successful.",

        verification: {
          first_name:
            firstName || null,

          last_name:
            lastName || null,

          middle_name:
            middleName || null,

          date_of_birth:
            dateOfBirth || null,

          phone_number:
            phoneNumber || null,

          residential_address:
            residentialAddress ||
            null,

          state_of_origin:
            stateOfOrigin || null,
        },

        profile_updated: true,

        kyc_level: 2,

        bvn_masked:
          bvnMasked,
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
```

### 2. Important database requirement

The code above expects these columns in your existing `profiles` table:

```text
kyc_level
kyc_status
bvn_masked
```

Your existing component already expects those KYC concepts, so **check your `profiles` table before deploying**.

If those three columns don't exist, **don't deploy this version yet**. Send me your current `profiles` table SQL and I'll give you the exact migration instead of guessing your schema.

### 3. Replace the BVN-related parts in `ProfilePage.tsx`

Your component must call:

```text
provn-bvn
```

—not:

```text
flutterwave-bvn
```

The important replacement is this:

```tsx
// ============================================================
// PROVN BVN EDGE FUNCTION
// ============================================================

const invokeBvn = useCallback(
  async (
    payload: Record<string, unknown>,
  ) => {
    const {
      data,
      error,
    } = await supabase.functions.invoke(
      "provn-bvn",
      {
        body: payload,
      },
    );

    if (error) {
      let message =
        error.message ??
        "BVN request failed";

      const context =
        (error as any)?.context;

      if (
        context &&
        typeof context.json ===
          "function"
      ) {
        try {
          const body =
            await context.json();

          if (body?.error) {
            message = body.error;
          }
        } catch {
          // Keep original error.
        }
      }

      throw new Error(message);
    }

    if (
      data &&
      data.success === false
    ) {
      throw new Error(
        data.error ??
          "BVN verification failed.",
      );
    }

    return data;
  },
  [],
);


// ============================================================
// FETCH KYC STATUS
// ============================================================

const fetchKyc = useCallback(
  async () => {
    setKycLoading(true);

    try {
      const data =
        await invokeBvn({
          action: "status",
        });

      setKyc({
        verified: Boolean(
          data?.verified,
        ),

        kyc_level: Number(
          data?.kyc_level ?? 1,
        ),

        kyc_status: String(
          data?.kyc_status ??
            "unverified",
        ),

        bvn_masked:
          data?.bvn_masked ??
          null,

        fee: Number(
          data?.fee ?? 0,
        ),
      });
    } catch (error: any) {
      console.error(
        "Unable to load KYC status:",
        error,
      );

      /*
       * Do not block the profile page if
       * KYC status cannot be loaded.
       */
      setKyc({
        verified: false,
        kyc_level: 1,
        kyc_status:
          "unverified",
        bvn_masked: null,
        fee: 0,
      });
    } finally {
      setKycLoading(false);
    }
  },
  [invokeBvn],
);


// ============================================================
// BVN VERIFICATION
// ============================================================

const handleVerifyBvn =
  async () => {
    const digits =
      bvn.replace(/\D/g, "");

    if (digits.length !== 11) {
      toast({
        title: "Invalid BVN",
        description:
          "Your BVN must be exactly 11 digits.",
        variant:
          "destructive",
      });

      return;
    }

    setVerifying(true);

    try {
      const result =
        await invokeBvn({
          action: "verify",
          bvn: digits,
        });

      if (
        !result?.success ||
        !result?.verified
      ) {
        throw new Error(
          result?.error ??
            "BVN verification failed.",
        );
      }

      // ======================================================
      // AUTO-UPDATE FRONTEND FORM FROM BVN
      // ======================================================

      const verification =
        result?.verification;

      if (verification) {
        const firstName =
          String(
            verification.first_name ??
              "",
          ).trim();

        const middleName =
          String(
            verification.middle_name ??
              "",
          ).trim();

        const lastName =
          String(
            verification.last_name ??
              "",
          ).trim();

        const fullName = [
          firstName,
          middleName,
          lastName,
        ]
          .filter(Boolean)
          .join(" ")
          .trim();

        if (fullName) {
          form.setValue(
            "full_name",
            fullName,
            {
              shouldDirty: false,
              shouldValidate: true,
            },
          );
        }

        if (
          verification.phone_number
        ) {
          form.setValue(
            "phone_number",
            String(
              verification.phone_number,
            ),
            {
              shouldDirty: false,
            },
          );
        }

        if (
          verification.date_of_birth
        ) {
          form.setValue(
            "date_of_birth",
            String(
              verification.date_of_birth,
            ),
            {
              shouldDirty: false,
            },
          );
        }

        if (
          verification.residential_address
        ) {
          form.setValue(
            "address",
            String(
              verification.residential_address,
            ),
            {
              shouldDirty: false,
            },
          );
        }
      }

      // ======================================================
      // SUCCESS
      // ======================================================

      toast({
        title:
          "BVN verified successfully",
        description:
          "Your BVN has been verified and your profile information has been updated.",
      });

      setBvn("");

      // Reload KYC status from database.
      await fetchKyc();

      // Reload profile from database.
      await fetchProfile();
    } catch (error: any) {
      console.error(
        "BVN verification error:",
        error,
      );

      toast({
        title:
          "Verification failed",
        description:
          error?.message ??
          "Unable to verify your BVN.",
        variant:
          "destructive",
      });
    } finally {
      setVerifying(false);
    }
  };
```

Then make sure your BVN card says:

```tsx
<CardTitle>
  BVN Verification
</CardTitle>
```

and **not** anything referring to Flutterwave.

Your button remains:

```tsx
<Button
  type="button"
  className="bg-blue-600 hover:bg-blue-700"
  onClick={handleVerifyBvn}
  disabled={
    verifying ||
    kycLoading ||
    kyc?.verified === true
  }
>
  {verifying ? (
    <>
      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      Verifying...
    </>
  ) : (
    "Verify BVN"
  )}
</Button>
