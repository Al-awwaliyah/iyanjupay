import React, {
FormEvent,
useCallback,
useEffect,
useState,
} from "react";

import {
AlertCircle,
CheckCircle2,
Eye,
EyeOff,
KeyRound,
Loader2,
LogOut,
ShieldCheck,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import AdminLayout from "@/pages/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
Alert,
AlertDescription,
AlertTitle,
} from "@/components/ui/alert";

type AdminRole =
| "super_admin"
| "operations_admin"
| "support_admin"
| "finance_admin"
| "compliance_admin"
| "read_only_admin";

type AdminAuthState = {
is_admin?: boolean;
is_active?: boolean;
role?: AdminRole | string | null;
must_change_password?: boolean;
user_id?: string | null;
email?: string | null;
display_name?: string | null;
};

type PasswordStrength = {
score: number;
label: string;
valid: boolean;
};

function extractError(error: unknown): string {
if (!error) {
return "An unexpected error occurred.";
}

if (typeof error === "string") {
return error;
}

if (typeof error === "object") {
const value = error as {
message?: string;
error_description?: string;
details?: string;
hint?: string;
};


return (
  value.message ??
  value.error_description ??
  value.details ??
  value.hint ??
  "An unexpected error occurred."
);


}

return "An unexpected error occurred.";
}

function getPasswordStrength(
password: string,
): PasswordStrength {
if (!password) {
return {
score: 0,
label: "",
valid: false,
};
}

let score = 0;

if (password.length >= 8) {
score += 1;
}

if (password.length >= 12) {
score += 1;
}

if (/[A-Z]/.test(password)) {
score += 1;
}

if (/[a-z]/.test(password)) {
score += 1;
}

if (/[0-9]/.test(password)) {
score += 1;
}

if (/[^A-Za-z0-9]/.test(password)) {
score += 1;
}

if (score <= 2) {
return {
score,
label: "Weak",
valid: false,
};
}

if (score <= 4) {
return {
score,
label: "Moderate",
valid: false,
};
}

return {
score,
label: "Strong",
valid: true,
};
}

function getRoleLabel(
role: AdminRole | string | null | undefined,
) {
switch (role) {
case "super_admin":
return "Super Admin";


case "operations_admin":
  return "Operations Admin";

case "support_admin":
  return "Support Admin";

case "finance_admin":
  return "Finance Admin";

case "compliance_admin":
  return "Compliance Admin";

case "read_only_admin":
  return "Read Only Admin";

default:
  return "Administrator";


}
}

const AdminChangePasswordPage: React.FC = () => {
const navigate = useNavigate();

const [checking, setChecking] = useState(true);

const [adminState, setAdminState] =
useState<AdminAuthState | null>(null);

const [currentPassword, setCurrentPassword] =
useState("");

const [newPassword, setNewPassword] =
useState("");

const [confirmPassword, setConfirmPassword] =
useState("");

const [showCurrentPassword, setShowCurrentPassword] =
useState(false);

const [showNewPassword, setShowNewPassword] =
useState(false);

const [showConfirmPassword, setShowConfirmPassword] =
useState(false);

const [loading, setLoading] = useState(false);
const [signingOut, setSigningOut] = useState(false);

const [error, setError] =
useState<string | null>(null);

const [success, setSuccess] =
useState<string | null>(null);

const passwordStrength =
getPasswordStrength(newPassword);

const validateAdminSession =
useCallback(async () => {
try {
setChecking(true);
setError(null);


    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      navigate("/admin/login", {
        replace: true,
      });

      return;
    }

    const {
      data,
      error: stateError,
    } = await supabase.rpc(
      "admin_auth_get_state",
    );

    if (stateError) {
      throw stateError;
    }

    if (!data || typeof data !== "object") {
      await supabase.auth.signOut();

      navigate("/admin/login", {
        replace: true,
      });

      return;
    }

    const state =
      data as AdminAuthState;

    if (
      state.is_admin !== true ||
      state.is_active !== true
    ) {
      await supabase.auth.signOut();

      setError(
        "This account is not authorized to access the administrator portal.",
      );

      navigate("/admin/login", {
        replace: true,
      });

      return;
    }

    setAdminState(state);

    /*
     * If the administrator has already changed the
     * temporary password, there is no reason to remain
     * on this page.
     */
    if (
      state.must_change_password !== true
    ) {
      navigate("/admin/dashboard", {
        replace: true,
      });

      return;
    }

    /*
     * Keep the admin's activity timestamp current
     * when this page is opened.
     */
    try {
      await supabase.rpc(
        "admin_auth_touch_activity",
      );
    } catch (activityError) {
      /*
       * Activity tracking must not prevent a legitimate
       * administrator from changing their password.
       */
      console.warn(
        "Unable to update administrator activity:",
        activityError,
      );
    }
  } catch (validationError) {
    console.error(
      "Failed to validate administrator session:",
      validationError,
    );

    setError(
      extractError(validationError),
    );
  } finally {
    setChecking(false);
  }
}, [navigate]);


