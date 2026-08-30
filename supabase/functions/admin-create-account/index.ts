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

const ALLOWED_ROLES: AdminRole[] = [
  "super_admin",
  "operations_admin",
  "support_admin",
  "finance_admin",
  "compliance_admin",
  "read_only_admin",
];

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function normalizeRole(value: unknown): AdminRole | null {
  const role = String(value ?? "")
    .trim()
    .toLowerCase();

  if (
    ALLOWED_ROLES.includes(
      role as AdminRole,
    )
  ) {
    return role as AdminRole;
  }

  return null;
}

function normalizeName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeEmail(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createTemporaryPassword(lastName: string): string {
  const cleanLastName = lastName
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "");

  if (!cleanLastName) {
    throw new Error(
      "A valid last name is required to generate the temporary password.",
    );
  }

  return `${cleanLastName}@123`;
}

async function sendBrevoEmail(params: {
  toEmail: string;
  toName: string;
  firstName: string;
  lastName: string;
  role: AdminRole;
  temporaryPassword: string;
  adminPortalUrl: string;
}) {
  const smtpHost =
    Deno.env.get("BREVO_SMTP_HOST");

  const smtpPort =
    Deno.env.get("BREVO_SMTP_PORT");

  const smtpUser =
    Deno.env.get("BREVO_SMTP_USER");

  const smtpPassword =
    Deno.env.get("BREVO_SMTP_PASSWORD");

  const fromEmail =
    Deno.env.get("BREVO_FROM_EMAIL");

  const fromName =
    Deno.env.get("BREVO_FROM_NAME") ||
    "IyanjuPay";

  const adminPortalUrl =
    Deno.env.get("ADMIN_PORTAL_URL");

  if (
    !smtpHost ||
    !smtpPort ||
    !smtpUser ||
    !smtpPassword ||
    !fromEmail ||
    !adminPortalUrl
  ) {
    throw new Error(
      "Brevo SMTP or ADMIN_PORTAL_URL configuration is incomplete.",
    );
  }

  /*
   * Brevo SMTP API is exposed through smtp-relay.brevo.com.
   *
   * We use the Brevo transactional email HTTP API instead of
   * opening a raw SMTP socket from Deno.
   *
   * BREVO_SMTP_PASSWORD is used as the Brevo API key.
   */

  const response = await fetch(
    "https://api.brevo.com/v3/smtp/email",
    {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": smtpPassword,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          email: fromEmail,
          name: fromName,
        },
        to: [
          {
            email: params.toEmail,
            name: params.toName,
          },
        ],
        subject:
          "Your IyanjuPay Administrator Account",
        htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport"
        content="width=device-width, initial-scale=1.0" />
  <title>IyanjuPay Administrator Account</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#f5f7fb;
  font-family:Arial,Helvetica,sans-serif;
  color:#222;
">

  <div style="
    max-width:620px;
    margin:40px auto;
    background:#ffffff;
    border-radius:12px;
    overflow:hidden;
    box-shadow:0 4px 20px rgba(0,0,0,0.08);
  ">

    <div style="
      background:#082A63;
      padding:28px;
      text-align:center;
    ">
      <h1 style="
        margin:0;
        color:#ffffff;
        font-size:26px;
      ">
        IyanjuPay
      </h1>

      <p style="
        margin:8px 0 0;
        color:#dbe7ff;
        font-size:14px;
      ">
        Administrator Portal
      </p>
    </div>

    <div style="padding:32px;">

      <h2 style="
        margin-top:0;
        color:#082A63;
      ">
        Welcome, ${escapeHtml(params.firstName)}
      </h2>

      <p>
        A new administrator account has been created
        for you on IyanjuPay.
      </p>

      <p>
        Your assigned administrator role is:
      </p>

      <div style="
        display:inline-block;
        padding:10px 16px;
        background:#eef4ff;
        border-radius:8px;
        color:#082A63;
        font-weight:bold;
        margin-bottom:20px;
      ">
        ${escapeHtml(params.role)}
      </div>

      <div style="
        background:#f7f8fa;
        border:1px solid #e3e6eb;
        border-radius:10px;
        padding:20px;
        margin:20px 0;
      ">

        <p style="margin:0 0 12px;">
          <strong>Admin Email</strong><br />
          ${escapeHtml(params.toEmail)}
        </p>

        <p style="margin:0;">
          <strong>Temporary Password</strong><br />

          <span style="
            display:inline-block;
            margin-top:6px;
            padding:10px 14px;
            background:#ffffff;
            border:1px solid #d7dbe2;
            border-radius:6px;
            font-family:monospace;
            font-size:16px;
          ">
            ${escapeHtml(params.temporaryPassword)}
          </span>
        </p>

      </div>

      <p>
        Use the button below to access the administrator
        portal.
      </p>

      <div style="
        text-align:center;
        margin:28px 0;
      ">

        <a
          href="${escapeHtml(params.adminPortalUrl)}"
          style="
            display:inline-block;
            background:#082A63;
            color:#ffffff;
            text-decoration:none;
            padding:13px 24px;
            border-radius:7px;
            font-weight:bold;
          "
        >
          Open Admin Portal
        </a>

      </div>

      <div style="
        background:#fff8e6;
        border-left:4px solid #F4B400;
        padding:14px 16px;
        border-radius:5px;
        margin-top:24px;
      ">
        <strong>Important:</strong>
        This is a temporary password.
        You will be required to change it after your
        first successful login.
      </div>

      <p style="
        margin-top:28px;
        font-size:13px;
        color:#666;
      ">
        If you did not expect to receive this account,
        please contact the IyanjuPay administrator.
      </p>

    </div>

    <div style="
      padding:20px 32px;
      background:#f5f7fb;
      text-align:center;
      font-size:12px;
      color:#777;
    ">
      © IyanjuPay. All rights reserved.
    </div>

  </div>

</body>
</html>
        `,
      }),
    },
  );

  if (!response.ok) {
    let errorText = "";

    try {
      errorText = await response.text();
    } catch {
      errorText =
        "Unknown Brevo email error.";
    }

    throw new Error(
      `Brevo email delivery failed: ${errorText}`,
    );
  }

  return await response.json();
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
    Deno.env.get("SUPABASE_URL");

  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY");

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !anonKey
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          "Supabase environment configuration is incomplete.",
      },
      500,
    );
  }

  try {
    /*
     * ---------------------------------------------------------
     * 1. Authenticate caller
     * ---------------------------------------------------------
     */

    const authorization =
      req.headers.get("Authorization");

    if (!authorization) {
      return jsonResponse(
        {
          success: false,
          error: "Authentication required.",
        },
        401,
      );
    }

    const callerClient =
      createClient(
        supabaseUrl,
        anonKey,
        {
          global: {
            headers: {
              Authorization:
                authorization,
            },
          },
        },
      );

    const {
      data: {
        user: caller,
      },
      error: callerError,
    } =
      await callerClient.auth.getUser();

    if (
      callerError ||
      !caller
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Unable to authenticate administrator.",
        },
        401,
      );
    }

    /*
     * ---------------------------------------------------------
     * 2. Service-role client
     * ---------------------------------------------------------
     */

    const adminClient =
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

    /*
     * ---------------------------------------------------------
     * 3. Verify active super admin
     * ---------------------------------------------------------
     */

    const {
      data: callerAdmin,
      error: callerAdminError,
    } = await adminClient
      .from("support_admins")
      .select(
        "user_id, role, is_active",
      )
      .eq(
        "user_id",
        caller.id,
      )
      .eq(
        "is_active",
        true,
      )
      .maybeSingle();

    if (
      callerAdminError ||
      !callerAdmin ||
      callerAdmin.role !==
        "super_admin"
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Super administrator authorization required.",
        },
        403,
      );
    }

    /*
     * ---------------------------------------------------------
     * 4. Parse request
     * ---------------------------------------------------------
     */

    const body =
      await req.json();

    const firstName =
      normalizeName(
        body.first_name ??
          body.firstName,
      );

    const lastName =
      normalizeName(
        body.last_name ??
          body.lastName,
      );

    const email =
      normalizeEmail(
        body.email,
      );

    const role =
      normalizeRole(
        body.role,
      );

    const notes =
      body.notes == null
        ? null
        : String(body.notes).trim() ||
          null;

    /*
     * ---------------------------------------------------------
     * 5. Validate request
     * ---------------------------------------------------------
     */

    if (!firstName) {
      return jsonResponse(
        {
          success: false,
          error:
            "First name is required.",
        },
        400,
      );
    }

    if (!lastName) {
      return jsonResponse(
        {
          success: false,
          error:
            "Last name is required.",
        },
        400,
      );
    }

    if (!email) {
      return jsonResponse(
        {
          success: false,
          error:
            "Email address is required.",
        },
        400,
      );
    }

    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !emailPattern.test(email)
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "A valid email address is required.",
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
          allowed_roles:
            ALLOWED_ROLES,
        },
        400,
      );
    }

    /*
     * ---------------------------------------------------------
     * 6. Prevent duplicate email
     * ---------------------------------------------------------
     */

    let existingUserId: string | null =
      null;

    let page = 1;

    while (true) {
      const {
        data: usersPage,
        error: usersError,
      } =
        await adminClient.auth.admin
          .listUsers({
            page,
            perPage: 1000,
          });

      if (usersError) {
        throw usersError;
      }

      const existing =
        usersPage.users.find(
          (u) =>
            normalizeEmail(
              u.email,
            ) === email,
        );

      if (existing) {
        existingUserId =
          existing.id;
        break;
      }

      if (
        usersPage.users.length <
        1000
      ) {
        break;
      }

      page++;
    }

    if (existingUserId) {
      return jsonResponse(
        {
          success: false,
          error:
            "A user with this email address already exists.",
        },
        409,
      );
    }

    /*
     * ---------------------------------------------------------
     * 7. Generate temporary password
     * ---------------------------------------------------------
     *
     * Format:
     *
     * Lastname@123
     *
     * Example:
     *
     * Lawal@123
     *
     * The password is never returned to the frontend.
     */

    const temporaryPassword =
      createTemporaryPassword(
        lastName,
      );

    /*
     * ---------------------------------------------------------
     * 8. Create Auth user
     * ---------------------------------------------------------
     */

    const {
      data: createdAuth,
      error:
        createAuthError,
    } =
      await adminClient.auth.admin
        .createUser({
          email,
          password:
            temporaryPassword,
          email_confirm: true,
          user_metadata: {
            full_name:
              `${firstName} ${lastName}`,
            first_name:
              firstName,
            last_name:
              lastName,
            account_type:
              "admin",
          },
        });

    if (
      createAuthError ||
      !createdAuth.user
    ) {
      throw (
        createAuthError ??
        new Error(
          "Unable to create administrator authentication account.",
        )
      );
    }

    const newUserId =
      createdAuth.user.id;

    let databaseCreated = false;

    try {
      /*
       * -------------------------------------------------------
       * 9. Create support_admins record
       * -------------------------------------------------------
       */

      const {
        error:
          supportAdminError,
      } =
        await adminClient
          .from("support_admins")
          .insert({
            user_id:
              newUserId,
            role,
            is_active: true,
            created_by:
              caller.id,
          });

      if (supportAdminError) {
        throw supportAdminError;
      }

      /*
       * -------------------------------------------------------
       * 10. Create management metadata
       * -------------------------------------------------------
       */

      const {
        error:
          metadataError,
      } =
        await adminClient
          .from(
            "admin_management_metadata",
          )
          .insert({
            admin_user_id:
              newUserId,
            display_name:
              `${firstName} ${lastName}`,
            notes,
            last_activity_at:
              new Date().toISOString(),
            must_change_password:
              true,
          });

      if (metadataError) {
        throw metadataError;
      }

      databaseCreated = true;

      /*
       * -------------------------------------------------------
       * 11. Create mandatory audit log
       * -------------------------------------------------------
       *
       * NEVER store the temporary password.
       */

      const {
        error:
          auditError,
      } =
        await adminClient.rpc(
          "admin_audit_log_create",
          {
            p_category:
              "admin_management",

            p_action:
              "admin_created",

            p_description:
              "A new administrator account was created",

            p_target_type:
              "admin",

            p_target_id:
              newUserId,

            p_user_id:
              newUserId,

            p_before_data:
              null,

            p_after_data:
              {
                user_id:
                  newUserId,
                email,
                first_name:
                  firstName,
                last_name:
                  lastName,
                role,
                is_active:
                  true,
                must_change_password:
                  true,
              },

            p_metadata:
              {
                source:
                  "admin-create-account",
                created_by:
                  caller.id,
                temporary_password_sent:
                  true,
              },
          },
        );

      if (auditError) {
        throw auditError;
      }

      /*
       * -------------------------------------------------------
       * 12. Send credentials through Brevo
       * -------------------------------------------------------
       */

      const adminPortalUrl =
        Deno.env.get(
          "ADMIN_PORTAL_URL",
        );

      if (!adminPortalUrl) {
        throw new Error(
          "ADMIN_PORTAL_URL is not configured.",
        );
      }

      await sendBrevoEmail({
        toEmail: email,
        toName:
          `${firstName} ${lastName}`,
        firstName,
        lastName,
        role,
        temporaryPassword,
        adminPortalUrl,
      });

      /*
       * -------------------------------------------------------
       * 13. Update metadata to record activity
       * -------------------------------------------------------
       */

      await adminClient
        .from(
          "admin_management_metadata",
        )
        .update({
          last_activity_at:
            new Date().toISOString(),
        })
        .eq(
          "admin_user_id",
          newUserId,
        );

      /*
       * -------------------------------------------------------
       * 14. Success
       * -------------------------------------------------------
       */

      return jsonResponse(
        {
          success: true,
          message:
            "Administrator account created successfully and login credentials were sent by email.",
          admin: {
            user_id:
              newUserId,
            email,
            first_name:
              firstName,
            last_name:
              lastName,
            display_name:
              `${firstName} ${lastName}`,
            role,
            is_active:
              true,
            must_change_password:
              true,
          },
        },
        201,
      );
    } catch (operationError) {
      /*
       * -------------------------------------------------------
       * Rollback database records
       * -------------------------------------------------------
       */

      if (databaseCreated) {
        await adminClient
          .from(
            "admin_management_metadata",
          )
          .delete()
          .eq(
            "admin_user_id",
            newUserId,
          );

        await adminClient
          .from("support_admins")
          .delete()
          .eq(
            "user_id",
            newUserId,
          );
      }

      /*
       * -------------------------------------------------------
       * Rollback Auth account
       * -------------------------------------------------------
       */

      await adminClient.auth.admin
        .deleteUser(newUserId);

      throw operationError;
    }
  } catch (error) {
    console.error(
      "admin-create-account error:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "Unable to create administrator account.";

    return jsonResponse(
      {
        success: false,
        error: message,
      },
      500,
    );
  }
});
