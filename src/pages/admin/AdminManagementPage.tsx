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
  Plus,
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
  role: AdminRole | string;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
  last_sign_in_at?: string | null;
  display_name?: string | null;
  notes?: string | null;
};

type AdminListResponse = {
  success?: boolean;
  admins?: AdminRecord[];
  data?: AdminRecord[];
  total?: number;
  total_count?: number;
  page?: number;
  page_size?: number;
  pages?: number;
  summary?: {
    total?: number;
    active?: number;
    inactive?: number;
    super_admin?: number;
    operations_admin?: number;
    finance_admin?: number;
    read_only_admin?: number;
  };
};

type AdminSummary = {
  total: number;
  active: number;
  inactive: number;
  super_admin: number;
  operations_admin: number;
  finance_admin: number;
  read_only_admin: number;
};

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

const PAGE_SIZE = 10;

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
    value: "finance_admin",
    label: "Finance Admin",
    description: "Finance and financial operations",
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
  finance_admin: "Finance Admin",
  read_only_admin: "Read Only Admin",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  super_admin: "Full administrative access",
  operations_admin: "Operational and transaction management",
  finance_admin: "Finance and financial operations",
  read_only_admin: "View-only administrative access",
};

function getRoleLabel(role: string | null | undefined) {
  if (!role) return "Unknown";
  return ROLE_LABELS[role] ?? role;
}

function getRoleDescription(role: string | null | undefined) {
  if (!role) return "";
  return ROLE_DESCRIPTIONS[role] ?? "";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}