useEffect(() => {
void validateAdminSession();
}, [validateAdminSession]);

const handleSignOut = async () => {
try {
setSigningOut(true);


  await supabase.auth.signOut();

  navigate("/admin/login", {
    replace: true,
  });
} catch (signOutError) {
  console.error(
    "Failed to sign out administrator:",
    signOutError,
  );

  setError(
    extractError(signOutError),
  );
} finally {
  setSigningOut(false);
}


};

const handleSubmit = async (
event: FormEvent<HTMLFormElement>,
) => {
event.preventDefault();


setError(null);
setSuccess(null);

if (!currentPassword) {
  setError(
    "Enter your temporary password.",
  );
  return;
}

if (!newPassword) {
  setError(
    "Enter your new password.",
  );
  return;
}

if (newPassword.length < 8) {
  setError(
    "Your new password must contain at least 8 characters.",
  );
  return;
}

if (!passwordStrength.valid) {
  setError(
    "Choose a stronger password containing uppercase and lowercase letters, numbers, and a special character.",
  );
  return;
}

if (newPassword === currentPassword) {
  setError(
    "Your new password must be different from your temporary password.",
  );
  return;
}

if (newPassword !== confirmPassword) {
  setError(
    "The password confirmation does not match.",
  );
  return;
}

try {
  setLoading(true);

  /*
   * Verify that the current authenticated session still
   * belongs to an active administrator who is required
   * to change their password.
   */
  const {
    data: stateData,
    error: stateError,
  } = await supabase.rpc(
    "admin_auth_get_state",
  );

  if (stateError) {
    throw stateError;
  }

  if (
    !stateData ||
    typeof stateData !== "object"
  ) {
    throw new Error(
      "Unable to verify administrator account state.",
    );
  }

  const state =
    stateData as AdminAuthState;

  if (
    state.is_admin !== true ||
    state.is_active !== true
  ) {
    await supabase.auth.signOut();

    navigate("/admin/login", {
      replace: true,
    });

    return;
  }

  if (
    state.must_change_password !== true
  ) {
    navigate("/admin/dashboard", {
      replace: true,
    });

    return;
  }

  /*
   * Re-authenticate using the temporary/current password.
   *
   * This prevents somebody who merely obtains an existing
   * browser session from changing the administrator's
   * password without knowing the current password.
   */
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user?.email) {
    throw new Error(
      "Unable to determine the administrator email address.",
    );
  }

  const {
    error: reauthenticationError,
  } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (reauthenticationError) {
    throw new Error(
      "The current password is incorrect.",
    );
  }

  /*
   * Set the new Supabase Auth password.
   */
  const {
    error: passwordError,
  } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (passwordError) {
    throw passwordError;
  }

  /*
   * Clear the forced-password-change flag.
   *
   * This RPC must verify the authenticated administrator
   * server-side and must not accept an arbitrary user ID
   * from the browser.
   */
  const {
    data: clearData,
    error: clearError,
  } = await supabase.rpc(
    "admin_auth_complete_password_change",
  );

  if (clearError) {
    throw clearError;
  }

  if (
    clearData !== true &&
    !(
      clearData &&
      typeof clearData === "object" &&
      (
        (clearData as Record<string, unknown>)
          .success === true
      )
    )
  ) {
    throw new Error(
      "Password was changed, but the administrator password-change state could not be completed.",
    );
  }

  /*
   * Update activity after successful password change.
   */
  try {
    await supabase.rpc(
      "admin_auth_touch_activity",
    );
  } catch (activityError) {
    console.warn(
      "Unable to update administrator activity:",
      activityError,
    );
  }

  setSuccess(
    "Your password has been changed successfully. Redirecting to the administrator dashboard...",
  );

  window.setTimeout(() => {
    navigate("/admin/dashboard", {
      replace: true,
    });
  }, 800);
} catch (submitError) {
  console.error(
    "Failed to change administrator password:",
    submitError,
  );

  setError(
    extractError(submitError),
  );
} finally {
  setLoading(false);
}


};

