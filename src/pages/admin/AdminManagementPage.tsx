import React, {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from "lucide-react";

import AdminLayout from "@/pages/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/* ============================================================
   TYPES
   ============================================================ */

type AdminRole =
  | "super_admin"
  | "operations_admin"
  | "support_admin"
  | "finance_admin"
  | "compliance_admin"
  | "read_only_admin";

type AdminRecord = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  display_name?: string | null;
  role: AdminRole | string;
  is_active: boolean;
  created_at: string;
  last_sign_in_at?: string | null;
  must_change_password?: boolean;
  notes?: string | null;
  last_activity_at?: string | null;
  created_by: string | null;
};

type AdminSummary = {
  total: number;
  active: number;
  inactive: number;
  super_admin: number;
  operations_admin: number;
  support_admin: number;
  finance_admin: number;
  compliance_admin: number;
  read_only_admin: number;
};

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

const PAGE_SIZE = 10;

/* ============================================================
   ROLE CONFIGURATION
   ============================================================ */

const ROLE_OPTIONS: Array<{
  value: AdminRole;
  label: string;
  description: string;
}> = [
  {
    value: "super_admin",
    label: "Super Admin",
    description: "Full administrative access",
  },
  {
    value: "operations_admin",
    label: "Operations Admin",
    description: "Operational and transaction management",
  },
  {
    value: "support_admin",
    label: "Support Admin",
    description: "Manage customer support activities",
  },
  {
    value: "finance_admin",
    label: "Finance Admin",
    description: "Finance and financial operations",
  },
  {
    value: "compliance_admin",
    label: "Compliance Admin",
    description: "Manage compliance and KYC activities",
  },
  {
    value: "read_only_admin",
    label: "Read Only Admin",
    description: "View-only administrative access",
  },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  operations_admin: "Operations Admin",
  support_admin: "Support Admin",
  finance_admin: "Finance Admin",
  compliance_admin: "Compliance Admin",
  read_only_admin: "Read Only Admin",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  super_admin: "Full administrative access",
  operations_admin: "Operational and transaction management",
  support_admin: "Manage customer support activities",
  finance_admin: "Finance and financial operations",
  compliance_admin: "Manage compliance and KYC activities",
  read_only_admin: "View-only administrative access",
};

/* ============================================================
   HELPERS
   ============================================================ */

function getRoleLabel(
  role: string | null | undefined,
): string {
  if (!role) {
    return "Unknown";
  }

  return ROLE_LABELS[role] ?? role;
}

function getRoleDescription(
  role: string | null | undefined,
): string {
  if (!role) {
    return "";
  }

  return ROLE_DESCRIPTIONS[role] ?? "";
}

function formatDate(
  value: string | null | undefined,
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getInitials(
  fullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const source =
    fullName?.trim() ||
    email?.trim() ||
    "Admin";

  const parts = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return parts
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/**
 * IMPORTANT:
 *
 * admin_management_list() is RETURNS TABLE.
 *
 * Therefore Supabase returns:
 *
 * [
 *   {
 *     user_id: "...",
 *     email: "...",
 *     ...
 *   }
 * ]
 *
 * It does NOT return:
 *
 * {
 *   admins: [...]
 * }
 *
 * This is the primary fix for the "No administrators found"
 * problem.
 */
function normalizeAdminList(
  response: unknown,
): AdminRecord[] {
  if (!response) {
    return [];
  }

  if (Array.isArray(response)) {
    return response as AdminRecord[];
  }

  if (
    typeof response === "object" &&
    response !== null
  ) {
    const value =
      response as {
        admins?: unknown;
        data?: unknown;
      };

    if (Array.isArray(value.admins)) {
      return value.admins as AdminRecord[];
    }

    if (Array.isArray(value.data)) {
      return value.data as AdminRecord[];
    }
  }

  return [];
}

function extractRpcError(
  error: unknown,
): string {
  if (!error) {
    return "An unexpected error occurred.";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null
  ) {
    const value =
      error as {
        message?: string;
        details?: string;
        hint?: string;
        error?: string;
      };

    if (value.message) {
      return value.message;
    }

    if (value.error) {
      return value.error;
    }

    if (value.details) {
      return value.details;
    }

    if (value.hint) {
      return value.hint;
    }
  }

  return "An unexpected error occurred.";
}

function isSuccessfulResponse(
  value: unknown,
): boolean {
  if (
    value &&
    typeof value === "object"
  ) {
    return Boolean(
      (value as {
        success?: unknown;
      }).success,
    );
  }

  return false;
}

/* ============================================================
   BADGES
   ============================================================ */

function RoleBadge({
  role,
}: {
  role: string;
}) {
  const isSuperAdmin =
    role === "super_admin";

  const isOperationsAdmin =
    role === "operations_admin";

  const isSupportAdmin =
    role === "support_admin";

  const isFinanceAdmin =
    role === "finance_admin";

  const isComplianceAdmin =
    role === "compliance_admin";

  const classes = [
    "inline-flex items-center gap-1.5",
    "rounded-full px-2.5 py-1",
    "text-xs font-medium",
    isSuperAdmin
      ? "bg-amber-100 text-amber-800"
      : isOperationsAdmin
        ? "bg-blue-100 text-blue-800"
        : isSupportAdmin
          ? "bg-violet-100 text-violet-800"
          : isFinanceAdmin
            ? "bg-emerald-100 text-emerald-800"
            : isComplianceAdmin
              ? "bg-orange-100 text-orange-800"
              : "bg-slate-100 text-slate-700",
  ].join(" ");

  return (
    <span className={classes}>
      {isSuperAdmin ? (
        <ShieldCheck className="h-3.5 w-3.5" />
      ) : (
        <Shield className="h-3.5 w-3.5" />
      )}

      {getRoleLabel(role)}
    </span>
  );
}

function StatusBadge({
  active,
}: {
  active: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5",
        "rounded-full px-2.5 py-1",
        "text-xs font-medium",
        active
          ? "bg-emerald-100 text-emerald-800"
          : "bg-red-100 text-red-800",
      ].join(" ")}
    >
      {active ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <UserX className="h-3.5 w-3.5" />
      )}

      {active ? "Active" : "Inactive"}
    </span>
  );
}

