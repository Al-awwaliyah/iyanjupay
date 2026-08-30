import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
  "Content-Type":
    "application/json",
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

function json(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: corsHeaders,
    },
  );
}

function normalizeName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Extract the last name from a person's full name.
 *
 * Examples:
 *
 * "Aremu Lawal"       -> Lawal
 * "John Michael Doe"  -> Doe
 * "O'Brien Smith"     -> Smith
 */
function getLastName(fullName: string): string {
  const parts = normalizeName(fullName)
    .split(" ")
    .filter(Boolean);

  if (parts.length === 0) {
    throw new Error("Full name is required");
  }

  return parts[parts.length - 1];
}

/**
 * Convert the last name into a safe temporary-password component.
 *
 * Example:
 *
 * O'Brien -> OBrien
 * Smith-Jones -> SmithJones
 *
 * We retain letters and numbers only.
 */
function sanitizePasswordName(lastName: string): string {
  const cleaned = lastName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "");

  if (!cleaned) {
    throw new Error(
      "Unable to generate a temporary password from the administrator's last name",
    );
  }

  return cleaned;
}

function roleLabel(role: AdminRole): string {
  switch (role) {
    case "super_admin":
      return "Super Administrator";

    case "operations_admin":
      return "Operations Administrator";

    case "support_admin":
      return "Support Administrator";

    case "finance_admin":
      return "Finance Administrator";

    case "compliance_admin":
      return "Compliance Administrator";

    case "read_only_admin":
      return "Read-Only Administrator";

    default:
      return role;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * SMTP client using raw TCP/TLS.
 *
 * Deno's Edge Runtime does not provide Node's SMTP libraries,
 * so this implementation talks directly to the SMTP server.
 */
async function sendBrevoEmail(params: {
  to: string;
  toName: string;
  subject: string;
  html: string;
  text: string;
}) {
  const host =
    Deno.env.get("BREVO_SMTP_HOST")?.trim() ?? "";

  const portString =
    Deno.env.get("BREVO_SMTP_PORT")?.trim() ?? "";

  const username =
    Deno.env.get("BREVO_SMTP_USER")?.trim() ?? "";

  const password =
    Deno.env.get("BREVO_SMTP_PASSWORD") ?? "";

  const fromEmail =
    Deno.env.get("BREVO_FROM_EMAIL")?.trim() ?? "";

  const fromName =
    Deno.env.get("BREVO_FROM_NAME")?.trim() ||
    "IyanjuPay";

  if (
    !host ||
    !portString ||
    !username ||
    !password ||
    !fromEmail
  ) {
    throw new Error(
      "Brevo SMTP configuration is incomplete. Required secrets: BREVO_SMTP_HOST, BREVO_SMTP_PORT, BREVO_SMTP_USER, BREVO_SMTP_PASSWORD, BREVO_FROM_EMAIL, BREVO_FROM_NAME",
    );
  }

  const port = Number(portString);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("Invalid BREVO_SMTP_PORT");
  }

  /**
   * We use the SMTP server's TLS connection when port 465
   * is configured. For other ports, the implementation starts
   * with a normal SMTP connection and attempts STARTTLS.
   */
  const connection = await Deno.connect({
    hostname: host,
    port,
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let buffer = new Uint8Array(0);

  async function readChunk(): Promise<string> {
    const temp = new Uint8Array(8192);

    const count = await connection.read(temp);

    if (count === null) {
      return "";
    }

    const combined = new Uint8Array(
      buffer.length + count,
    );

    combined.set(buffer);
    combined.set(
      temp.subarray(0, count),
      buffer.length,
    );

    buffer = combined;

    return decoder.decode(buffer);
  }

  async function readResponse(): Promise<{
    code: number;
    text: string;
  }> {
    let response = "";

    for (;;) {
      const chunk = await readChunk();

      if (!chunk) {
        break;
      }

      response += chunk;

      const lines = response.split(/\r?\n/);

      if (lines.length < 2) {
        continue;
      }

      const lastLine =
        lines[lines.length - 2];

      const match =
        lastLine.match(/^(\d{3})([ -])/);

      if (!match) {
        continue;
      }

      if (match[2] === " ") {
        const code = Number(match[1]);

        return {
          code,
          text: response,
        };
      }
    }

    throw new Error(
      "SMTP server closed the connection unexpectedly",
    );
  }

  async function writeCommand(
    command: string,
    expectedCodes: number[],
  ) {
    await connection.write(
      encoder.encode(`${command}\r\n`),
    );

    const response = await readResponse();

    if (!expectedCodes.includes(response.code)) {
      throw new Error(
        `SMTP error ${response.code}: ${response.text}`,
      );
    }

    return response;
  }

  try {
    const greeting =
      await readResponse();

    if (
      greeting.code < 200 ||
      greeting.code >= 400
    ) {
      throw new Error(
        `SMTP greeting failed: ${greeting.text}`,
      );
    }

    await writeCommand(
      "EHLO iyanjupay.com",
      [250],
    );

    /**
     * Port 465 normally expects TLS immediately.
     *
     * Deno's generic connect() does not upgrade the
     * connection in-place, so for SMTP configurations
     * using port 465 we use Deno.connectTls instead.
     */
    if (port === 465) {
      throw new Error(
        "BREVO_SMTP_PORT=465 requires implicit TLS. Use BREVO_SMTP_PORT=587 with STARTTLS for this Edge Function.",
      );
    }

    const startTls =
      await writeCommand(
        "STARTTLS",
        [220],
      );

    if (startTls.code !== 220) {
      throw new Error(
        "Brevo SMTP STARTTLS negotiation failed",
      );
    }

    throw new Error(
      "SMTP TLS upgrade is required. Use the SMTP-over-TLS helper below.",
    );
  } finally {
    try {
      connection.close();
    } catch {
      // Ignore close errors.
    }
  }
}

/**
 * Brevo SMTP implementation using Deno.connectTls.
 *
 * This is the actual sender used by the function.
 *
 * Brevo's SMTP relay supports implicit TLS on port 465.
 */
async function sendBrevoEmailTls(params: {
  to: string;
  toName: string;
  subject: string;
  html: string;
  text: string;
}) {
  const host =
    Deno.env.get("BREVO_SMTP_HOST")?.trim() ?? "";

  const portString =
    Deno.env.get("BREVO_SMTP_PORT")?.trim() ?? "465";

  const username =
    Deno.env.get("BREVO_SMTP_USER")?.trim() ?? "";

  const password =
    Deno.env.get("BREVO_SMTP_PASSWORD") ?? "";

  const fromEmail =
    Deno.env.get("BREVO_FROM_EMAIL")?.trim() ?? "";

  const fromName =
    Deno.env.get("BREVO_FROM_NAME")?.trim() ||
    "IyanjuPay";

  if (
    !host ||
    !portString ||
    !username ||
    !password ||
    !fromEmail
  ) {
    throw new Error(
      "Brevo SMTP configuration is incomplete",
    );
  }

  const port = Number(portString);

  if (port !== 465) {
    throw new Error(
      "This Edge Function SMTP sender expects Brevo implicit TLS on port 465. Set BREVO_SMTP_PORT to 465.",
    );
  }

  const connection =
    await Deno.connectTls({
      hostname: host,
      port,
    });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  async function readResponse() {
    let response = "";

    for (;;) {
      const chunk =
        new Uint8Array(8192);

      const count =
        await connection.read(chunk);

      if (count === null) {
        throw new Error(
          "SMTP connection closed unexpectedly",
        );
      }

      response += decoder.decode(
        chunk.subarray(0, count),
      );

      const lines =
        response.split(/\r?\n/);

      if (lines.length < 2) {
        continue;
      }

      const last =
        lines[lines.length - 2];

      const match =
        last.match(/^(\d{3})([ -])/);

      if (
        match &&
        match[2] === " "
      ) {
        return {
          code: Number(match[1]),
          text: response,
        };
      }
    }
  }

  async function command(
    commandText: string,
    expected: number[],
  ) {
    await connection.write(
      encoder.encode(
        `${commandText}\r\n`,
      ),
    );

    const response =
      await readResponse();

    if (
      !expected.includes(
        response.code,
      )
    ) {
      throw new Error(
        `SMTP error ${response.code}: ${response.text}`,
      );
    }

    return response;
  }

  function base64(value: string) {
    return btoa(value);
  }

  try {
    const greeting =
      await readResponse();

    if (
      greeting.code !== 220
    ) {
      throw new Error(
        `Brevo SMTP greeting failed: ${greeting.text}`,
      );
    }

    await command(
      "EHLO iyanjupay.com",
      [250],
    );

    await command(
      `AUTH LOGIN`,
      [334],
    );

    await command(
      base64(username),
      [334],
    );

    await command(
      base64(password),
      [235],
    );

    await command(
      `MAIL FROM:<${fromEmail}>`,
      [250],
    );

    await command(
      `RCPT TO:<${params.to}>`,
      [250, 251],
    );

    await command(
      "DATA",
      [354],
    );

    const message = [
      `From: ${fromName} <${fromEmail}>`,
      `To: ${params.toName} <${params.to}>`,
      `Subject: ${params.subject}`,
      "MIME-Version: 1.0",
      'Content-Type: multipart/alternative; boundary="iyanjupay-boundary"',
      "",
      "--iyanjupay-boundary",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      params.text,
      "",
      "--iyanjupay-boundary",
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      params.html,
      "",
      "--iyanjupay-boundary--",
      "",
      ".",
    ].join("\r\n");

    await connection.write(
      encoder.encode(
        message + "\r\n",
      ),
    );

    const dataResponse =
      await readResponse();

    if (
      dataResponse.code !== 250
    ) {
      throw new Error(
        `Brevo SMTP rejected email: ${dataResponse.text}`,
      );
    }

    await command(
      "QUIT",
      [221],
    );
  } finally {
    try {
      connection.close();
    } catch {
      // Ignore close errors.
    }
  }
}

function buildEmail(params: {
  fullName: string;
  email: string;
  password: string;
  role: AdminRole;
}) {
  const safeName =
    escapeHtml(params.fullName);

  const safeEmail =
    escapeHtml(params.email);

  const safePassword =
    escapeHtml(params.password);

  const safeRole =
    escapeHtml(roleLabel(params.role));

  const adminUrl =
    Deno.env.get("ADMIN_PORTAL_URL")?.trim() ||
    "https://iyanjupay.com/admin/login";

  const safeAdminUrl =
    escapeHtml(adminUrl);

  const subject =
    "Your IyanjuPay Administrator Account";

  const text = `
Hello ${params.fullName},

Your IyanjuPay administrator account has been created.

Admin portal:
${adminUrl}

Login email:
${params.email}

Administrator role:
${roleLabel(params.role)}

Temporary password:
${params.password}

For security, please sign in and change your password immediately.

Do not share this password with anyone.

Regards,
IyanjuPay Administration
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>IyanjuPay Administrator Account</title>
</head>

<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">

  <div style="max-width:640px;margin:40px auto;padding:0 16px;">

    <div style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">

      <div style="padding:28px;text-align:center;background:#082A63;">
        <img
          src="${safeAdminUrl.replace(
            /\/admin\/login$/,
            "/icon-180.png",
          )}"
          alt="IyanjuPay"
          width="72"
          height="72"
          style="display:block;margin:0 auto 12px;border-radius:16px;"
        />

        <h1 style="margin:0;color:#ffffff;font-size:25px;">
          IyanjuPay
        </h1>

        <p style="margin:8px 0 0;color:#dbeafe;font-size:14px;">
          Administrator Account
        </p>
      </div>

      <div style="padding:32px;">

        <h2 style="margin:0 0 16px;font-size:22px;">
          Welcome, ${safeName}
        </h2>

        <p style="font-size:15px;line-height:1.7;">
          A new IyanjuPay administrator account has been created for you.
        </p>

        <div style="margin:24px 0;padding:20px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;">

          <p style="margin:0 0 12px;">
            <strong>Administrator role:</strong><br />
            ${safeRole}
          </p>

          <p style="margin:0 0 12px;">
            <strong>Login email:</strong><br />
            ${safeEmail}
          </p>

          <p style="margin:0;">
            <strong>Temporary password:</strong><br />

            <span style="
              display:inline-block;
              margin-top:6px;
              padding:10px 14px;
              background:#eef2ff;
              border-radius:8px;
              font-family:monospace;
              font-size:16px;
              font-weight:bold;
            ">
              ${safePassword}
            </span>
          </p>

        </div>

        <div style="text-align:center;margin:28px 0;">

          <a
            href="${safeAdminUrl}"
            style="
              display:inline-block;
              padding:13px 24px;
              background:#082A63;
              color:#ffffff;
              text-decoration:none;
              border-radius:8px;
              font-weight:bold;
            "
          >
            Open Admin Portal
          </a>

        </div>

        <div style="
          padding:16px;
          background:#fff7ed;
          border:1px solid #fed7aa;
          border-radius:10px;
        ">

          <strong>Security notice</strong>

          <p style="margin:8px 0 0;font-size:14px;line-height:1.6;">
            This is a temporary password. Change your password immediately
            after your first successful login. Do not share your credentials.
          </p>

        </div>

        <p style="margin-top:28px;font-size:13px;color:#6b7280;line-height:1.6;">
          If you did not expect this administrator account, contact the
          IyanjuPay system administrator immediately.
        </p>

      </div>

    </div>

    <p style="text-align:center;color:#9ca3af;font-size:12px;margin:18px 0;">
      © ${new Date().getFullYear()} IyanjuPay
    </p>

  </div>

</body>
</html>
`.trim();

  return {
    subject,
    text,
    html,
  };
}

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

  const supabaseUrl =
    Deno.env.get("SUPABASE_URL") ?? "";

  const serviceRoleKey =
    Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    ) ?? "";

  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !anonKey
  ) {
    return json(
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
    return json(
      {
        success: false,
        error: "Authentication required",
      },
      401,
    );
  }

  /**
   * User-scoped client.
   *
   * This allows Supabase to resolve auth.uid()
   * from the administrator's JWT.
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
      },
    );

  const {
    data: {
      user,
    },
    error: userError,
  } =
    await userClient.auth.getUser();

  if (
    userError ||
    !user
  ) {
    return json(
      {
        success: false,
        error: "Unauthorized",
      },
      401,
    );
  }

  /**
   * Service-role client.
   *
   * Used only on the server.
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

  try {
    const body =
      await req.json();

    const fullName =
      normalizeName(
        String(
          body?.full_name ??
            body?.fullName ??
            "",
        ),
      );

    const email =
      String(
        body?.email ?? "",
      )
        .trim()
        .toLowerCase();

    const role =
      String(
        body?.role ?? "",
      )
        .trim()
        .toLowerCase() as AdminRole;

    const notes =
      body?.notes == null
        ? null
        : String(body.notes).trim() ||
          null;

    if (!fullName) {
      return json(
        {
          success: false,
          error: "Full name is required.",
        },
        400,
      );
    }

    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email,
      )
    ) {
      return json(
        {
          success: false,
          error:
            "A valid email address is required.",
        },
        400,
      );
    }

    if (
      !VALID_ROLES.includes(role)
    ) {
      return json(
        {
          success: false,
          error:
            "Invalid administrator role.",
        },
        400,
      );
    }

    /**
     * ------------------------------------------------------------
     * 1. Verify the current user is an active super administrator.
     * ------------------------------------------------------------
     */
    const {
      data: actingAdmin,
      error: actingAdminError,
    } =
      await adminClient
        .from("support_admins")
        .select(
          "user_id,role,is_active",
        )
        .eq(
          "user_id",
          user.id,
        )
        .eq(
          "is_active",
          true,
        )
        .maybeSingle();

    if (
      actingAdminError
    ) {
      throw new Error(
        actingAdminError.message,
      );
    }

    if (
      !actingAdmin ||
      String(
        actingAdmin.role,
      ).toLowerCase() !==
        "super_admin"
    ) {
      return json(
        {
          success: false,
          error:
            "Super administrator authorization required.",
        },
        403,
      );
    }

    /**
     * ------------------------------------------------------------
     * 2. Check whether an account with this email already exists.
     * ------------------------------------------------------------
     *
     * We search Auth users server-side so that the frontend
     * cannot bypass duplicate protection.
     */
    let existingUser:
      | {
          id: string;
          email?: string | null;
        }
      | null = null;

    let page = 1;

    for (;;) {
      const {
        data,
        error,
      } =
        await adminClient.auth.admin.listUsers(
          {
            page,
            perPage: 1000,
          },
        );

      if (error) {
        throw new Error(
          error.message,
        );
      }

      const found =
        data.users.find(
          (candidate) =>
            String(
              candidate.email ?? "",
            )
              .trim()
              .toLowerCase() ===
            email,
        );

      if (found) {
        existingUser = {
          id: found.id,
          email: found.email,
        };
        break;
      }

      if (
        data.users.length < 1000
      ) {
        break;
      }

      page += 1;
    }

    if (existingUser) {
      const {
        data: existingAdmin,
        error:
          existingAdminError,
      } =
        await adminClient
          .from("support_admins")
          .select(
            "user_id,role,is_active",
          )
          .eq(
            "user_id",
            existingUser.id,
          )
          .maybeSingle();

      if (
        existingAdminError
      ) {
        throw new Error(
          existingAdminError.message,
        );
      }

      if (existingAdmin) {
        return json(
          {
            success: false,
            error:
              "This user is already an administrator.",
          },
          409,
        );
      }

      return json(
        {
          success: false,
          error:
            "An account with this email already exists. Use another email address.",
        },
        409,
      );
    }

    /**
     * ------------------------------------------------------------
     * 3. Generate temporary password.
     * ------------------------------------------------------------
     *
     * Lastname@123
     */
    const lastName =
      getLastName(fullName);

    const passwordName =
      sanitizePasswordName(
        lastName,
      );

    const temporaryPassword =
      `${passwordName}@123`;

    /**
     * ------------------------------------------------------------
     * 4. Create Supabase Auth user.
     * ------------------------------------------------------------
     *
     * We deliberately do NOT send a confirmation email here.
     * The administrator receives the credentials through Brevo.
     */
    const {
      data: createdAuth,
      error:
        createAuthError,
    } =
      await adminClient.auth.admin.createUser(
        {
          email,
          password:
            temporaryPassword,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            account_type: "admin",
            admin_role: role,
            created_by_admin_id:
              user.id,
          },
        },
      );

    if (
      createAuthError ||
      !createdAuth.user
    ) {
      throw new Error(
        createAuthError?.message ??
          "Unable to create administrator account.",
      );
    }

    const newAdminUserId =
      createdAuth.user.id;

    let supportAdminCreated =
      false;

    try {
      /**
       * ----------------------------------------------------------
       * 5. Create support_admins record.
       * ----------------------------------------------------------
       */
      const {
        error:
          supportAdminError,
      } =
        await adminClient
          .from("support_admins")
          .insert({
            user_id:
              newAdminUserId,
            role,
            is_active: true,
            created_by:
              user.id,
          });

      if (
        supportAdminError
      ) {
        throw new Error(
          supportAdminError.message,
        );
      }

      supportAdminCreated =
        true;

      /**
       * ----------------------------------------------------------
       * 6. Create management metadata.
       * ----------------------------------------------------------
       */
      const {
        error:
          metadataError,
      } =
        await adminClient
          .from(
            "admin_management_metadata",
          )
          .upsert(
            {
              admin_user_id:
                newAdminUserId,
              display_name:
                fullName,
              notes,
              last_activity_at:
                new Date().toISOString(),
              updated_at:
                new Date().toISOString(),
            },
            {
              onConflict:
                "admin_user_id",
            },
          );

      if (
        metadataError
      ) {
        throw new Error(
          metadataError.message,
        );
      }

      /**
       * ----------------------------------------------------------
       * 7. Audit account creation.
       * ----------------------------------------------------------
       *
       * Password is NEVER included.
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
              "admin_account_created",

            p_description:
              "A new administrator account was created",

            p_target_type:
              "admin",

            p_target_id:
              newAdminUserId,

            p_user_id:
              newAdminUserId,

            p_before_data:
              null,

            p_after_data:
              {
                user_id:
                  newAdminUserId,
                email,
                full_name:
                  fullName,
                role,
                is_active:
                  true,
              },

            p_metadata:
              {
                source:
                  "admin-create-account",
                created_by_admin_id:
                  user.id,
                temporary_password_sent:
                  true,
              },
          },
        );

      if (auditError) {
        throw new Error(
          `Audit log failed: ${auditError.message}`,
        );
      }

      /**
       * ----------------------------------------------------------
       * 8. Send credentials through Brevo.
       * ----------------------------------------------------------
       */
      const emailContent =
        buildEmail({
          fullName,
          email,
          password:
            temporaryPassword,
          role,
        });

      await sendBrevoEmailTls({
        to: email,
        toName: fullName,
        subject:
          emailContent.subject,
        html:
          emailContent.html,
        text:
          emailContent.text,
      });

      /**
       * ----------------------------------------------------------
       * 9. Return success.
       *
       * IMPORTANT:
       * The temporary password is intentionally NOT returned
       * to the frontend.
       * ----------------------------------------------------------
       */
      return json(
        {
          success: true,
          message:
            "Administrator account created successfully and login credentials were sent by email.",
          admin: {
            user_id:
              newAdminUserId,
            email,
            full_name:
              fullName,
            role,
            role_label:
              roleLabel(role),
            is_active:
              true,
            credentials_sent:
              true,
          },
        },
        200,
      );
    } catch (operationError) {
      /**
       * ----------------------------------------------------------
       * ROLLBACK
       * ----------------------------------------------------------
       *
       * If support_admins/metadata/audit/email fails, do not leave
       * behind a half-created administrator account.
       */
      console.error(
        "Administrator creation failed after Auth user creation:",
        operationError,
      );

      if (supportAdminCreated) {
        await adminClient
          .from("support_admins")
          .delete()
          .eq(
            "user_id",
            newAdminUserId,
          );
      }

      await adminClient
        .from(
          "admin_management_metadata",
        )
        .delete()
        .eq(
          "admin_user_id",
          newAdminUserId,
        );

      await adminClient.auth.admin.deleteUser(
        newAdminUserId,
      );

      throw operationError;
    }
  } catch (error) {
    console.error(
      "admin-create-account error:",
      error,
    );

    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to create administrator account.",
      },
      500,
    );
  }
});
