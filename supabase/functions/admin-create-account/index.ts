import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@9.0.0";

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

type JsonRecord = Record<string, unknown>;

function jsonResponse(
  body: JsonRecord,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: corsHeaders,
    },
  );
}

function normalizeName(
  value: unknown,
): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeEmail(
  value: unknown,
): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .toLowerCase();
}

function normalizeRole(
  value: unknown,
): AdminRole | null {
  if (typeof value !== "string") {
    return null;
  }

  const role =
    value
      .trim()
      .toLowerCase();

  if (
    !VALID_ROLES.includes(
      role as AdminRole,
    )
  ) {
    return null;
  }

  return role as AdminRole;
}

function getLastName(
  fullName: string,
): string {
  const parts =
    fullName
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (parts.length === 0) {
    return "";
  }

  return parts[
    parts.length - 1
  ];
}

function buildTemporaryPassword(
  fullName: string,
): string {
  const lastName =
    getLastName(fullName);

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

function getRoleLabel(
  role: AdminRole,
): string {
  const labels: Record<
    AdminRole,
    string
  > = {
    super_admin:
      "Super Admin",

    operations_admin:
      "Operations Admin",

    support_admin:
      "Support Admin",

    finance_admin:
      "Finance Admin",

    compliance_admin:
      "Compliance Admin",

    read_only_admin:
      "Read Only Admin",
  };

  return labels[role];
}

function escapeHtml(
  value: string,
): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Creates the Brevo SMTP transport.
 *
 * Brevo SMTP:
 *   Host: smtp-relay.brevo.com
 *   Port: 587
 *   Encryption: STARTTLS
 *
 * BREVO_SMTP_PASSWORD must contain the
 * Brevo SMTP key, NOT a Brevo API key.
 */
function createBrevoTransport() {
  const smtpHost =
    Deno.env
      .get("BREVO_SMTP_HOST")
      ?.trim() ||
    "smtp-relay.brevo.com";

  const smtpPortRaw =
    Deno.env
      .get("BREVO_SMTP_PORT")
      ?.trim() ||
    "587";

  const smtpPort =
    Number(smtpPortRaw);

  const smtpUser =
    Deno.env
      .get("BREVO_SMTP_USER")
      ?.trim() ||
    "";

  const smtpPassword =
    Deno.env
      .get("BREVO_SMTP_PASSWORD")
      ?.trim() ||
    "";

  if (!smtpHost) {
    throw new Error(
      "Brevo SMTP host is not configured.",
    );
  }

  if (
    !Number.isInteger(smtpPort) ||
    smtpPort <= 0
  ) {
    throw new Error(
      "Brevo SMTP port is invalid.",
    );
  }

  if (!smtpUser) {
    throw new Error(
      "Brevo SMTP username is not configured.",
    );
  }

  if (!smtpPassword) {
    throw new Error(
      "Brevo SMTP password/key is not configured.",
    );
  }

  return nodemailer.createTransport({
    host: smtpHost,

    port: smtpPort,

    /*
     * Port 587 uses STARTTLS.
     * Therefore secure must be false.
     */
    secure: false,

    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },

    /*
     * Upgrade the connection to TLS.
     */
    requireTLS: true,

    connectionTimeout: 15000,

    greetingTimeout: 15000,

    socketTimeout: 30000,
  });
}