if (checking) {
return ( <AdminLayout> <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-50 px-4"> <div className="flex flex-col items-center text-center"> <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900"> <Loader2 className="h-7 w-7 animate-spin text-white" /> </div>


        <p className="mt-4 text-sm font-medium text-slate-700">
          Verifying administrator access...
        </p>
      </div>
    </div>
  </AdminLayout>
);


}

return ( <AdminLayout> <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-50 px-4 py-10"> <div className="w-full max-w-lg"> <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"> <div className="bg-slate-900 px-6 py-8 text-white sm:px-8"> <div className="flex items-center justify-between gap-4"> <div className="flex items-center gap-3"> <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20"> <KeyRound className="h-6 w-6" /> </div>


              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-300">
                  IyanjuPay
                </p>

                <h1 className="mt-1 text-xl font-bold">
                  Change Password
                </h1>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              disabled={
                loading || signingOut
              }
              className="text-slate-300 hover:bg-white/10 hover:text-white"
            >
              {signingOut ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              Sign out
            </Button>
          </div>

          <p className="mt-6 text-sm leading-6 text-slate-300">
            Your administrator account was created
            with a temporary password. You must
            create a new password before accessing
            the administrator dashboard.
          </p>
        </div>

        <div className="p-6 sm:p-8">
          {adminState && (
            <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-700 shadow-sm">
                  {(adminState.display_name ||
                    adminState.email ||
                    "AD")
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map(
                      (part) =>
                        part[0],
                    )
                    .join("")
                    .toUpperCase()}
                </div>

                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {adminState.display_name ||
                      adminState.email ||
                      "Administrator"}
                  </p>

                  {adminState.email && (
                    <p className="truncate text-sm text-slate-500">
                      {adminState.email}
                    </p>
                  )}

                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {getRoleLabel(
                      adminState.role,
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <Alert
              variant="destructive"
              className="mb-5"
            >
              <AlertCircle className="h-4 w-4" />

              <AlertTitle>
                Password Change Failed
              </AlertTitle>

              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mb-5">
              <CheckCircle2 className="h-4 w-4" />

              <AlertTitle>
                Password Changed
              </AlertTitle>

              <AlertDescription>
                {success}
              </AlertDescription>
            </Alert>
          )}

          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="current-admin-password">
                Current / Temporary Password
              </Label>

              <div className="relative">
                <Input
                  id="current-admin-password"
                  type={
                    showCurrentPassword
                      ? "text"
                      : "password"
                  }
                  value={currentPassword}
                  onChange={(event) => {
                    setCurrentPassword(
                      event.target.value,
                    );
                    setError(null);
                    setSuccess(null);
                  }}
                  placeholder="Enter your temporary password"
                  autoComplete="current-password"
                  disabled={loading}
                  required
                  className="pr-11"
                />

                <button
                  type="button"
                  aria-label={
                    showCurrentPassword
                      ? "Hide current password"
                      : "Show current password"
                  }
                  onClick={() =>
                    setShowCurrentPassword(
                      (current) =>
                        !current,
                    )
                  }
                  disabled={loading}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-50"
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              <p className="text-xs text-slate-500">
                Enter the temporary password you
                received when your administrator
                account was created.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-admin-password">
                New Password
              </Label>

              <div className="relative">
                <Input
                  id="new-admin-password"
                  type={
                    showNewPassword
                      ? "text"
                      : "password"
                  }
                  value={newPassword}
                  onChange={(event) => {
                    setNewPassword(
                      event.target.value,
                    );
                    setError(null);
                    setSuccess(null);
                  }}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                  disabled={loading}
                  required
                  className="pr-11"
                />

                <button
                  type="button"
                  aria-label={
                    showNewPassword
                      ? "Hide new password"
                      : "Show new password"
                  }
                  onClick={() =>
                    setShowNewPassword(
                      (current) =>
                        !current,
                    )
                  }
                  disabled={loading}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-50"
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {newPassword && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      Password strength
                    </span>

                    <span
                      className={
                        passwordStrength.valid
                          ? "font-medium text-emerald-600"
                          : "font-medium text-amber-600"
                      }
                    >
                      {passwordStrength.label}
                    </span>
                  </div>

                  <div className="flex gap-1">
                    {Array.from({
                      length: 6,
                    }).map((_, index) => (
                      <div
                        key={index}
                        className={[
                          "h-1 flex-1 rounded-full",
                          index <
                          passwordStrength.score
                            ? "bg-slate-700"
                            : "bg-slate-200",
                        ].join(" ")}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-admin-password">
                Confirm New Password
              </Label>

              <div className="relative">
                <Input
                  id="confirm-admin-password"
                  type={
                    showConfirmPassword
                      ? "text"
                      : "password"
                  }
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(
                      event.target.value,
                    );
                    setError(null);
                    setSuccess(null);
                  }}
                  placeholder="Repeat your new password"
                  autoComplete="new-password"
                  disabled={loading}
                  required
                  className="pr-11"
                />

                <button
                  type="button"
                  aria-label={
                    showConfirmPassword
                      ? "Hide confirmation password"
                      : "Show confirmation password"
                  }
                  onClick={() =>
                    setShowConfirmPassword(
                      (current) =>
                        !current,
                    )
                  }
                  disabled={loading}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-50"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {confirmPassword &&
                newPassword !==
                  confirmPassword && (
                  <p className="text-xs text-red-600">
                    Passwords do not match.
                  </p>
                )}

              {confirmPassword &&
                newPassword ===
                  confirmPassword && (
                  <p className="flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Passwords match.
                  </p>
                )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-800">
                Password requirements
              </p>

              <ul className="mt-2 space-y-1.5 text-xs text-slate-500">
                <li>
                  • At least 8 characters
                </li>

                <li>
                  • At least one uppercase letter
                </li>

                <li>
                  • At least one lowercase letter
                </li>

                <li>
                  • At least one number
                </li>

                <li>
                  • At least one special character
                </li>

                <li>
                  • Must be different from the
                  temporary password
                </li>
              </ul>
            </div>

            <Button
              type="submit"
              className="h-11 w-full"
              disabled={
                loading ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword ||
                newPassword !==
                  confirmPassword ||
                !passwordStrength.valid
              }
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Changing Password...
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Change Password
                </>
              )}
            </Button>
          </form>
        </div>
      </div>

      <p className="mt-5 text-center text-xs text-slate-400">
        IyanjuPay Administrator Portal
      </p>
    </div>
  </div>
</AdminLayout>

);
};

export default AdminChangePasswordPage;