function getInitials(
  fullName: string | null | undefined,
  email: string | null | undefined,
) {
  const source = fullName?.trim() || email?.trim() || "Admin";

  const parts = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return parts
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function normalizeListResponse(response: unknown): {
  admins: AdminRecord[];
  total: number;
} {
  if (!response || typeof response !== "object") {
    return {
      admins: [],
      total: 0,
    };
  }

  const value = response as AdminListResponse;

  const admins = Array.isArray(value.admins)
    ? value.admins
    : Array.isArray(value.data)
      ? value.data
      : [];

  const total =
    typeof value.total === "number"
      ? value.total
      : typeof value.total_count === "number"
        ? value.total_count
        : admins.length;

  return {
    admins,
    total,
  };
}

function extractRpcError(error: unknown) {
  if (!error) {
    return "An unexpected error occurred.";
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object") {
    const value = error as {
      message?: string;
      details?: string;
      hint?: string;
    };

    if (value.message) {
      return value.message;
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

function RoleBadge({ role }: { role: string }) {
  const isSuperAdmin = role === "super_admin";

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
        "text-xs font-medium",
        isSuperAdmin
          ? "bg-amber-100 text-amber-800"
          : role === "operations_admin"
            ? "bg-blue-100 text-blue-800"
            : role === "finance_admin"
              ? "bg-emerald-100 text-emerald-800"
              : "bg-slate-100 text-slate-700",
      ].join(" ")}
    >
      {isSuperAdmin ? (
        <ShieldCheck className="h-3.5 w-3.5" />
      ) : (
        <Shield className="h-3.5 w-3.5" />
      )}
      {getRoleLabel(role)}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
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

const AdminManagementPage: React.FC = () => {
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [total, setTotal] = useState(0);

  const [summary, setSummary] = useState<AdminSummary>({
    total: 0,
    active: 0,
    inactive: 0,
    super_admin: 0,
    operations_admin: 0,
    finance_admin: 0,
    read_only_admin: 0,
  });

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [toast, setToast] = useState<ToastState>(null);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);

  const [selectedAdmin, setSelectedAdmin] =
    useState<AdminRecord | null>(null);

  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] =
    useState<AdminRole>("operations_admin");
  const [addDisplayName, setAddDisplayName] = useState("");
  const [addNotes, setAddNotes] = useState("");

  const [newRole, setNewRole] =
    useState<AdminRole>("operations_admin");

  const [statusTarget, setStatusTarget] =
    useState<AdminRecord | null>(null);

  const [actionLoading, setActionLoading] = useState(false);

  const [currentAdminId, setCurrentAdminId] = useState<string | null>(
    null,
  );

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }, [total]);

  const showToast = useCallback(
    (type: "success" | "error", message: string) => {
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

  const loadCurrentUser = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setCurrentAdminId(user?.id ?? null);
  }, []);

  const loadSummary = useCallback(async () => {
    const { data, error } = await supabase.rpc(
      "admin_management_summary",
    );

    if (error) {
      throw error;
    }

    if (!data) {
      return;
    }

    const raw = Array.isArray(data) ? data[0] : data;

    if (!raw || typeof raw !== "object") {
      return;
    }

    const value = raw as Record<string, unknown>;

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

      finance_admin:
        Number(
          value.finance_admin ??
            value.finance_admins ??
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

  const loadAdmins = useCallback(
    async (showRefresh = false) => {
      try {
        if (showRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const normalizedSearch = search.trim() || null;

        const role =
          roleFilter === "all"
            ? null
            : roleFilter;

        let isActive: boolean | null = null;

        if (activeFilter === "active") {
          isActive = true;
        } else if (activeFilter === "inactive") {
          isActive = false;
        }

        const { data, error } = await supabase.rpc(
          "admin_management_list",
          {
            p_search: normalizedSearch,
            p_role: role,
            p_is_active: isActive,
            p_limit: PAGE_SIZE,
            p_offset: (page - 1) * PAGE_SIZE,
          },
        );

        if (error) {
          throw error;
        }

        const normalized = normalizeListResponse(data);

        setAdmins(normalized.admins);
        setTotal(normalized.total);

        await loadSummary();
      } catch (error) {
        console.error(
          "Failed to load administrator management data:",
          error,
        );

        showToast(
          "error",
          extractRpcError(error),
        );
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

  useEffect(() => {
    void loadCurrentUser();
  }, [loadCurrentUser]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAdmins();
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    loadAdmins,
  ]);

  const handleRefresh = async () => {
    await loadAdmins(true);
  };

  const resetAddForm = () => {
    setAddUserId("");
    setAddRole("operations_admin");
    setAddDisplayName("");
    setAddNotes("");
  };

  const handleAddAdmin = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const userId = addUserId.trim();

    if (!userId) {
      showToast(
        "error",
        "Admin user ID is required.",
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

      const { data, error } = await supabase.rpc(
        "admin_management_add",
        {
          p_admin_user_id: userId,
          p_role: addRole,
          p_display_name:
            addDisplayName.trim() || null,
          p_notes:
            addNotes.trim() || null,
        },
      );

      if (error) {
        throw error;
      }

      if (
        !data ||
        typeof data !== "object" ||
        !(data as Record<string, unknown>).success
      ) {
        throw new Error(
          "Administrator creation did not complete successfully.",
        );
      }

      setAddDialogOpen(false);
      resetAddForm();

      showToast(
        "success",
        "Administrator added successfully.",
      );

      await loadAdmins(true);
    } catch (error) {
      console.error(
        "Failed to add administrator:",
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

  const openRoleDialog = (admin: AdminRecord) => {
    if (admin.user_id === currentAdminId) {
      showToast(
        "error",
        "You cannot change your own administrator role.",
      );
      return;
    }

    setSelectedAdmin(admin);

    const existingRole =
      ROLE_OPTIONS.some(
        (option) => option.value === admin.role,
      )
        ? (admin.role as AdminRole)
        : "read_only_admin";

    setNewRole(existingRole);
    setRoleDialogOpen(true);
  };

  const handleChangeRole = async () => {
    if (!selectedAdmin) {
      return;
    }

    if (selectedAdmin.user_id === currentAdminId) {
      showToast(
        "error",
        "You cannot change your own administrator role.",
      );
      return;
    }

    if (selectedAdmin.role === newRole) {
      setRoleDialogOpen(false);
      return;
    }

    try {
      setActionLoading(true);

      const { data, error } = await supabase.rpc(
        "admin_management_change_role",
        {
          p_admin_user_id:
            selectedAdmin.user_id,
          p_new_role: newRole,
        },
      );

      if (error) {
        throw error;
      }

      if (
        !data ||
        typeof data !== "object" ||
        !(data as Record<string, unknown>).success
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

      await loadAdmins(true);
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

  const openStatusDialog = (admin: AdminRecord) => {
    if (admin.user_id === currentAdminId) {
      showToast(
        "error",
        "You cannot disable or deactivate your own administrator account.",
      );
      return;
    }

    setStatusTarget(admin);
    setStatusDialogOpen(true);
  };

  const handleChangeStatus = async () => {
    if (!statusTarget) {
      return;
    }

    if (statusTarget.user_id === currentAdminId) {
      showToast(
        "error",
        "You cannot disable or deactivate your own administrator account.",
      );
      return;
    }

    const nextStatus = !statusTarget.is_active;

    try {
      setActionLoading(true);

      const { data, error } = await supabase.rpc(
        "admin_management_set_status",
        {
          p_admin_user_id:
            statusTarget.user_id,
          p_is_active: nextStatus,
        },
      );

      if (error) {
        throw error;
      }

      if (
        !data ||
        typeof data !== "object" ||
        !(data as Record<string, unknown>).success
      ) {
        throw new Error(
          "Administrator status update did not complete successfully.",
        );
      }

      setStatusDialogOpen(false);
      setStatusTarget(null);

      showToast(
        "success",
        nextStatus
          ? "Administrator reactivated successfully."
          : "Administrator disabled successfully.",
      );

      await loadAdmins(true);
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

  return (
    <AdminLayout>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {toast && (
            <div className="fixed right-4 top-4 z-[100] w-[min(420px,calc(100vw-2rem))]">
              <Alert
                variant={
                  toast.type === "error"
                    ? "destructive"
                    : "default"
                }
              >
                {toast.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}

                <AlertTitle>
                  {toast.type === "success"
                    ? "Success"
                    : "Error"}
                </AlertTitle>

                <AlertDescription>
                  {toast.message}
                </AlertDescription>
              </Alert>
            </div>
          )}

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
                Manage administrator accounts, roles,
                access status, and administrative permissions.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={refreshing || loading}
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
                  setAddDialogOpen(true);
                }}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Add Admin
              </Button>
            </div>
          </div>

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
                          summary.finance_admin +
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
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Search by name, email, or user ID..."
                    className="pl-9"
                  />
                </div>

                <Select
                  value={roleFilter}
                  onValueChange={(value) => {
                    setRoleFilter(value);
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

                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem
                        key={role.value}
                        value={role.value}
                      >
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={activeFilter}
                  onValueChange={(value) => {
                    setActiveFilter(value);
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
                  onClick={clearFilters}
                  disabled={!hasFilters}
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
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
                  ) : admins.length === 0 ? (
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
                    admins.map((admin) => {
                      const isCurrentAdmin =
                        admin.user_id === currentAdminId;

                      return (
                        <tr
                          key={admin.user_id}
                          className="transition-colors hover:bg-slate-50/80"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                                {getInitials(
                                  admin.full_name ||
                                    admin.display_name,
                                  admin.email,
                                )}
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="truncate font-medium text-slate-900">
                                    {admin.full_name ||
                                      admin.display_name ||
                                      "Unnamed Administrator"}
                                  </p>

                                  {isCurrentAdmin && (
                                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                      YOU
                                    </span>
                                  )}
                                </div>

                                <p className="truncate text-sm text-slate-500">
                                  {admin.email || "No email"}
                                </p>

                                <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                                  {admin.user_id}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-4 align-middle">
                            <div>
                              <RoleBadge role={admin.role} />

                              <p className="mt-1 text-xs text-slate-500">
                                {getRoleDescription(
                                  admin.role,
                                )}
                              </p>
                            </div>
                          </td>

                          <td className="px-5 py-4 align-middle">
                            <StatusBadge
                              active={admin.is_active}
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
                                disabled={isCurrentAdmin}
                                onClick={() =>
                                  openRoleDialog(admin)
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
                                disabled={isCurrentAdmin}
                                onClick={() =>
                                  openStatusDialog(admin)
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
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                {total === 0
                  ? "No administrators"
                  : `Showing ${
                      (page - 1) * PAGE_SIZE + 1
                    }–${Math.min(
                      page * PAGE_SIZE,
                      total,
                    )} of ${total}`}
              </p>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() =>
                    setPage((current) =>
                      Math.max(1, current - 1),
                    )
                  }
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>

                <span className="min-w-[100px] text-center text-sm text-slate-600">
                  Page {page} of {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    page >= totalPages ||
                    loading
                  }
                  onClick={() =>
                    setPage((current) =>
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
        </div>

        <Dialog
          open={addDialogOpen}
          onOpenChange={(open) => {
            if (!actionLoading) {
              setAddDialogOpen(open);
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Add Administrator
              </DialogTitle>

              <DialogDescription>
                Add an existing IyanjuPay user as an
                administrator. The user must already exist
                in Supabase Auth.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={handleAddAdmin}
              className="space-y-5"
            >
              <div className="space-y-2">
                <Label htmlFor="admin-user-id">
                  User ID
                </Label>

                <Input
                  id="admin-user-id"
                  value={addUserId}
                  onChange={(event) =>
                    setAddUserId(event.target.value)
                  }
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  disabled={actionLoading}
                  autoComplete="off"
                />

                <p className="text-xs text-slate-500">
                  Enter the UUID of the existing
                  authenticated user.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-role">
                  Administrator Role
                </Label>

                <Select
                  value={addRole}
                  onValueChange={(value) =>
                    setAddRole(value as AdminRole)
                  }
                  disabled={actionLoading}
                >
                  <SelectTrigger id="admin-role">
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem
                        key={role.value}
                        value={role.value}
                      >
                        <div className="flex flex-col">
                          <span>
                            {role.label}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <p className="text-xs text-slate-500">
                  {getRoleDescription(addRole)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-display-name">
                  Display Name
                  <span className="ml-1 font-normal text-slate-400">
                    (optional)
                  </span>
                </Label>

                <Input
                  id="admin-display-name"
                  value={addDisplayName}
                  onChange={(event) =>
                    setAddDisplayName(
                      event.target.value,
                    )
                  }
                  placeholder="e.g. Finance Manager"
                  disabled={actionLoading}
                />
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
                  value={addNotes}
                  onChange={(event) =>
                    setAddNotes(event.target.value)
                  }
                  placeholder="Administrative notes..."
                  disabled={actionLoading}
                  rows={3}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              {addRole === "super_admin" && (
                <Alert>
                  <ShieldCheck className="h-4 w-4" />

                  <AlertTitle>
                    High-privilege role
                  </AlertTitle>

                  <AlertDescription>
                    Super Admin has full administrative
                    access. Only assign this role to a
                    trusted administrator.
                  </AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={actionLoading}
                  onClick={() =>
                    setAddDialogOpen(false)
                  }
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Add Administrator
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={roleDialogOpen}
          onOpenChange={(open) => {
            if (!actionLoading) {
              setRoleDialogOpen(open);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                Change Administrator Role
              </DialogTitle>

              <DialogDescription>
                Update the administrative role for{" "}
                <strong>
                  {selectedAdmin?.full_name ||
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
                  value={newRole}
                  onValueChange={(value) =>
                    setNewRole(value as AdminRole)
                  }
                  disabled={actionLoading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem
                        key={role.value}
                        value={role.value}
                      >
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <p className="text-xs text-slate-500">
                  {getRoleDescription(newRole)}
                </p>
              </div>

              {newRole === "super_admin" && (
                <Alert>
                  <ShieldCheck className="h-4 w-4" />

                  <AlertTitle>
                    Full administrative access
                  </AlertTitle>

                  <AlertDescription>
                    This role grants the administrator
                    full access to privileged management
                    operations.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                disabled={actionLoading}
                onClick={() =>
                  setRoleDialogOpen(false)
                }
              >
                Cancel
              </Button>

              <Button
                disabled={
                  actionLoading ||
                  !selectedAdmin ||
                  selectedAdmin.role === newRole
                }
                onClick={handleChangeRole}
              >
                {actionLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}

                Update Role
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={statusDialogOpen}
          onOpenChange={(open) => {
            if (!actionLoading) {
              setStatusDialogOpen(open);
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
                        role={statusTarget.role}
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
                  The administrator will remain in the
                  administrator directory but will be
                  marked inactive.
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                disabled={actionLoading}
                onClick={() =>
                  setStatusDialogOpen(false)
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
                disabled={actionLoading}
                onClick={handleChangeStatus}
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
    </AdminLayout>
  );
};

export default AdminManagementPage;