async function sendBrevoEmail(
  params: {
    recipientEmail: string;
    recipientName: string;
    temporaryPassword: string;
    role: AdminRole;
    adminPortalUrl: string;
  },
): Promise<void> {
  const fromEmail =
    Deno.env
      .get("BREVO_FROM_EMAIL")
      ?.trim() ||
    "";

  const fromName =
    Deno.env
      .get("BREVO_FROM_NAME")
      ?.trim() ||
    "IyanjuPay";

  const portalUrl =
    params.adminPortalUrl?.trim() ||
    Deno.env
      .get("ADMIN_PORTAL_URL")
      ?.trim() ||
    "https://iyanjupay.vercel.app/admin/login";

  if (!fromEmail) {
    throw new Error(
      "Brevo sender email is not configured.",
    );
  }

  if (!portalUrl) {
    throw new Error(
      "Admin portal URL is not configured.",
    );
  }

  const transport =
    createBrevoTransport();

  const recipientName =
    escapeHtml(
      params.recipientName,
    );

  const recipientEmail =
    escapeHtml(
      params.recipientEmail,
    );

  const temporaryPassword =
    escapeHtml(
      params.temporaryPassword,
    );

  const roleLabel =
    escapeHtml(
      getRoleLabel(
        params.role,
      ),
    );

  const safePortalUrl =
    escapeHtml(
      portalUrl,
    );

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <title>
    IyanjuPay Administrator Account
  </title>
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

    <div style="
      padding:32px;
    ">

      <h2 style="
        margin:0 0 16px;
        font-size:22px;
      ">
        Welcome,
        ${recipientName}
      </h2>

      <p style="
        font-size:15px;
        line-height:1.6;
        color:#475569;
      ">
        A new IyanjuPay administrator
        account has been created for you.
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
          ${roleLabel}
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
          ${recipientEmail}
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
          ${temporaryPassword}
        </div>

      </div>

      <p style="
        font-size:14px;
        line-height:1.6;
        color:#475569;
      ">
        Please sign in through the
        administrator portal using the
        email address and temporary password
        provided above.
      </p>

      <div style="
        margin:24px 0;
        text-align:center;
      ">

        <a
          href="${safePortalUrl}"
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

          <strong>
            Security notice:
          </strong>

          This is a temporary password.
          You will be required to change it
          after your first administrator login.
          Do not share your administrator
          credentials with anyone.

        </p>

      </div>

      <p style="
        margin-top:30px;
        font-size:12px;
        line-height:1.5;
        color:#94a3b8;
      ">

        If you were not expecting this
        administrator account, please contact
        the IyanjuPay administration team
        immediately.

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
        © ${new Date().getFullYear()}
        IyanjuPay.
        All rights reserved.
      </p>

    </div>

  </div>

</body>
</html>
  `;

  const textContent = `
IyanjuPay Administrator Portal

Welcome, ${params.recipientName}

A new IyanjuPay administrator account has been created for you.

Administrator Role:
${getRoleLabel(params.role)}

Email:
${params.recipientEmail}

Temporary Password:
${params.temporaryPassword}

Admin Portal:
${portalUrl}

This is a temporary password. You will be required to change it after your first administrator login.

Do not share your administrator credentials with anyone.

If you were not expecting this administrator account, please contact the IyanjuPay administration team immediately.
  `.trim();

  try {
    /*
     * Verify the SMTP connection before attempting
     * to send the actual message.
     *
     * This gives us a useful authentication/
     * connection error in the Edge Function logs.
     */
    await transport.verify();

    await new Promise<void>(
      (resolve, reject) => {
        transport.sendMail(
          {
            from: {
              name: fromName,
              address: fromEmail,
            },

            to: [
              {
                name:
                  params.recipientName,
                address:
                  params.recipientEmail,
              },
            ],

            subject:
              "Your IyanjuPay Administrator Account",

            text:
              textContent,

            html:
              htmlContent,
          },

          (error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          },
        );
      },
    );
  } catch (error) {
    console.error(
      "Brevo SMTP email failed:",
      {
        name:
          error instanceof Error
            ? error.name
            : undefined,

        message:
          error instanceof Error
            ? error.message
            : String(error),

        stack:
          error instanceof Error
            ? error.stack
            : undefined,
      },
    );

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    /*
     * Do not expose SMTP credentials or
     * unnecessary provider internals to
     * the browser.
     */
    if (
      /535|authentication|auth|invalid credentials|username|password/i.test(
        message,
      )
    ) {
      throw new Error(
        "The administrator account was created, but Brevo SMTP authentication failed. Please verify the Brevo SMTP login and SMTP key.",
      );
    }

    if (
      /connect|connection|timeout|socket|network|tls|certificate/i.test(
        message,
      )
    ) {
      throw new Error(
        "The administrator account was created, but the application could not connect to Brevo SMTP.",
      );
    }

    throw new Error(
      "The administrator account was created, but the credential email could not be sent.",
    );
  } finally {
    try {
      transport.close();
    } catch {
      // Ignore transport cleanup errors.
    }
  }
}

async function findAuthUserByEmail(
  adminClient: ReturnType<
    typeof createClient
  >,
  email: string,
): Promise<{
  id: string;
  email: string | null;
} | null> {
  let page = 1;

  const perPage = 1000;

  while (true) {
    const {
      data,
      error,
    } =
      await adminClient
        .auth
        .admin
        .listUsers({
          page,
          perPage,
        });

    if (error) {
      throw new Error(
        "Unable to verify whether the email address already exists.",
      );
    }

    const users =
      data?.users || [];

    const matchingUser =
      users.find(
        (authUser) =>
          authUser.email
            ?.trim()
            .toLowerCase() ===
          email,
      );

    if (matchingUser) {
      return {
        id:
          matchingUser.id,

        email:
          matchingUser.email ??
          null,
      };
    }

    if (
      users.length <
      perPage
    ) {
      break;
    }

    page += 1;
  }

  return null;
}

Deno.serve(
  async (req) => {
    if (
      req.method ===
      "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          headers:
            corsHeaders,
        },
      );
    }

    if (
      req.method !==
      "POST"
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Method not allowed.",
        },
        405,
      );
    }

    const supabaseUrl =
      Deno.env
        .get(
          "SUPABASE_URL",
        )
        ?.trim() || "";

    const serviceRoleKey =
      Deno.env
        .get(
          "SUPABASE_SERVICE_ROLE_KEY",
        )
        ?.trim() || "";

    const anonKey =
      Deno.env
        .get(
          "SUPABASE_ANON_KEY",
        )
        ?.trim() || "";

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
      req.headers.get(
        "Authorization",
      );

    if (
      !authorization
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Unauthorized.",
        },
        401,
      );
    }

    try {
      /*
       * Caller-scoped client.
       *
       * This client carries the actual
       * administrator JWT.
       */
      const userClient =
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

            auth: {
              autoRefreshToken:
                false,

              persistSession:
                false,
            },
          },
        );

      const {
        data: {
          user,
        },
        error:
          userError,
      } =
        await userClient.auth.getUser();

      if (
        userError ||
        !user
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "Unauthorized.",
          },
          401,
        );
      }

      /*
       * Service-role client.
       *
       * Used only for trusted server-side
       * database/Auth administration.
       */
      const adminClient =
        createClient(
          supabaseUrl,
          serviceRoleKey,
          {
            auth: {
              autoRefreshToken:
                false,

              persistSession:
                false,
            },
          },
        );

      /*
       * Verify that the authenticated caller
       * is an active Super Admin.
       */
      const {
        data:
          callerAdmin,
        error:
          callerAdminError,
      } =
        await adminClient
          .from(
            "support_admins",
          )
          .select(
            "user_id, role, is_active",
          )
          .eq(
            "user_id",
            user.id,
          )
          .maybeSingle();

      if (
        callerAdminError
      ) {
        console.error(
          "Caller administrator lookup failed:",
          callerAdminError,
        );

        return jsonResponse(
          {
            success: false,
            error:
              "Unable to verify administrator permissions.",
          },
          500,
        );
      }

      if (
        !callerAdmin ||
        callerAdmin.role !==
          "super_admin" ||
        callerAdmin.is_active !==
          true
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

      /*
       * Parse request body.
       */
      let body:
        JsonRecord;

      try {
        body =
          await req.json();
      } catch {
        return jsonResponse(
          {
            success: false,
            error:
              "Invalid JSON request body.",
          },
          400,
        );
      }

      const fullName =
        normalizeName(
          body.full_name,
        );

      const email =
        normalizeEmail(
          body.email,
        );

      const role =
        normalizeRole(
          body.role,
        );

      const displayName =
        normalizeName(
          body.display_name,
        ) ||
        fullName;

      const notes =
        typeof body.notes ===
        "string"
          ? body.notes.trim()
          : null;

      /*
       * Validate full name.
       */
      if (!fullName) {
        return jsonResponse(
          {
            success: false,
            error:
              "Full name is required.",
          },
          400,
        );
      }

      if (
        fullName.length <
        2
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "Please provide the administrator's full name.",
          },
          400,
        );
      }

      /*
       * Validate email.
       */
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
        !emailPattern.test(
          email,
        )
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "Please provide a valid email address.",
          },
          400,
        );
      }

      /*
       * Validate role.
       */
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
       * Prevent a Super Admin from creating
       * another account using their own email.
       */
      if (
        user.email
          ?.trim()
          .toLowerCase() ===
        email
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "The current administrator already has an account.",
          },
          409,
        );
      }

      /*
       * Find an existing Supabase Auth user.
       */
      let existingAuthUser:
        {
          id: string;
          email:
            | string
            | null;
        } | null = null;

      try {
        existingAuthUser =
          await findAuthUserByEmail(
            adminClient,
            email,
          );
      } catch (
        lookupError
      ) {
        console.error(
          "Existing Auth user lookup failed:",
          lookupError,
        );

        return jsonResponse(
          {
            success: false,
            error:
              lookupError instanceof
              Error
                ? lookupError.message
                : "Unable to verify whether the email address already exists.",
          },
          500,
        );
      }

      /*
       * Existing email = conflict.
       */
      if (
        existingAuthUser
      ) {
        const {
          data:
            existingAdmin,
          error:
            existingAdminError,
        } =
          await adminClient
            .from(
              "support_admins",
            )
            .select(
              "user_id, role, is_active",
            )
            .eq(
              "user_id",
              existingAuthUser.id,
            )
            .maybeSingle();

        if (
          existingAdminError
        ) {
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

        if (
          existingAdmin
        ) {
          return jsonResponse(
            {
              success: false,
              error:
                "This email address already belongs to an administrator.",
              code:
                "ADMIN_EMAIL_ALREADY_EXISTS",
            },
            409,
          );
        }

        return jsonResponse(
          {
            success: false,
            error:
              "An account with this email address already exists. Administrator creation requires a new email address.",
            code:
              "AUTH_EMAIL_ALREADY_EXISTS",
          },
          409,
        );
      }

      /*
       * Generate the temporary password.
       */
      const temporaryPassword =
        buildTemporaryPassword(
          fullName,
        );

      /*
       * Create the Supabase Auth user.
       */
      const {
        data:
          createdUser,
        error:
          createUserError,
      } =
        await adminClient
          .auth
          .admin
          .createUser({
            email,

            password:
              temporaryPassword,

            email_confirm:
              true,

            user_metadata: {
              full_name:
                fullName,

              display_name:
                displayName,

              account_type:
                "admin",

              admin_role:
                role,

              must_change_password:
                true,

              created_by_admin_id:
                user.id,
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

        const createErrorMessage =
          createUserError?.message ||
          "";

        const duplicateEmail =
          /already registered|already exists|email.*exist|user.*exist/i.test(
            createErrorMessage,
          );

        return jsonResponse(
          {
            success: false,

            error:
              duplicateEmail
                ? "An account with this email address already exists. Administrator creation requires a new email address."
                : createErrorMessage ||
                  "Failed to create the administrator account.",

            code:
              duplicateEmail
                ? "AUTH_EMAIL_ALREADY_EXISTS"
                : "ADMIN_AUTH_CREATE_FAILED",
          },

          duplicateEmail
            ? 409
            : 400,
        );
      }

      const newAdminId =
        createdUser.user.id;

      /*
       * Create support_admins record.
       */
      const {
        error:
          adminInsertError,
      } =
        await adminClient
          .from(
            "support_admins",
          )
          .insert({
            user_id:
              newAdminId,

            role,

            is_active:
              true,

            created_by:
              user.id,
          });

      if (
        adminInsertError
      ) {
        console.error(
          "support_admins insert failed:",
          adminInsertError,
        );

        await adminClient.auth.admin.deleteUser(
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
        error:
          metadataError,
      } =
        await adminClient
          .from(
            "admin_management_metadata",
          )
          .insert({
            admin_user_id:
              newAdminId,

            display_name:
              displayName ||
              fullName,

            notes,

            last_activity_at:
              null,

            must_change_password:
              true,
          });

      if (
        metadataError
      ) {
        console.error(
          "Admin metadata insert failed:",
          metadataError,
        );

        await adminClient
          .from(
            "support_admins",
          )
          .delete()
          .eq(
            "user_id",
            newAdminId,
          );

        await adminClient.auth.admin.deleteUser(
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
       * Send administrator credentials through
       * Brevo SMTP.
       */
      const adminPortalUrl =
        Deno.env
          .get(
            "ADMIN_PORTAL_URL",
          )
          ?.trim() ||
        "https://iyanjupay.vercel.app/admin/login";

      try {
        await sendBrevoEmail({
          recipientEmail:
            email,

          recipientName:
            fullName,

          temporaryPassword,

          role,

          adminPortalUrl,
        });
      } catch (
        emailError
      ) {
        console.error(
          "Administrator credential email failed:",
          emailError,
        );

        /*
         * Roll back the entire administrator
         * provisioning because the credentials
         * were not delivered.
         */
        await adminClient
          .from(
            "admin_management_metadata",
          )
          .delete()
          .eq(
            "admin_user_id",
            newAdminId,
          );

        await adminClient
          .from(
            "support_admins",
          )
          .delete()
          .eq(
            "user_id",
            newAdminId,
          );

        await adminClient.auth.admin.deleteUser(
          newAdminId,
        );

        return jsonResponse(
          {
            success: false,

            error:
              emailError instanceof
              Error
                ? emailError.message
                : "Failed to send administrator credentials.",

            code:
              "ADMIN_CREDENTIAL_EMAIL_FAILED",
          },
          502,
        );
      }

      /*
       * Fetch acting administrator information
       * for the audit record.
       */
      const {
        data:
          actingProfile,
      } =
        await adminClient
          .from(
            "profiles",
          )
          .select(
            "full_name, email",
          )
          .eq(
            "id",
            user.id,
          )
          .maybeSingle();

      /*
       * Write audit log.
       *
       * Failure here does NOT roll back an account
       * whose credentials have already been delivered.
       */
      const {
        error:
          auditError,
      } =
        await adminClient
          .from(
            "admin_audit_logs",
          )
          .insert({
            admin_user_id:
              user.id,

            admin_email:
              actingProfile?.email ||
              user.email ||
              null,

            admin_name:
              actingProfile?.full_name ||
              user.user_metadata
                ?.full_name ||
              null,

            admin_role:
              callerAdmin.role,

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
              user_id:
                newAdminId,

              email,

              full_name:
                fullName,

              role,

              is_active:
                true,

              must_change_password:
                true,
            },

            metadata: {
              source:
                "admin-create-account",

              created_by:
                user.id,

              credential_delivery:
                "brevo_smtp",
            },
          });

      if (
        auditError
      ) {
        console.error(
          "Administrator audit log failed:",
          auditError,
        );
      }

      /*
       * Never return the temporary password.
       */
      return jsonResponse({
        success:
          true,

        admin: {
          user_id:
            newAdminId,

          email,

          full_name:
            fullName,

          role,

          is_active:
            true,

          must_change_password:
            true,
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
            error instanceof
            Error
              ? error.message
              : "An unexpected error occurred while creating the administrator account.",
        },
        500,
      );
    }
  },
);

