import {
  corsHeaders,
  json,
  adminClient,
  getUser,
} from "../_shared/auth.ts";

/**
 * IyanjuPay — Complete Profile
 *
 * Securely completes the authenticated user's required
 * onboarding profile information.
 *
 * The browser never directly writes onboarding/KYC fields.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

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
    // ----------------------------------------------------------
    // AUTHENTICATE USER
    // ----------------------------------------------------------

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

    // ----------------------------------------------------------
    // READ REQUEST
    // ----------------------------------------------------------

    let body: any;

    try {
      body = await req.json();
    } catch {
      return json(
        {
          success: false,
          error: "Invalid JSON request body.",
        },
        400,
      );
    }

    const {
      full_name,
      phone_number,
      nickname,
      gender,
      date_of_birth,
      address,
      nin,
    } = body ?? {};

    // ----------------------------------------------------------
    // NORMALIZE
    // ----------------------------------------------------------

    const normalizedFullName =
      typeof full_name === "string"
        ? full_name.trim()
        : "";

    const normalizedPhone =
      typeof phone_number === "string"
        ? phone_number.trim()
        : "";

    const normalizedNickname =
      typeof nickname === "string"
        ? nickname.trim()
        : "";

    const normalizedGender =
      typeof gender === "string"
        ? gender.trim().toLowerCase()
        : "";

    const normalizedDateOfBirth =
      typeof date_of_birth === "string"
        ? date_of_birth.trim()
        : "";

    const normalizedAddress =
      typeof address === "string"
        ? address.trim()
        : "";

    const normalizedNin =
      typeof nin === "string"
        ? nin.replace(/\D/g, "")
        : "";

    // ----------------------------------------------------------
    // VALIDATION
    // ----------------------------------------------------------

    if (normalizedFullName.length < 2) {
      return json(
        {
          success: false,
          error: "Please provide your full name.",
        },
        400,
      );
    }

    if (normalizedPhone.length < 7) {
      return json(
        {
          success: false,
          error: "Please provide a valid phone number.",
        },
        400,
      );
    }

    if (normalizedNickname.length < 2) {
      return json(
        {
          success: false,
          error: "Please provide a nickname.",
        },
        400,
      );
    }

    if (
      normalizedGender !== "male" &&
      normalizedGender !== "female"
    ) {
      return json(
        {
          success: false,
          error: "Please select a valid gender.",
        },
        400,
      );
    }

    if (!normalizedDateOfBirth) {
      return json(
        {
          success: false,
          error: "Please provide your date of birth.",
        },
        400,
      );
    }

    // Validate YYYY-MM-DD and actual date.
    const dobMatch =
      /^\d{4}-\d{2}-\d{2}$/.test(
        normalizedDateOfBirth,
      );

    if (!dobMatch) {
      return json(
        {
          success: false,
          error: "Invalid date of birth.",
        },
        400,
      );
    }

    const dob = new Date(
      `${normalizedDateOfBirth}T00:00:00Z`,
    );

    if (Number.isNaN(dob.getTime())) {
      return json(
        {
          success: false,
          error: "Invalid date of birth.",
        },
        400,
      );
    }

    if (dob > new Date()) {
      return json(
        {
          success: false,
          error:
            "Date of birth cannot be in the future.",
        },
        400,
      );
    }

    if (normalizedAddress.length < 5) {
      return json(
        {
          success: false,
          error:
            "Please provide your residential address.",
        },
        400,
      );
    }

    if (!/^\d{11}$/.test(normalizedNin)) {
      return json(
        {
          success: false,
          error:
            "NIN must contain exactly 11 digits.",
        },
        400,
      );
    }

    // ----------------------------------------------------------
    // UPDATE PROFILE
    // ----------------------------------------------------------
    //
    // IMPORTANT:
    // We deliberately do NOT allow the client to submit:
    //
    // - bvn
    // - bvn_verified
    // - bvn_verified_at
    // - kyc_level
    // - kyc_status
    // - bvn_masked
    //
    // Those remain controlled by the KYC verification flow.
    // ----------------------------------------------------------

    const { data: updatedProfile, error } =
      await adminClient
        .from("profiles")
        .update({
          full_name: normalizedFullName,
          phone_number: normalizedPhone,
          nickname: normalizedNickname,
          gender: normalizedGender,
          date_of_birth: normalizedDateOfBirth,
          email: user.email ?? null,
          address: normalizedAddress,
          nin: normalizedNin,
        })
        .eq("id", user.id)
        .select(
          `
            id,
            full_name,
            phone_number,
            nickname,
            gender,
            date_of_birth,
            email,
            address,
            nin,
            bvn_verified,
            kyc_level,
            kyc_status
          `,
        )
        .maybeSingle();

    if (error) {
      console.error(
        "complete-profile database error:",
        error,
      );

      return json(
        {
          success: false,
          error:
            "Unable to save your profile. Please try again.",
        },
        500,
      );
    }

    if (!updatedProfile) {
      return json(
        {
          success: false,
          error:
            "Your profile could not be found.",
        },
        404,
      );
    }

    // ----------------------------------------------------------
    // SUCCESS
    // ----------------------------------------------------------

    return json({
      success: true,
      message: "Profile completed successfully.",
      profile: updatedProfile,
      next_step: updatedProfile.bvn_verified
        ? "dashboard"
        : "bvn_verification",
    });
  } catch (error) {
    console.error(
      "complete-profile unexpected error:",
      error,
    );

    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      },
      500,
    );
  }
});
