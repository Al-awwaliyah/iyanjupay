import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/smtp/mod.ts";

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

function cleanName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

function getLastName(fullName: string) {
  const parts = cleanName(fullName)
    .split(" ")
    .filter(Boolean);

  if (!parts.length) {
    throw new Error(
      "Full name is required",
    );
  }

  return parts[parts.length - 1];
}

function passwordName(lastName: string) {
  const result = lastName
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .replace(
      /[^a-zA-Z0-9]/g,
      "",
    );

  if (!result) {
    throw new Error(
      "Unable to generate temporary password.",
    );
  }

  return result;
}

function roleLabel(
  role: AdminRole,
) {
  const labels: Record<
    AdminRole,
    string
  > = {
    super_admin:
      "Super Administrator",
    operations_admin:
      "Operations Administrator",
    support_admin:
      "Support Administrator",
    finance_admin:
      "Finance Administrator",
    compliance_admin:
      "Compliance Administrator",
    read_only_admin:
      "Read-Only Administrator",
  };

  return labels[role];
}

function escapeHtml(
  value: string,
) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll(
      "'",
      "&#039;",
    );
}

async function sendBrevoEmail(params: {
  to: string;
  toName: string;
  fullName: string;
  password: string;
  role: AdminRole;
}) {
  const host =
    Deno.env.get(
      "BREVO_SMTP_HOST",
    ) ?? "";

  const port =
    Number(
      Deno.env.get(
        "BREVO_SMTP_PORT",
      ) ?? "587",
    );

  const username =
    Deno.env.get(
      "BREVO_SMTP_USER",
    ) ?? "";

  const password =
    Deno.env.get(
      "BREVO_SMTP_PASSWORD",
    ) ?? "";

  const fromEmail =
    Deno.env.get(
      "BREVO_FROM_EMAIL",
    ) ?? "";

  const fromName =
    Deno.env.get(
      "BREVO_FROM_NAME",
    ) ?? "IyanjuPay";

  if (
    !host ||
    !port ||
    !username ||
    !password ||
    !fromEmail
  ) {
    throw new Error(
      "Brevo SMTP secrets are not completely configured.",
    );
  }

  const adminPortalUrl =
    Deno.env.get(
      "ADMIN_PORTAL_URL",
    ) ??
    "https://iyanjupay.com/admin/login";

  const safeName =
    escapeHtml(
      params.fullName,
    );

  const safeEmail =
    escapeHtml(
      params.to,
    );

  const safePassword =
    escapeHtml(
      params.password,
    );

  const safeRole =
    escapeHtml(
      roleLabel(
        params.role,
      ),
    );

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>IyanjuPay Administrator Account</title>
</head>

<body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#1f2937;">

<div style="max-width:640px;margin:40px auto;padding:20px;">

<div style="
background:#ffffff;
border:1px solid #e5e7eb;
border-radius:16px;
overflow:hidden;
">

<div style="
background:#082A63;
padding:30px;
text-align:center;
">

<h1 style="
margin:0;
color:#ffffff;
font-size:28px;
">
IyanjuPay
</h1>

<p style="
margin:8px 0 0;
color:#dbeafe;
">
Administrator Account
</p>

</div>

<div style="padding:32px;">

<h2>
Welcome, ${safeName}
</h2>

<p>
Your IyanjuPay administrator account has been created.
</p>

<div style="
margin:24px 0;
padding:20px;
background:#f8fafc;
border:1px solid #e5e7eb;
border-radius:12px;
">

<p>
<strong>Administrator role</strong><br>
${safeRole}
</p>

<p>
<strong>Login email</strong><br>
${safeEmail}
</p>

<p>
<strong>Temporary password</strong><br>

<span style="
display:inline-block;
margin-top:6px;
padding:10px 14px;
background:#eef2ff;
border-radius:8px;
font-family:monospace;
font-weight:bold;
">
${safePassword}
</span>

</p>

</div>

<div style="
text-align:center;
margin:28px 0;
">

<a
href="${adminPortalUrl}"
style="
display:inline-block;
padding:14px 24px;
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
background:#fff7ed;
border:1px solid #fed7aa;
border-radius:10px;
padding:16px;
">

<strong>Security notice</strong>

<p style="margin-bottom:0;">
This is a temporary password. Change it immediately
after your first login. Do not share your credentials.
</p>

</div>

<p style="
margin-top:28px;
font-size:13px;
color:#6b7280;
">
If you did not expect this administrator account,
contact the IyanjuPay system administrator.
</p>

</div>

</div>

<p style="
text-align:center;
font-size:12px;
color:#9ca3af;
">
© ${new Date().getFullYear()} IyanjuPay
</p>

</div>

</body>
</html>
`.trim();

  const text = `
Hello ${params.fullName},

Your IyanjuPay administrator account has been created.

Admin portal:
${adminPortalUrl}

Login email:
${params.to}

Administrator role:
${roleLabel(params.role)}

Temporary password:
${params.password}

Please change your password immediately after your first login.

Do not share your credentials.

Regards,
IyanjuPay Administration
`.trim();

  const client =
    new SMTPClient({
      connection: {
        hostname: host,
        port,
        tls:
          port === 465,
        auth: {
          username,
          password,
        },
      },
    });

  try {
    await client.send({
      from: `${fromName} <${fromEmail}>`,
      to: `${params.toName} <${params.to}>`,
      subject:
        "Your IyanjuPay Administrator Account",
      content: text,
      html,
    });
  } finally {
    await client.close();
  }
}

Deno.serve(async (req) => {
  if (
    req.method === "OPTIONS"
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
    req.method !== "POST"
  ) {
    return json(
      {
        success: false,
        error:
          "Method not allowed",
      },
      405,
    );
  }

  const supabaseUrl =
    Deno.env.get(
      "SUPABASE_URL",
    ) ?? "";

  const serviceRoleKey =
    Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    ) ?? "";

  const anonKey =
    Deno.env.get(
      "SUPABASE_ANON_KEY",
    ) ?? "";

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
    req.headers.get(
      "Authorization",
    );

  if (!authorization) {
    return json(
      {
        success: false,
        error:
          "Authentication required",
      },
      401,
    );
  }

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
        error:
          "Unauthorized",
      },
      401,
    );
  }

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

  try {
    const body =
      await req.json();

    const fullName =
      cleanName(
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
        : String(
            body.notes,
          ).trim() || null;

    if (!fullName) {
      return json(
        {
          success: false,
          error:
            "Full name is required.",
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
      !VALID_ROLES.includes(
        role,
      )
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
     * Verify acting administrator.
     */
    const {
      data: actingAdmin,
      error:
        actingAdminError,
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
     * Check duplicate email.
     */
    let existingUser =
      null;

    let page = 1;

    while (true) {
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

      existingUser =
        data.users.find(
          (candidate) =>
            String(
              candidate.email ??
                "",
            )
              .trim()
              .toLowerCase() ===
            email,
        ) ?? null;

      if (
        existingUser ||
        data.users.length <
          1000
      ) {
        break;
      }

      page++;
    }

    if (existingUser) {
      const {
        data: existingAdmin,
      } =
        await adminClient
          .from(
            "support_admins",
          )
          .select(
            "user_id,role,is_active",
          )
          .eq(
            "user_id",
            existingUser.id,
          )
          .maybeSingle();

      if (
        existingAdmin
      ) {
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
            "An account with this email already exists.",
        },
        409,
      );
    }

    /**
     * Lastname@123
     */
    const lastName =
      getLastName(
        fullName,
      );

    const temporaryPassword =
      `${passwordName(lastName)}@123`;

    /**
     * Create Auth account.
     */
    const {
      data:
        createdAuth,
      error:
        createAuthError,
    } =
      await adminClient.auth.admin.createUser(
        {
          email,
          password:
            temporaryPassword,
          email_confirm:
            true,
          user_metadata: {
            full_name:
              fullName,
            account_type:
              "admin",
            admin_role:
              role,
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

    const newUserId =
      createdAuth.user.id;

    try {
      /**
       * Create support_admins.
       */
      const {
        error:
          supportError,
      } =
        await adminClient
          .from(
            "support_admins",
          )
          .insert({
            user_id:
              newUserId,
            role,
            is_active:
              true,
            created_by:
              user.id,
          });

      if (
        supportError
      ) {
        throw new Error(
          supportError.message,
        );
      }

      /**
       * Management metadata.
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
                newUserId,
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
       * Audit.
       *
       * Never record the password.
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
              newUserId,

            p_user_id:
              newUserId,

            p_before_data:
              null,

            p_after_data: {
              user_id:
                newUserId,
              email,
              full_name:
                fullName,
              role,
              is_active:
                true,
            },

            p_metadata: {
              source:
                "admin-create-account",
              created_by_admin_id:
                user.id,
              credentials_sent:
                true,
            },
          },
        );

      if (
        auditError
      ) {
        throw new Error(
          `Audit log failed: ${auditError.message}`,
        );
      }

      /**
       * Send credentials.
       */
      await sendBrevoEmail({
        to: email,
        toName:
          fullName,
        fullName,
        password:
          temporaryPassword,
        role,
      });

      /**
       * Do NOT return the password.
       */
      return json(
        {
          success: true,
          message:
            "Administrator account created successfully. Login credentials have been sent to the administrator's email.",
          admin: {
            user_id:
              newUserId,
            email,
            full_name:
              fullName,
            role,
            role_label:
              roleLabel(
                role,
              ),
            is_active:
              true,
            credentials_sent:
              true,
          },
        },
      );
    } catch (error) {
      /**
       * Roll back everything created for this account.
       */
      console.error(
        "Rolling back administrator creation:",
        error,
      );

      await adminClient
        .from(
          "support_admins",
        )
        .delete()
        .eq(
          "user_id",
          newUserId,
        );

      await adminClient
        .from(
          "admin_management_metadata",
        )
        .delete()
        .eq(
          "admin_user_id",
          newUserId,
        );

      await adminClient.auth.admin.deleteUser(
        newUserId,
      );

      throw error;
    }
  } catch (error) {
    console.error(
      "admin-create-account:",
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