/* ============================================================
   PAGE
   ============================================================ */

const AdminManagementPage: React.FC =
  () => {
    const [admins, setAdmins] =
      useState<AdminRecord[]>([]);

    const [total, setTotal] =
      useState(0);

    const [summary, setSummary] =
      useState<AdminSummary>({
        total: 0,
        active: 0,
        inactive: 0,
        super_admin: 0,
        operations_admin: 0,
        support_admin: 0,
        finance_admin: 0,
        compliance_admin: 0,
        read_only_admin: 0,
      });

    const [search, setSearch] =
      useState("");

    const [roleFilter, setRoleFilter] =
      useState<string>("all");

    const [activeFilter, setActiveFilter] =
      useState<string>("all");

    const [page, setPage] =
      useState(1);

    const [loading, setLoading] =
      useState(true);

    const [refreshing, setRefreshing] =
      useState(false);

    const [toast, setToast] =
      useState<ToastState>(null);

    const [addDialogOpen, setAddDialogOpen] =
      useState(false);

    const [roleDialogOpen, setRoleDialogOpen] =
      useState(false);

    const [statusDialogOpen, setStatusDialogOpen] =
      useState(false);

    const [selectedAdmin, setSelectedAdmin] =
      useState<AdminRecord | null>(null);

    const [statusTarget, setStatusTarget] =
      useState<AdminRecord | null>(null);

    const [addFullName, setAddFullName] =
      useState("");

    const [addEmail, setAddEmail] =
      useState("");

    const [addRole, setAddRole] =
      useState<AdminRole>(
        "operations_admin",
      );

    const [addNotes, setAddNotes] =
      useState("");

    const [newRole, setNewRole] =
      useState<AdminRole>(
        "operations_admin",
      );

    const [actionLoading, setActionLoading] =
      useState(false);

    const [currentAdminId, setCurrentAdminId] =
      useState<string | null>(null);

    const totalPages = useMemo(() => {
      return Math.max(
        1,
        Math.ceil(total / PAGE_SIZE),
      );
    }, [total]);

    /* ========================================================
       TOAST
       ======================================================== */

    const showToast = useCallback(
      (
        type: "success" | "error",
        message: string,
      ) => {
        setToast({
          type,
          message,
        });

        window.setTimeout(() => {
          setToast(null);
        }, 5000);
      },
      [],
    );

    /* ========================================================
       CURRENT ADMIN
       ======================================================== */

    const loadCurrentUser =
      useCallback(async () => {
        const {
          data,
          error,
        } = await supabase.auth.getUser();

        if (error) {
          console.error(
            "Unable to load current administrator:",
            error,
          );

          return;
        }

        setCurrentAdminId(
          data.user?.id ?? null,
        );
      }, []);

    /* ========================================================
       SUMMARY
       ======================================================== */

    const loadSummary =
      useCallback(async () => {
        const {
          data,
          error,
        } = await supabase.rpc(
          "admin_management_summary",
        );

        if (error) {
          throw error;
        }

        if (!data) {
          return;
        }

        const raw =
          Array.isArray(data)
            ? data[0]
            : data;

        if (
          !raw ||
          typeof raw !== "object"
        ) {
          return;
        }

        const value =
          raw as Record<
            string,
            unknown
          >;

        setSummary({
          total:
            Number(
              value.total ??
                value.total_admins ??
                value.admin_count ??
                0,
            ) || 0,

          active:
            Number(
              value.active ??
                value.active_admins ??
                0,
            ) || 0,

          inactive:
            Number(
              value.inactive ??
                value.inactive_admins ??
                0,
            ) || 0,

          super_admin:
            Number(
              value.super_admin ??
                value.super_admins ??
                0,
            ) || 0,

          operations_admin:
            Number(
              value.operations_admin ??
                value.operations_admins ??
                0,
            ) || 0,

          support_admin:
            Number(
              value.support_admin ??
                value.support_admins ??
                0,
            ) || 0,

          finance_admin:
            Number(
              value.finance_admin ??
                value.finance_admins ??
                0,
            ) || 0,

          compliance_admin:
            Number(
              value.compliance_admin ??
                value.compliance_admins ??
                0,
            ) || 0,

          read_only_admin:
            Number(
              value.read_only_admin ??
                value.read_only_admins ??
                0,
            ) || 0,
        });
      }, []);

    /* ========================================================
       LOAD ADMINISTRATORS
       ======================================================== */

    const loadAdmins =
      useCallback(
        async (
          showRefresh = false,
        ) => {
          try {
            if (showRefresh) {
              setRefreshing(true);
            } else {
              setLoading(true);
            }

            const normalizedSearch =
              search.trim() || null;

            const role =
              roleFilter === "all"
                ? null
                : roleFilter;

            let isActive:
              | boolean
              | null = null;

            if (
              activeFilter ===
              "active"
            ) {
              isActive = true;
            }

            if (
              activeFilter ===
              "inactive"
            ) {
              isActive = false;
            }

            /* ------------------------------------------------
               THIS IS THE CORRECT RPC CALL

               Function:

               admin_management_list(
                 text,
                 text,
                 boolean,
                 integer,
                 integer
               )
               ------------------------------------------------ */

            const {
              data,
              error,
            } = await supabase.rpc(
              "admin_management_list",
              {
                p_search:
                  normalizedSearch,

                p_role:
                  role,

                p_is_active:
                  isActive,

                p_limit:
                  PAGE_SIZE,

                p_offset:
                  (page - 1) *
                  PAGE_SIZE,
              },
            );

            if (error) {
              throw error;
            }

            /*
             * IMPORTANT:
             *
             * data is an ARRAY because the SQL function
             * uses RETURNS TABLE.
             */
            const rows =
              normalizeAdminList(data);

            setAdmins(rows);

            /*
             * admin_management_list() currently does not
             * return total_count because it is RETURNS TABLE.
             *
             * For an unfiltered directory, use the summary.
             *
             * For filtered results, use the returned row count
             * when the current result is smaller than PAGE_SIZE.
             *
             * This keeps pagination correct for the current
             * administrator dataset and prevents the previous
             * "No administrators found" bug.
             */

            if (
              !search.trim() &&
              roleFilter === "all" &&
              activeFilter === "all"
            ) {
              await loadSummary();

              /*
               * summary.total is the authoritative total
               * administrator count.
               */
              setTotal(
                Math.max(
                  summary.total,
                  rows.length,
                ),
              );
            } else {
              /*
               * For a filtered result, if fewer than PAGE_SIZE
               * rows are returned, this is the final page.
               */
              if (
                rows.length <
                PAGE_SIZE
              ) {
                setTotal(
                  (page - 1) *
                    PAGE_SIZE +
                    rows.length,
                );
              } else {
                /*
                 * There is at least one more page.
                 *
                 * Use a safe lower-bound total.
                 */
                setTotal(
                  Math.max(
                    page *
                      PAGE_SIZE +
                      1,
                    summary.total,
                  ),
                );
              }

              await loadSummary();
            }
          } catch (error) {
            console.error(
              "Failed to load administrator management data:",
              error,
            );

            showToast(
              "error",
              extractRpcError(error),
            );

            setAdmins([]);
          } finally {
            setLoading(false);
            setRefreshing(false);
          }
        },
        [
          activeFilter,
          loadSummary,
          page,
          roleFilter,
          search,
          showToast,
        ],
      );

    /* ========================================================
       INITIAL LOAD
       ======================================================== */

    useEffect(() => {
      void loadCurrentUser();
    }, [loadCurrentUser]);

    useEffect(() => {
      const timer =
        window.setTimeout(() => {
          void loadAdmins();
        }, 250);

      return () => {
        window.clearTimeout(timer);
      };
    }, [loadAdmins]);

    /* ========================================================
       REFRESH
       ======================================================== */

    const handleRefresh =
      async () => {
        await Promise.all([
          loadAdmins(true),
          loadSummary(),
        ]);
      };

    /* ========================================================
       CREATE ADMIN FORM
       ======================================================== */

    const resetAddForm = () => {
      setAddFullName("");
      setAddEmail("");
      setAddRole(
        "operations_admin",
      );
      setAddNotes("");
    };

    const handleAddAdmin =
      async (
        event: FormEvent<HTMLFormElement>,
      ) => {
        event.preventDefault();

        const fullName =
          addFullName
            .trim()
            .replace(
              /\s+/g,
              " ",
            );

        const email =
          addEmail
            .trim()
            .toLowerCase();

        const notes =
          addNotes.trim();

        if (!fullName) {
          showToast(
            "error",
            "Administrator full name is required.",
          );
          return;
        }

        if (fullName.length < 2) {
          showToast(
            "error",
            "Please enter a valid administrator name.",
          );
          return;
        }

        if (!email) {
          showToast(
            "error",
            "Administrator email is required.",
          );
          return;
        }

        const emailPattern =
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (
          !emailPattern.test(
            email,
          )
        ) {
          showToast(
            "error",
            "Please enter a valid email address.",
          );
          return;
        }

        if (!addRole) {
          showToast(
            "error",
            "Administrator role is required.",
          );
          return;
        }

        try {
          setActionLoading(true);

          /*
           * CREATE ADMINISTRATOR
           *
           * Existing Edge Function:
           *
           * admin-create-account
           */
          const {
            data,
            error,
          } =
            await supabase.functions.invoke(
              "admin-create-account",
              {
                body: {
                  full_name:
                    fullName,

                  email,

                  role:
                    addRole,

                  notes:
                    notes || null,

                  display_name:
                    fullName,
                },
              },
            );

          if (error) {
            throw error;
          }

          if (
            !isSuccessfulResponse(
              data,
            )
          ) {
            const response =
              data as
                | {
                    error?: string;
                    message?: string;
                  }
                | null;

            throw new Error(
              response?.error ||
                response?.message ||
                "Administrator account creation did not complete successfully.",
            );
          }

          setAddDialogOpen(false);

          resetAddForm();

          showToast(
            "success",
            "Administrator account created successfully. Login credentials have been sent by email.",
          );

          /*
           * Reload both directory and counts.
           */
          setPage(1);

          await Promise.all([
            loadSummary(),
            loadAdmins(true),
          ]);
        } catch (error) {
          console.error(
            "Failed to create administrator account:",
            error,
          );

          showToast(
            "error",
            extractRpcError(error),
          );
        } finally {
          setActionLoading(false);
        }
      };

    /* ========================================================
       CHANGE ROLE
       ======================================================== */

    const openRoleDialog = (
      admin: AdminRecord,
    ) => {
      if (
        admin.user_id ===
        currentAdminId
      ) {
        showToast(
          "error",
          "You cannot change your own administrator role.",
        );

        return;
      }

      setSelectedAdmin(admin);

      const existingRole =
        ROLE_OPTIONS.some(
          (option) =>
            option.value ===
            admin.role,
        )
          ? (admin.role as AdminRole)
          : "read_only_admin";

      setNewRole(
        existingRole,
      );

      setRoleDialogOpen(true);
    };

    const handleChangeRole =
      async () => {
        if (!selectedAdmin) {
          return;
        }

        if (
          selectedAdmin.user_id ===
          currentAdminId
        ) {
          showToast(
            "error",
            "You cannot change your own administrator role.",
          );

          return;
        }

        if (
          selectedAdmin.role ===
          newRole
        ) {
          setRoleDialogOpen(false);
          return;
        }

        try {
          setActionLoading(true);

          /*
           * EXISTING ROLE-ASSIGNMENT RPC
           */
          const {
            data,
            error,
          } =
            await supabase.rpc(
              "admin_management_change_role",
              {
                p_admin_user_id:
                  selectedAdmin.user_id,

                p_new_role:
                  newRole,
              },
            );

          if (error) {
            throw error;
          }

          if (
            !isSuccessfulResponse(
              data,
            )
          ) {
            throw new Error(
              "Administrator role change did not complete successfully.",
            );
          }

          setRoleDialogOpen(false);
          setSelectedAdmin(null);

          showToast(
            "success",
            "Administrator role updated successfully.",
          );

          await Promise.all([
            loadSummary(),
            loadAdmins(true),
          ]);
        } catch (error) {
          console.error(
            "Failed to change administrator role:",
            error,
          );

          showToast(
            "error",
            extractRpcError(error),
          );
        } finally {
          setActionLoading(false);
        }
      };

    /* ========================================================
       CHANGE STATUS
       ======================================================== */

    const openStatusDialog = (
      admin: AdminRecord,
    ) => {
      if (
        admin.user_id ===
        currentAdminId
      ) {
        showToast(
          "error",
          "You cannot disable or deactivate your own administrator account.",
        );

        return;
      }

      setStatusTarget(admin);
      setStatusDialogOpen(true);
    };

    const handleChangeStatus =
      async () => {
        if (!statusTarget) {
          return;
        }

        if (
          statusTarget.user_id ===
          currentAdminId
        ) {
          showToast(
            "error",
            "You cannot disable or deactivate your own administrator account.",
          );

          return;
        }

        const nextStatus =
          !statusTarget.is_active;

        try {
          setActionLoading(true);

          /*
           * EXISTING STATUS RPC
           */
          const {
            data,
            error,
          } =
            await supabase.rpc(
              "admin_management_set_status",
              {
                p_admin_user_id:
                  statusTarget.user_id,

                p_is_active:
                  nextStatus,
              },
            );

          if (error) {
            throw error;
          }

          if (
            !isSuccessfulResponse(
              data,
            )
          ) {
            throw new Error(
              "Administrator status update did not complete successfully.",
            );
          }

          setStatusDialogOpen(
            false,
          );

          setStatusTarget(null);

          showToast(
            "success",
            nextStatus
              ? "Administrator reactivated successfully."
              : "Administrator disabled successfully.",
          );

          await Promise.all([
            loadSummary(),
            loadAdmins(true),
          ]);
        } catch (error) {
          console.error(
            "Failed to change administrator status:",
            error,
          );

          showToast(
            "error",
            extractRpcError(error),
          );
        } finally {
          setActionLoading(false);
        }
      };

    /* ========================================================
       FILTERS
       ======================================================== */

    const clearFilters = () => {
      setSearch("");
      setRoleFilter("all");
      setActiveFilter("all");
      setPage(1);
    };

    const hasFilters =
      search.trim() !== "" ||
      roleFilter !== "all" ||
      activeFilter !== "all";

    /* ========================================================
       RENDER
       ======================================================== */

    return (
      <AdminLayout>
        <div className="min-h-screen bg-slate-50">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">

            {/* ==================================================
                TOAST
                ================================================== */}

            {toast && (
              <div className="fixed right-4 top-4 z-[100] w-[min(420px,calc(100vw-2rem))]">
                <Alert
                  variant={
                    toast.type ===
                    "error"
                      ? "destructive"
                      : "default"
                  }
                >
                  {toast.type ===
                  "success" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}

                  <AlertTitle>
                    {toast.type ===
                    "success"
                      ? "Success"
                      : "Error"}
                  </AlertTitle>

                  <AlertDescription>
                    {toast.message}
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* ==================================================
                HEADER
                ================================================== */}

            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                  <Shield className="h-4 w-4" />
                  Administration
                </div>

                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Admin Management
                </h1>

                <p className="mt-1 max-w-2xl text-sm text-slate-600">
                  Create and manage administrator
                  accounts, roles, access status,
                  and administrative permissions.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={
                    handleRefresh
                  }
                  disabled={
                    refreshing ||
                    loading
                  }
                >
                  {refreshing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}

                  Refresh
                </Button>

                <Button
                  onClick={() => {
                    resetAddForm();
                    setAddDialogOpen(
                      true,
                    );
                  }}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add Admin
                </Button>
              </div>
            </div>

            {/* ==================================================
                SUMMARY
                ================================================== */}

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">

              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">
                        Total Admins
                      </p>

                      <p className="mt-1 text-2xl font-bold text-slate-900">
                        {summary.total}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-100 p-3">
                      <Shield className="h-5 w-5 text-slate-700" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">
                        Active
                      </p>

                      <p className="mt-1 text-2xl font-bold text-emerald-700">
                        {summary.active}
                      </p>
                    </div>

                    <div className="rounded-xl bg-emerald-50 p-3">
                      <UserCheck className="h-5 w-5 text-emerald-700" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">
                        Inactive
                      </p>

                      <p className="mt-1 text-2xl font-bold text-red-700">
                        {summary.inactive}
                      </p>
                    </div>

                    <div className="rounded-xl bg-red-50 p-3">
                      <UserX className="h-5 w-5 text-red-700" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">
                        Super Admins
                      </p>

                      <p className="mt-1 text-2xl font-bold text-amber-700">
                        {summary.super_admin}
                      </p>
                    </div>

                    <div className="rounded-xl bg-amber-50 p-3">
                      <ShieldCheck className="h-5 w-5 text-amber-700" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">
                        Other Admins
                      </p>

                      <p className="mt-1 text-2xl font-bold text-blue-700">
                        {Math.max(
                          0,
                          summary.operations_admin +
                            summary.support_admin +
                            summary.finance_admin +
                            summary.compliance_admin +
                            summary.read_only_admin,
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl bg-blue-50 p-3">
                      <Activity className="h-5 w-5 text-blue-700" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ==================================================
                DIRECTORY FILTERS
                ================================================== */}

            <Card className="mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Administrator Directory
                </CardTitle>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px_180px_auto]">

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                    <Input
                      value={search}
                      onChange={(event) => {
                        setSearch(
                          event.target
                            .value,
                        );

                        setPage(1);
                      }}
                      placeholder="Search by name, email, or user ID..."
                      className="pl-9"
                    />
                  </div>

                  <Select
                    value={roleFilter}
                    onValueChange={(
                      value,
                    ) => {
                      setRoleFilter(
                        value,
                      );

                      setPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All roles" />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="all">
                        All roles
                      </SelectItem>

                      {ROLE_OPTIONS.map(
                        (role) => (
                          <SelectItem
                            key={
                              role.value
                            }
                            value={
                              role.value
                            }
                          >
                            {role.label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>

                  <Select
                    value={
                      activeFilter
                    }
                    onValueChange={(
                      value,
                    ) => {
                      setActiveFilter(
                        value,
                      );

                      setPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="all">
                        All statuses
                      </SelectItem>

                      <SelectItem value="active">
                        Active
                      </SelectItem>

                      <SelectItem value="inactive">
                        Inactive
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    onClick={
                      clearFilters
                    }
                    disabled={
                      !hasFilters
                    }
                  >
                    <X className="mr-2 h-4 w-4" />
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ==================================================
                ADMINISTRATOR TABLE
                ================================================== */}

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px]">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Administrator
                      </th>

                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Role
                      </th>

                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </th>

                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Created
                      </th>

                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Last Sign In
                      </th>

                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y">
                    {loading ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-5 py-16 text-center"
                        >
                          <Loader2 className="mx-auto h-7 w-7 animate-spin text-slate-400" />

                          <p className="mt-3 text-sm text-slate-500">
                            Loading administrators...
                          </p>
                        </td>
                      </tr>
                    ) : admins.length ===
                      0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-5 py-16 text-center"
                        >
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                            <Shield className="h-6 w-6 text-slate-400" />
                          </div>

                          <p className="mt-4 text-sm font-medium text-slate-900">
                            No administrators found
                          </p>

                          <p className="mt-1 text-sm text-slate-500">
                            {hasFilters
                              ? "Try changing your search or filters."
                              : "No administrator accounts are available."}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      admins.map(
                        (
                          admin,
                        ) => {
                          const isCurrentAdmin =
                            admin.user_id ===
                            currentAdminId;

                          const displayName =
                            admin.full_name ||
                            admin.display_name ||
                            "Unnamed Administrator";

                          return (
                            <tr
                              key={
                                admin.user_id
                              }
                              className="transition-colors hover:bg-slate-50/80"
                            >
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                                    {getInitials(
                                      displayName,
                                      admin.email,
                                    )}
                                  </div>

                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="truncate font-medium text-slate-900">
                                        {
                                          displayName
                                        }
                                      </p>

                                      {isCurrentAdmin && (
                                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                          YOU
                                        </span>
                                      )}
                                    </div>

                                    <p className="truncate text-sm text-slate-500">
                                      {admin.email ||
                                        "No email"}
                                    </p>

                                    <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                                      {
                                        admin.user_id
                                      }
                                    </p>
                                  </div>
                                </div>
                              </td>

                              <td className="px-5 py-4 align-middle">
                                <div>
                                  <RoleBadge
                                    role={
                                      admin.role
                                    }
                                  />

                                  <p className="mt-1 text-xs text-slate-500">
                                    {getRoleDescription(
                                      admin.role,
                                    )}
                                  </p>
                                </div>
                              </td>

                              <td className="px-5 py-4 align-middle">
                                <StatusBadge
                                  active={
                                    admin.is_active
                                  }
                                />
                              </td>

                              <td className="px-5 py-4 align-middle text-sm text-slate-600">
                                {formatDate(
                                  admin.created_at,
                                )}
                              </td>

                              <td className="px-5 py-4 align-middle text-sm text-slate-600">
                                {formatDate(
                                  admin.last_sign_in_at,
                                )}
                              </td>

                              <td className="px-5 py-4 align-middle">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={
                                      isCurrentAdmin
                                    }
                                    onClick={() =>
                                      openRoleDialog(
                                        admin,
                                      )
                                    }
                                    title={
                                      isCurrentAdmin
                                        ? "You cannot change your own role"
                                        : "Change role"
                                    }
                                  >
                                    <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                                    Role
                                  </Button>

                                  <Button
                                    variant={
                                      admin.is_active
                                        ? "outline"
                                        : "default"
                                    }
                                    size="sm"
                                    disabled={
                                      isCurrentAdmin
                                    }
                                    onClick={() =>
                                      openStatusDialog(
                                        admin,
                                      )
                                    }
                                    title={
                                      isCurrentAdmin
                                        ? "You cannot change your own status"
                                        : admin.is_active
                                          ? "Disable administrator"
                                          : "Reactivate administrator"
                                    }
                                  >
                                    {admin.is_active ? (
                                      <>
                                        <UserX className="mr-1.5 h-3.5 w-3.5" />
                                        Disable
                                      </>
                                    ) : (
                                      <>
                                        <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                                        Activate
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        },
                      )
                    )}
                  </tbody>
                </table>
              </div>

              {/* ==================================================
                  PAGINATION
                  ================================================== */}

              <div className="flex flex-col gap-3 border-t bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  {total === 0
                    ? "No administrators"
                    : `Showing ${
                        (page - 1) *
                          PAGE_SIZE +
                        1
                      }–${Math.min(
                        page *
                          PAGE_SIZE,
                        total,
                      )} of ${total}`}
                </p>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      page <= 1 ||
                      loading
                    }
                    onClick={() =>
                      setPage(
                        (
                          current,
                        ) =>
                          Math.max(
                            1,
                            current - 1,
                          ),
                      )
                    }
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous
                  </Button>

                  <span className="min-w-[100px] text-center text-sm text-slate-600">
                    Page {page} of{" "}
                    {totalPages}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      page >=
                        totalPages ||
                      loading
                    }
                    onClick={() =>
                      setPage(
                        (
                          current,
                        ) =>
                          Math.min(
                            totalPages,
                            current + 1,
                          ),
                      )
                    }
                  >
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>

            {/* ==================================================
                CREATE ADMIN DIALOG
                ================================================== */}

            <Dialog
              open={
                addDialogOpen
              }
              onOpenChange={(
                open,
              ) => {
                if (
                  !actionLoading
                ) {
                  setAddDialogOpen(
                    open,
                  );
                }
              }}
            >
              <DialogContent
                className="
                  flex
                  max-h-[90vh]
                  w-[calc(100%-2rem)]
                  max-w-lg
                  flex-col
                  overflow-hidden
                  p-0
                "
              >
                <DialogHeader className="shrink-0 border-b px-6 py-5">
                  <DialogTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5" />
                    Create Administrator
                  </DialogTitle>

                  <DialogDescription>
                    Create a new IyanjuPay
                    administrator account
                    and assign the
                    administrator's role.
                  </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  <form
                    id="create-admin-form"
                    onSubmit={
                      handleAddAdmin
                    }
                    className="space-y-5 px-6 py-5"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="admin-full-name">
                        Full Name
                      </Label>

                      <Input
                        id="admin-full-name"
                        value={
                          addFullName
                        }
                        onChange={(
                          event,
                        ) =>
                          setAddFullName(
                            event
                              .target
                              .value,
                          )
                        }
                        placeholder="e.g. John Adewale"
                        disabled={
                          actionLoading
                        }
                        autoComplete="name"
                        autoFocus
                      />

                      <p className="text-xs text-slate-500">
                        The administrator's
                        last name will be
                        used to generate
                        the temporary
                        password.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="admin-email">
                        Email Address
                      </Label>

                      <Input
                        id="admin-email"
                        type="email"
                        value={
                          addEmail
                        }
                        onChange={(
                          event,
                        ) =>
                          setAddEmail(
                            event
                              .target
                              .value,
                          )
                        }
                        placeholder="admin@example.com"
                        disabled={
                          actionLoading
                        }
                        autoComplete="email"
                      />

                      <p className="text-xs text-slate-500">
                        Login credentials
                        will be sent to
                        this email address.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="admin-role">
                        Administrator Role
                      </Label>

                      <Select
                        value={
                          addRole
                        }
                        onValueChange={(
                          value,
                        ) =>
                          setAddRole(
                            value as AdminRole,
                          )
                        }
                        disabled={
                          actionLoading
                        }
                      >
                        <SelectTrigger id="admin-role">
                          <SelectValue />
                        </SelectTrigger>

                        <SelectContent>
                          {ROLE_OPTIONS.map(
                            (
                              role,
                            ) => (
                              <SelectItem
                                key={
                                  role.value
                                }
                                value={
                                  role.value
                                }
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {
                                      role.label
                                    }
                                  </span>
                                </div>
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>

                      <p className="text-xs text-slate-500">
                        {getRoleDescription(
                          addRole,
                        )}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="admin-notes">
                        Notes
                        <span className="ml-1 font-normal text-slate-400">
                          (optional)
                        </span>
                      </Label>

                      <textarea
                        id="admin-notes"
                        value={
                          addNotes
                        }
                        onChange={(
                          event,
                        ) =>
                          setAddNotes(
                            event
                              .target
                              .value,
                          )
                        }
                        placeholder="Administrative notes..."
                        disabled={
                          actionLoading
                        }
                        rows={4}
                        className="
                          flex
                          min-h-[100px]
                          w-full
                          resize-y
                          rounded-md
                          border
                          border-input
                          bg-background
                          px-3
                          py-2
                          text-sm
                          ring-offset-background
                          placeholder:text-muted-foreground
                          focus-visible:outline-none
                          focus-visible:ring-2
                          focus-visible:ring-ring
                          focus-visible:ring-offset-2
                          disabled:cursor-not-allowed
                          disabled:opacity-50
                        "
                      />
                    </div>

                    <Alert>
                      <Mail className="h-4 w-4" />

                      <AlertTitle>
                        Login credentials
                      </AlertTitle>

                      <AlertDescription>
                        The new administrator
                        will receive their
                        login email and
                        temporary password
                        automatically after
                        the account is created.
                        The temporary password
                        is based on their last
                        name and ends with{" "}
                        <strong>
                          @123
                        </strong>
                        .
                      </AlertDescription>
                    </Alert>

                    {addRole ===
                      "super_admin" && (
                      <Alert>
                        <ShieldCheck className="h-4 w-4" />

                        <AlertTitle>
                          High-privilege role
                        </AlertTitle>

                        <AlertDescription>
                          Super Admin has full
                          administrative access.
                          Only assign this role
                          to a trusted administrator.
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="h-1" />
                  </form>
                </div>

                <DialogFooter className="shrink-0 border-t bg-white px-6 py-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      actionLoading
                    }
                    onClick={() =>
                      setAddDialogOpen(
                        false,
                      )
                    }
                  >
                    Cancel
                  </Button>

                  <Button
                    type="submit"
                    form="create-admin-form"
                    disabled={
                      actionLoading
                    }
                  >
                    {actionLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="mr-2 h-4 w-4" />
                    )}

                    Create Administrator
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* ==================================================
                CHANGE ROLE DIALOG
                ================================================== */}

            <Dialog
              open={
                roleDialogOpen
              }
              onOpenChange={(
                open,
              ) => {
                if (
                  !actionLoading
                ) {
                  setRoleDialogOpen(
                    open,
                  );
                }
              }}
            >
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    Change Administrator
                    Role
                  </DialogTitle>

                  <DialogDescription>
                    Update the administrative
                    role for{" "}
                    <strong>
                      {selectedAdmin?.full_name ||
                        selectedAdmin?.display_name ||
                        selectedAdmin?.email ||
                        "this administrator"}
                    </strong>
                    .
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="rounded-lg border bg-slate-50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-700 shadow-sm">
                        {getInitials(
                          selectedAdmin?.full_name ||
                            selectedAdmin?.display_name,
                          selectedAdmin?.email,
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">
                          {selectedAdmin?.full_name ||
                            selectedAdmin?.display_name ||
                            "Unnamed Administrator"}
                        </p>

                        <p className="truncate text-sm text-slate-500">
                          {selectedAdmin?.email ||
                            "No email"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>
                      New Role
                    </Label>

                    <Select
                      value={
                        newRole
                      }
                      onValueChange={(
                        value,
                      ) =>
                        setNewRole(
                          value as AdminRole,
                        )
                      }
                      disabled={
                        actionLoading
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>

                      <SelectContent>
                        {ROLE_OPTIONS.map(
                          (
                            role,
                          ) => (
                            <SelectItem
                              key={
                                role.value
                              }
                              value={
                                role.value
                              }
                            >
                              {role.label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>

                    <p className="text-xs text-slate-500">
                      {getRoleDescription(
                        newRole,
                      )}
                    </p>
                  </div>

                  {newRole ===
                    "super_admin" && (
                    <Alert>
                      <ShieldCheck className="h-4 w-4" />

                      <AlertTitle>
                        Full administrative
                        access
                      </AlertTitle>

                      <AlertDescription>
                        This role grants the
                        administrator full
                        access to privileged
                        management operations.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    disabled={
                      actionLoading
                    }
                    onClick={() =>
                      setRoleDialogOpen(
                        false,
                      )
                    }
                  >
                    Cancel
                  </Button>

                  <Button
                    disabled={
                      actionLoading ||
                      !selectedAdmin ||
                      selectedAdmin.role ===
                        newRole
                    }
                    onClick={
                      handleChangeRole
                    }
                  >
                    {actionLoading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}

                    Update Role
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* ==================================================
                STATUS DIALOG
                ================================================== */}

            <Dialog
              open={
                statusDialogOpen
              }
              onOpenChange={(
                open,
              ) => {
                if (
                  !actionLoading
                ) {
                  setStatusDialogOpen(
                    open,
                  );
                }
              }}
            >
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {statusTarget?.is_active
                      ? "Disable Administrator"
                      : "Reactivate Administrator"}
                  </DialogTitle>

                  <DialogDescription>
                    {statusTarget?.is_active
                      ? "This administrator will no longer be able to use administrative functionality until reactivated."
                      : "This administrator will regain access to administrative functionality."}
                  </DialogDescription>
                </DialogHeader>

                <div className="rounded-lg border bg-slate-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-700 shadow-sm">
                      {getInitials(
                        statusTarget?.full_name ||
                          statusTarget?.display_name,
                        statusTarget?.email,
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {statusTarget?.full_name ||
                          statusTarget?.display_name ||
                          "Unnamed Administrator"}
                      </p>

                      <p className="truncate text-sm text-slate-500">
                        {statusTarget?.email ||
                          "No email"}
                      </p>

                      <div className="mt-2">
                        {statusTarget && (
                          <RoleBadge
                            role={
                              statusTarget.role
                            }
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {statusTarget?.is_active && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />

                    <AlertTitle>
                      Access will be disabled
                    </AlertTitle>

                    <AlertDescription>
                      The administrator will
                      remain in the administrator
                      directory but will be marked
                      inactive.
                    </AlertDescription>
                  </Alert>
                )}

                <DialogFooter>
                  <Button
                    variant="outline"
                    disabled={
                      actionLoading
                    }
                    onClick={() =>
                      setStatusDialogOpen(
                        false,
                      )
                    }
                  >
                    Cancel
                  </Button>

                  <Button
                    variant={
                      statusTarget?.is_active
                        ? "destructive"
                        : "default"
                    }
                    disabled={
                      actionLoading
                    }
                    onClick={
                      handleChangeStatus
                    }
                  >
                    {actionLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : statusTarget?.is_active ? (
                      <UserX className="mr-2 h-4 w-4" />
                    ) : (
                      <UserCheck className="mr-2 h-4 w-4" />
                    )}

                    {statusTarget?.is_active
                      ? "Disable Administrator"
                      : "Reactivate Administrator"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

          </div>
        </div>
      </AdminLayout>
    );
  };

export default AdminManagementPage;
