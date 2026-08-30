import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type AdminRole =
  | "super_admin"
  | "operations_admin"
  | "support_admin"
  | "finance_admin"
  | "compliance_admin"
  | "read_only_admin";

const VALID_ROLES: AdminRole[] = [
  "super_admin",
  "operations_admin",
  "support_admin",
  "finance_admin",
  "compliance_admin",
  "read_only_admin",
];

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function normalizeName(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ")
    : "";
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

function normalizeRole(value: unknown): AdminRole | null {
  if (typeof value !== "string") {
    return null;
  }

  const role = value.trim().toLowerCase();

  return VALID_ROLES.includes(role as AdminRole)
    ? (role as AdminRole)
    : null;
}

function getLastName(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "";
  }

  return parts[parts.length - 1];
}

function buildTemporaryPassword(fullName: string): string {
  const lastName = getLastName(fullName);

  if (!lastName) {
    throw new Error(
      "A valid last name is required to generate the temporary password.",
    );
  }

  const normalizedLastName =
    lastName.charAt(0).toUpperCase() +
    lastName.slice(1);

  return `${normalizedLastName}@123`;
}

function getRoleLabel(role: AdminRole): string {
  const labels: Record<AdminRole, string> = {
    super_admin: "Super Admin",
    operations_admin: "Operations Admin",
    support_admin: "Support Admin",
    finance_admin: "Finance Admin",
    compliance_admin: "Compliance Admin",
    read_only_admin: "Read Only Admin",
  };

  return labels[role];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendBrevoEmail(params: {
  recipientEmail: string;
  recipientName: string;
  temporaryPassword: string;
  role: AdminRole;
  adminPortalUrl: string;
}) {
  const host =
    Deno.env.get("BREVO_SMTP_HOST")?.trim() || "";

  const port =
    Number(Deno.env.get("BREVO_SMTP_PORT") || "587");

  const username =
    Deno.env.get("BREVO_SMTP_USER")?.trim() || "";

  const password =
    Deno.env.get("BREVO_SMTP_PASSWORD") || "";

  const fromEmail =
    Deno.env.get("BREVO_FROM_EMAIL")?.trim() || "";

  const fromName =
    Deno.env.get("BREVO_FROM_NAME")?.trim() ||
    "IyanjuPay";

  const portalUrl =
    Deno.env.get("ADMIN_PORTAL_URL")?.trim() ||
    "https://iyanjupay.vercel.app/admin/login";

  if (
    !host ||
    !port ||
    !username ||
    !password ||
    !fromEmail
  ) {
    throw new Error(
      "Brevo SMTP environment variables are not fully configured.",
    );
  }

  if (!params.adminPortalUrl) {
    throw new Error(
      "Admin portal URL is not configured.",
    );
  }

  /*
   * Brevo SMTP is exposed through the SMTP protocol.
   *
   * Deno's standard runtime does not provide a native
   * SMTP client, so use the Brevo transactional email API
   * with the configured Brevo credentials.
   *
   * BREVO_SMTP_PASSWORD is the Brevo SMTP/API credential
   * stored in Supabase Secrets.
   */
  const response = await fetch(
    "https://api.brevo.com/v3/smtp/email",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": password,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: fromName,
          email: fromEmail,
        },
        to: [
          {
            email: params.recipientEmail,
            name: params.recipientName,
          },
        ],
        subject:
          "Your IyanjuPay Administrator Account",
        htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>IyanjuPay Administrator Account</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#f8fafc;
  font-family:Arial,Helvetica,sans-serif;
  color:#0f172a;
">
  <div style="
    max-width:620px;
    margin:40px auto;
    background:#ffffff;
    border-radius:16px;
    overflow:hidden;
    border:1px solid #e2e8f0;
  ">

    <div style="
      background:#082A63;
      padding:28px 32px;
      color:#ffffff;
    ">
      <h1 style="
        margin:0;
        font-size:24px;
      ">
        IyanjuPay
      </h1>

      <p style="
        margin:8px 0 0;
        font-size:14px;
        opacity:.9;
      ">
        Administrator Portal
      </p>
    </div>

    <div style="padding:32px;">

      <h2 style="
        margin:0 0 16px;
        font-size:22px;
      ">
        Welcome, ${escapeHtml(params.recipientName)}
      </h2>

      <p style="
        font-size:15px;
        line-height:1.6;
        color:#475569;
      ">
        A new IyanjuPay administrator account has been
        created for you.
      </p>

      <div style="
        margin:24px 0;
        padding:20px;
        background:#f8fafc;
        border:1px solid #e2e8f0;
        border-radius:12px;
      ">

        <p style="
          margin:0 0 12px;
          font-size:13px;
          color:#64748b;
        ">
          Administrator Role
        </p>

        <p style="
          margin:0 0 20px;
          font-size:16px;
          font-weight:bold;
        ">
          ${escapeHtml(getRoleLabel(params.role))}
        </p>

        <p style="
          margin:0 0 12px;
          font-size:13px;
          color:#64748b;
        ">
          Email
        </p>

        <p style="
          margin:0 0 20px;
          font-size:16px;
          font-weight:bold;
        ">
          ${escapeHtml(params.recipientEmail)}
        </p>

        <p style="
          margin:0 0 12px;
          font-size:13px;
          color:#64748b;
        ">
          Temporary Password
        </p>

        <div style="
          display:inline-block;
          padding:12px 16px;
          background:#ffffff;
          border:1px solid #cbd5e1;
          border-radius:8px;
          font-family:monospace;
          font-size:18px;
          font-weight:bold;
          letter-spacing:.5px;
        ">
          ${escapeHtml(params.temporaryPassword)}
        </div>

      </div>

      <p style="
        font-size:14px;
        line-height:1.6;
        color:#475569;
      ">
        Please sign in through the administrator portal
        using the email address and temporary password
        provided above.
      </p>

      <div style="
        margin:24px 0;
        text-align:center;
      ">
        <a
          href="${escapeHtml(portalUrl)}"
          style="
            display:inline-block;
            padding:13px 22px;
            background:#082A63;
            color:#ffffff;
            text-decoration:none;
            border-radius:8px;
            font-size:14px;
            font-weight:bold;
          "
        >
          Open Admin Portal
        </a>
      </div>

      <div style="
        margin-top:28px;
        padding:16px;
        background:#fff7ed;
        border:1px solid #fed7aa;
        border-radius:10px;
      ">
        <p style="
          margin:0;
          font-size:13px;
          line-height:1.6;
          color:#9a3412;
        ">
          <strong>Security notice:</strong>
          This is a temporary password. You will be
          required to change it after your first
          administrator login. Do not share your
          administrator credentials with anyone.
        </p>
      </div>

      <p style="
        margin-top:30px;
        font-size:12px;
        line-height:1.5;
        color:#94a3b8;
      ">
        If you were not expecting this administrator
        account, please contact the IyanjuPay
        administration team immediately.
      </p>

    </div>

    <div style="
      padding:20px 32px;
      background:#f8fafc;
      border-top:1px solid #e2e8f0;
      text-align:center;
    ">
      <p style="
        margin:0;
        font-size:12px;
        color:#94a3b8;
      ">
        © ${new Date().getFullYear()} IyanjuPay.
        All rights reserved.
      </p>
    </div>

  </div>
</body>
</html>
        `,
      }),
    },
  );

  const responseText = await response.text();

  let responseData: unknown = null;

  try {
    responseData = responseText
      ? JSON.parse(responseText)
      : null;
  } catch {
    responseData = responseText;
  }

  if (!response.ok) {
    console.error(
      "Brevo email API failed:",
      response.status,
      responseData,
    );

    throw new Error(
      "The administrator account was created, but the credential email could not be sent.",
    );
  }

  return responseData;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed",
      },
      405,
    );
  }

  const supabaseUrl =
    Deno.env.get("SUPABASE_URL")?.trim() || "";

  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
    "";

  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY")?.trim() || "";

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !anonKey
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          "Supabase environment variables are not configured.",
      },
      500,
    );
  }

  const authorization =
    req.headers.get("Authorization");

  if (!authorization) {
    return jsonResponse(
      {
        success: false,
        error: "Unauthorized",
      },
      401,
    );
  }

  try {
    /*
     * User-scoped client.
     *
     * This preserves the authenticated caller's JWT.
     */
    const userClient = createClient(
      supabaseUrl,
      anonKey,
      {
        global: {
          headers: {
            Authorization: authorization,
          },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse(
        {
          success: false,
          error: "Unauthorized",
        },
        401,
      );
    }

    /*
     * Service-role client.
     *
     * Used only inside this trusted Edge Function.
     */
    const admin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    /*
     * Require the caller to be a super administrator.
     */
    const { data: isSuperAdmin, error: permissionError } =
      await admin.rpc(
        "admin_management_require_super_admin",
      );

    /*
     * The RPC is designed as an authorization guard.
     * If it succeeds, the current authenticated user
     * must be a super administrator.
     *
     * Because the service-role client does not carry
     * the caller JWT, explicitly perform the check below.
     */
    if (permissionError) {
      /*
       * Do the authorization check directly against
       * support_admins as a service-side fallback.
       */
      const {
        data: callerAdmin,
        error: callerAdminError,
      } = await admin
        .from("support_admins")
        .select("user_id, role, is_active")
        .eq("user_id", user.id)
        .maybeSingle();

      if (
        callerAdminError ||
        !callerAdmin ||
        callerAdmin.role !== "super_admin" ||
        callerAdmin.is_active !== true
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "Only an active Super Admin can create administrator accounts.",
          },
          403,
        );
      }
    } else {
      /*
       * The direct RPC result is not relied upon because
       * service-role auth.uid() may not represent the
       * caller. Verify explicitly as well.
       */
      const {
        data: callerAdmin,
        error: callerAdminError,
      } = await admin
        .from("support_admins")
        .select("user_id, role, is_active")
        .eq("user_id", user.id)
        .maybeSingle();

      if (
        callerAdminError ||
        !callerAdmin ||
        callerAdmin.role !== "super_admin" ||
        callerAdmin.is_active !== true
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "Only an active Super Admin can create administrator accounts.",
          },
          403,
        );
      }
    }

    /*
     * Parse request.
     */
    let body: Record<string, unknown>;

    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        {
          success: false,
          error: "Invalid JSON request body.",
        },
        400,
      );
    }

    const fullName = normalizeName(
      body.full_name,
    );

    const email = normalizeEmail(
      body.email,
    );

    const role = normalizeRole(
      body.role,
    );

    const displayName =
      normalizeName(body.display_name) ||
      fullName;

    const notes =
      typeof body.notes === "string"
        ? body.notes.trim()
        : null;

    if (!fullName) {
      return jsonResponse(
        {
          success: false,
          error: "Full name is required.",
        },
        400,
      );
    }

    if (fullName.length < 2) {
      return jsonResponse(
        {
          success: false,
          error:
            "Please provide the administrator's full name.",
        },
        400,
      );
    }

    if (!email) {
      return jsonResponse(
        {
          success: false,
          error: "Email address is required.",
        },
        400,
      );
    }

    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      return jsonResponse(
        {
          success: false,
          error: "Please provide a valid email address.",
        },
        400,
      );
    }

    if (!role) {
      return jsonResponse(
        {
          success: false,
          error:
            "A valid administrator role is required.",
        },
        400,
      );
    }

    /*
     * Prevent accidental self-account duplication.
     */
    if (
      user.email?.trim().toLowerCase() === email
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "The current administrator already has an account.",
        },
        400,
      );
    }

    /*
     * Check whether the email already belongs to an
     * administrator.
     *
     * We first search Auth users.
     */
    let existingAuthUserId: string | null = null;

    /*
     * Supabase Admin API does not provide an efficient
     * email lookup endpoint in every version, so use
     * listUsers with pagination.
     */
    let authPage = 1;
    const authPerPage = 1000;

    while (true) {
      const {
        data: usersPage,
        error: usersError,
      } = await admin.auth.admin.listUsers({
        page: authPage,
        perPage: authPerPage,
      });

      if (usersError) {
        console.error(
          "Failed to inspect existing Auth users:",
          usersError,
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Unable to verify whether the email address already exists.",
          },
          500,
        );
      }

      const matchingUser =
        usersPage.users.find(
          (authUser) =>
            authUser.email?.trim().toLowerCase() ===
            email,
        );

      if (matchingUser) {
        existingAuthUserId =
          matchingUser.id;
        break;
      }

      if (
        usersPage.users.length < authPerPage
      ) {
        break;
      }

      authPage += 1;
    }

    if (existingAuthUserId) {
      const {
        data: existingAdmin,
        error: existingAdminError,
      } = await admin
        .from("support_admins")
        .select("user_id, role, is_active")
        .eq(
          "user_id",
          existingAuthUserId,
        )
        .maybeSingle();

      if (existingAdminError) {
        console.error(
          "Existing administrator lookup failed:",
          existingAdminError,
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Unable to verify the existing account.",
          },
          500,
        );
      }

      if (existingAdmin) {
        return jsonResponse(
          {
            success: false,
            error:
              "This email address already belongs to an administrator.",
          },
          409,
        );
      }

      return jsonResponse(
        {
          success: false,
          error:
            "An account with this email address already exists. Administrator creation only supports creating a new account.",
        },
        409,
      );
    }

    /*
     * Generate temporary password.
     *
     * Example:
     * "John Johnson" -> Johnson@123
     */
    const temporaryPassword =
      buildTemporaryPassword(fullName);

    /*
     * Create the Auth account.
     *
     * email_confirm: true means the administrator
     * does not need the normal user email-verification
     * flow before entering the admin portal.
     */
    const {
      data: createdUser,
      error: createUserError,
    } = await admin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        display_name: displayName,
        account_type: "admin",
        admin_role: role,
        must_change_password: true,
        created_by_admin_id: user.id,
      },
    });

    if (
      createUserError ||
      !createdUser.user
    ) {
      console.error(
        "Admin Auth account creation failed:",
        createUserError,
      );

      return jsonResponse(
        {
          success: false,
          error:
            createUserError?.message ||
            "Failed to create the administrator account.",
        },
        400,
      );
    }

    const newAdminId =
      createdUser.user.id;

    /*
     * Create support_admins record.
     *
     * This table has user_id as its primary key.
     */
    const {
      error: adminInsertError,
    } = await admin
      .from("support_admins")
      .insert({
        user_id: newAdminId,
        role,
        is_active: true,
        created_by: user.id,
      });

    if (adminInsertError) {
      console.error(
        "support_admins insert failed:",
        adminInsertError,
      );

      await admin.auth.admin.deleteUser(
        newAdminId,
      );

      return jsonResponse(
        {
          success: false,
          error:
            "Administrator account could not be provisioned.",
        },
        500,
      );
    }

    /*
     * Create administrator metadata.
     */
    const {
      error: metadataError,
    } = await admin
      .from("admin_management_metadata")
      .insert({
        admin_user_id: newAdminId,
        display_name:
          displayName || fullName,
        notes,
        last_activity_at: null,
        must_change_password: true,
      });

    if (metadataError) {
      console.error(
        "Admin metadata insert failed:",
        metadataError,
      );

      await admin
        .from("support_admins")
        .delete()
        .eq(
          "user_id",
          newAdminId,
        );

      await admin.auth.admin.deleteUser(
        newAdminId,
      );

      return jsonResponse(
        {
          success: false,
          error:
            "Administrator metadata could not be created.",
        },
        500,
      );
    }

    /*
     * Send credentials.
     */
    const adminPortalUrl =
      Deno.env.get("ADMIN_PORTAL_URL")?.trim() ||
      "https://iyanjupay.vercel.app/admin/login";

    try {
      await sendBrevoEmail({
        recipientEmail: email,
        recipientName: fullName,
        temporaryPassword,
        role,
        adminPortalUrl,
      });
    } catch (emailError) {
      console.error(
        "Administrator credential email failed:",
        emailError,
      );

      /*
       * Do not leave an account that the new administrator
       * cannot receive credentials for.
       */
      await admin
        .from("admin_management_metadata")
        .delete()
        .eq(
          "admin_user_id",
          newAdminId,
        );

      await admin
        .from("support_admins")
        .delete()
        .eq(
          "user_id",
          newAdminId,
        );

      await admin.auth.admin.deleteUser(
        newAdminId,
      );

      return jsonResponse(
        {
          success: false,
          error:
            emailError instanceof Error
              ? emailError.message
              : "Failed to send administrator credentials.",
        },
        502,
      );
    }

    /*
     * Audit log.
     *
     * We insert directly because the audit helper
     * derives auth.uid(), which is not guaranteed to
     * represent the caller when using the service-role
     * client.
     */
    const { data: actingAdmin } =
      await admin
        .from("support_admins")
        .select("role")
        .eq(
          "user_id",
          user.id,
        )
        .maybeSingle();

    const { data: actingProfile } =
      await admin
        .from("profiles")
        .select("full_name, email")
        .eq(
          "id",
          user.id,
        )
        .maybeSingle();

    const { error: auditError } =
      await admin
        .from("admin_audit_logs")
        .insert({
          admin_user_id: user.id,
          admin_email:
            actingProfile?.email ||
            user.email ||
            null,
          admin_name:
            actingProfile?.full_name ||
            user.user_metadata?.full_name ||
            null,
          admin_role:
            actingAdmin?.role ||
            "super_admin",
          category:
            "admin_management",
          action:
            "admin_account_created",
          description:
            "A new administrator account was created.",
          target_type:
            "admin",
          target_id:
            newAdminId,
          user_id:
            newAdminId,
          before_data:
            null,
          after_data: {
            user_id: newAdminId,
            email,
            full_name: fullName,
            role,
            is_active: true,
            must_change_password: true,
          },
          metadata: {
            source:
              "admin-create-account",
            created_by:
              user.id,
            credential_delivery:
              "brevo",
          },
        });

    if (auditError) {
      /*
       * Do not roll back the account after credentials
       * have already been delivered solely because audit
       * logging failed. Log the failure for investigation.
       */
      console.error(
        "Administrator audit log failed:",
        auditError,
      );
    }

    /*
     * Return safe data only.
     *
     * NEVER return temporaryPassword.
     */
    return jsonResponse({
      success: true,
      admin: {
        user_id: newAdminId,
        email,
        full_name: fullName,
        role,
        is_active: true,
        must_change_password: true,
      },
      message:
        "Administrator account created successfully and login credentials were sent by email.",
    });
  } catch (error) {
    console.error(
      "admin-create-account failed:",
      error,
    );

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while creating the administrator account.",
      },
      500,
    );
  }
});
