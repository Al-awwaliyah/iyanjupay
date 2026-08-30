import React, {
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
ShieldOff,
UserPlus,
Users,
X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/pages/admin/AdminLayout";

type AdminRole =
| "super_admin"
| "operations_admin"
| "finance_admin"
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

type AdminSummary = {
total_admins: number;
active_admins: number;
inactive_admins: number;
super_admins: number;
operations_admins: number;
finance_admins: number;
read_only_admins: number;
};

type ListResponse = {
success?: boolean;
admins?: AdminRecord[];
data?: AdminRecord[];
total?: number;
count?: number;
total_count?: number;
page?: number;
page_size?: number;
[key: string]: unknown;
};

const ROLE_OPTIONS: Array<{
value: AdminRole;
label: string;
description: string;
}> = [
{
value: "super_admin",
label: "Super Admin",
description: "Full administrative access.",
},
{
value: "operations_admin",
label: "Operations Admin",
description: "Operational and customer-management access.",
},
{
value: "finance_admin",
label: "Finance Admin",
description: "Financial and transaction-management access.",
},
{
value: "read_only_admin",
label: "Read Only Admin",
description: "View-only administrative access.",
},
];

const PAGE_SIZE = 10;

function getRoleLabel(role: string | null | undefined) {
const found = ROLE_OPTIONS.find(
(item) => item.value === role,
);

return found?.label ?? role ?? "Unknown";
}

function getRoleDescription(role: string | null | undefined) {
const found = ROLE_OPTIONS.find(
(item) => item.value === role,
);

return found?.description ?? "";
}

function getRoleBadgeClass(role: string | null | undefined) {
switch (role) {
case "super_admin":
return "bg-purple-100 text-purple-700 border-purple-200";


case "operations_admin":
  return "bg-blue-100 text-blue-700 border-blue-200";

case "finance_admin":
  return "bg-emerald-100 text-emerald-700 border-emerald-200";

case "read_only_admin":
  return "bg-slate-100 text-slate-700 border-slate-200";

default:
  return "bg-gray-100 text-gray-700 border-gray-200";

}
}

function formatDate(value: string | null | undefined) {
if (!value) {
return "Never";
}

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
const source = (fullName || email || "A").trim();

if (!source) {
return "A";
}

const parts = source.split(/\s+/).filter(Boolean);

if (parts.length >= 2) {
return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

return source.slice(0, 2).toUpperCase();
}

function extractAdmins(data: unknown): AdminRecord[] {
if (!data || typeof data !== "object") {
return [];
}

const value = data as ListResponse;

if (Array.isArray(value.admins)) {
return value.admins;
}

if (Array.isArray(value.data)) {
return value.data;
}

return [];
}

function extractTotal(
data: unknown,
fallback: number,
) {
if (!data || typeof data !== "object") {
return fallback;
}

const value = data as ListResponse;

if (typeof value.total_count === "number") {
return value.total_count;
}

if (typeof value.total === "number") {
return value.total;
}

if (typeof value.count === "number") {
return value.count;
}

return fallback;
}

function extractAdminFromRpc(data: unknown): AdminRecord | null {
if (!data || typeof data !== "object") {
return null;
}

const value = data as {
admin?: AdminRecord | null;
data?: AdminRecord | null;
};

if (value.admin && typeof value.admin === "object") {
return value.admin;
}

if (value.data && typeof value.data === "object") {
return value.data;
}

return null;
}

function getErrorMessage(error: unknown) {
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

function AdminManagementPage() {
const [admins, setAdmins] = useState<AdminRecord[]>([]);
const [summary, setSummary] = useState<AdminSummary>({
total_admins: 0,
active_admins: 0,
inactive_admins: 0,
super_admins: 0,
operations_admins: 0,
finance_admins: 0,
read_only_admins: 0,
});

const [search, setSearch] = useState("");
const [roleFilter, setRoleFilter] = useState("all");
const [statusFilter, setStatusFilter] = useState("all");

const [page, setPage] = useState(1);
const [total, setTotal] = useState(0);

const [loading, setLoading] = useState(true);
const [refreshing, setRefreshing] = useState(false);

const [error, setError] = useState("");
const [success, setSuccess] = useState("");

const [showAddModal, setShowAddModal] = useState(false);

const [selectedAdmin, setSelectedAdmin] =
useState<AdminRecord | null>(null);

const [showRoleModal, setShowRoleModal] = useState(false);

const [addLoading, setAddLoading] = useState(false);
const [roleLoading, setRoleLoading] = useState(false);
const [statusLoading, setStatusLoading] = useState(false);

const [newAdminUserId, setNewAdminUserId] = useState("");
const [newAdminRole, setNewAdminRole] =
useState<AdminRole>("read_only_admin");
const [newAdminDisplayName, setNewAdminDisplayName] =
useState("");
const [newAdminNotes, setNewAdminNotes] =
useState("");

const [newRole, setNewRole] =
useState<AdminRole>("read_only_admin");

const totalPages = useMemo(() => {
if (total <= 0) {
return 1;
}


return Math.max(1, Math.ceil(total / PAGE_SIZE));


}, [total]);

const loadSummary = useCallback(async () => {
const { data, error: rpcError } =
await supabase.rpc("admin_management_summary");


if (rpcError) {
  throw rpcError;
}

if (!data || typeof data !== "object") {
  return;
}

const value = data as Record<string, unknown>;

setSummary({
  total_admins:
    Number(
      value.total_admins ??
        value.total ??
        0,
    ) || 0,

  active_admins:
    Number(
      value.active_admins ??
        value.active ??
        0,
    ) || 0,

  inactive_admins:
    Number(
      value.inactive_admins ??
        value.inactive ??
        0,
    ) || 0,

  super_admins:
    Number(
      value.super_admins ??
        value.super_admin ??
        0,
    ) || 0,

  operations_admins:
    Number(
      value.operations_admins ??
        value.operations_admin ??
        0,
    ) || 0,

  finance_admins:
    Number(
      value.finance_admins ??
        value.finance_admin ??
        0,
    ) || 0,

  read_only_admins:
    Number(
      value.read_only_admins ??
        value.read_only_admin ??
        0,
    ) || 0,
});


}, []);

const loadAdmins = useCallback(
async (showRefreshState = false) => {
if (showRefreshState) {
setRefreshing(true);
} else {
setLoading(true);
}


  setError("");

  try {
    const normalizedSearch =
      search.trim() || null;

    const normalizedRole =
      roleFilter === "all"
        ? null
        : roleFilter;

    const normalizedStatus =
      statusFilter === "all"
        ? null
        : statusFilter === "active"
          ? true
          : false;

    const { data, error: rpcError } =
      await supabase.rpc(
        "admin_management_list",
        {
          p_search:
            normalizedSearch,
          p_role:
            normalizedRole,
          p_is_active:
            normalizedStatus,
          p_page:
            page,
          p_page_size:
            PAGE_SIZE,
        },
      );

    if (rpcError) {
      throw rpcError;
    }

    const rows =
      extractAdmins(data);

    setAdmins(rows);

    setTotal(
      extractTotal(
        data,
        rows.length,
      ),
    );

    await loadSummary();
  } catch (rpcError) {
    setAdmins([]);
    setTotal(0);

    setError(
      getErrorMessage(rpcError),
    );
  } finally {
    setLoading(false);
    setRefreshing(false);
  }
},
[
  loadSummary,
  page,
  roleFilter,
  search,
  statusFilter,
],


);

useEffect(() => {
const timer = window.setTimeout(() => {
loadAdmins();
}, 250);


return () => {
  window.clearTimeout(timer);
};


}, [
loadAdmins,
]);

const handleRefresh = async () => {
setSuccess("");
await loadAdmins(true);
};

const handleSearchChange = (
value: string,
) => {
setSearch(value);
setPage(1);
};

const handleRoleFilterChange = (
value: string,
) => {
setRoleFilter(value);
setPage(1);
};

const handleStatusFilterChange = (
value: string,
) => {
setStatusFilter(value);
setPage(1);
};

const resetAddForm = () => {
setNewAdminUserId("");
setNewAdminRole(
"read_only_admin",
);
setNewAdminDisplayName("");
setNewAdminNotes("");
};

const closeAddModal = () => {
if (addLoading) {
return;
}


setShowAddModal(false);
resetAddForm();


};

const handleAddAdmin = async (
event: React.FormEvent,
) => {
event.preventDefault();


setError("");
setSuccess("");

const userId =
  newAdminUserId.trim();

if (!userId) {
  setError(
    "Enter the user's Supabase Auth user ID.",
  );
  return;
}

setAddLoading(true);

try {
  const { data, error: rpcError } =
    await supabase.rpc(
      "admin_management_add",
      {
        p_admin_user_id: userId,
        p_role: newAdminRole,
        p_display_name:
          newAdminDisplayName.trim() ||
          null,
        p_notes:
          newAdminNotes.trim() ||
          null,
      },
    );

  if (rpcError) {
    throw rpcError;
  }

  const createdAdmin =
    extractAdminFromRpc(data);

  setSuccess(
    createdAdmin
      ? `${getRoleLabel(
          createdAdmin.role,
        )} added successfully.`
      : "Administrator added successfully.",
  );

  closeAddModal();

  setPage(1);

  await loadAdmins(true);
} catch (rpcError) {
  setError(
    getErrorMessage(rpcError),
  );
} finally {
  setAddLoading(false);
}


};

const openRoleModal = (
admin: AdminRecord,
) => {
setSelectedAdmin(admin);


setNewRole(
  ROLE_OPTIONS.some(
    (item) =>
      item.value === admin.role,
  )
    ? (admin.role as AdminRole)
    : "read_only_admin",
);

setShowRoleModal(true);
setError("");
setSuccess("");

};

const closeRoleModal = () => {
if (roleLoading) {
return;
}


setShowRoleModal(false);
setSelectedAdmin(null);

};

const handleChangeRole = async (
event: React.FormEvent,
) => {
event.preventDefault();

if (!selectedAdmin) {
  return;
}

if (
  selectedAdmin.role === newRole
) {
  setSuccess(
    "No role change was necessary.",
  );
  closeRoleModal();
  return;
}

setRoleLoading(true);
setError("");
setSuccess("");

try {
  const { error: rpcError } =
    await supabase.rpc(
      "admin_management_change_role",
      {
        p_admin_user_id:
          selectedAdmin.user_id,
        p_new_role: newRole,
      },
    );

  if (rpcError) {
    throw rpcError;
  }

  setSuccess(
    `Administrator role changed to ${getRoleLabel(
      newRole,
    )}.`,
  );

  closeRoleModal();

  await loadAdmins(true);
} catch (rpcError) {
  setError(
    getErrorMessage(rpcError),
  );
} finally {
  setRoleLoading(false);
}


};

const handleToggleStatus = async (
admin: AdminRecord,
) => {
const action = admin.is_active
? "deactivate"
: "activate";


const confirmed =
  window.confirm(
    `Are you sure you want to ${action} ${admin.email || "this administrator"}?`,
  );

if (!confirmed) {
  return;
}

setStatusLoading(true);
setError("");
setSuccess("");

try {
  const { error: rpcError } =
    await supabase.rpc(
      "admin_management_set_status",
      {
        p_admin_user_id:
          admin.user_id,
        p_is_active:
          !admin.is_active,
      },
    );

  if (rpcError) {
    throw rpcError;
  }

  setSuccess(
    admin.is_active
      ? "Administrator disabled successfully."
      : "Administrator reactivated successfully.",
  );

  await loadAdmins(true);
} catch (rpcError) {
  setError(
    getErrorMessage(rpcError),
  );
} finally {
  setStatusLoading(false);
}


};

const stats = [
{
label: "Total Admins",
value: summary.total_admins,
icon: Users,
},
{
label: "Active",
value: summary.active_admins,
icon: CheckCircle2,
},
{
label: "Inactive",
value: summary.inactive_admins,
icon: ShieldOff,
},
{
label: "Super Admins",
value: summary.super_admins,
icon: ShieldCheck,
},
];

return ( <AdminLayout> <div className="min-h-screen bg-slate-50"> <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8"> <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"> <div> <div className="mb-2 flex items-center gap-2 text-sm text-slate-500"> <Shield className="h-4 w-4" /> <span>Administration</span> <span>/</span> <span>Admin Management</span> </div>


          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Admin Management
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Manage administrator accounts,
            roles, access status, and
            administrative permissions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                refreshing
                  ? "animate-spin"
                  : ""
              }`}
            />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => {
              setError("");
              setSuccess("");
              setShowAddModal(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <UserPlus className="h-4 w-4" />
            Add Admin
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              Operation failed
            </p>
            <p className="mt-1 break-words">
              {error}
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setError("")
            }
            className="rounded-md p-1 hover:bg-red-100"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />

          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              Success
            </p>

            <p className="mt-1">
              {success}
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setSuccess("")
            }
            className="rounded-md p-1 hover:bg-emerald-100"
            aria-label="Dismiss success message"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.label}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    {item.label}
                  </p>

                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {item.value}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-100 p-3">
                  <Icon className="h-5 w-5 text-slate-700" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Operations
          </p>

          <p className="mt-1 text-xl font-bold text-slate-900">
            {summary.operations_admins}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Finance
          </p>

          <p className="mt-1 text-xl font-bold text-slate-900">
            {summary.finance_admins}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Read Only
          </p>

          <p className="mt-1 text-xl font-bold text-slate-900">
            {summary.read_only_admins}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  handleSearchChange(
                    event.target.value,
                  )
                }
                placeholder="Search administrators..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(event) =>
                handleRoleFilterChange(
                  event.target.value,
                )
              }
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400"
            >
              <option value="all">
                All Roles
              </option>

              {ROLE_OPTIONS.map(
                (role) => (
                  <option
                    key={role.value}
                    value={role.value}
                  >
                    {role.label}
                  </option>
                ),
              )}
            </select>

            <select
              value={statusFilter}
              onChange={(event) =>
                handleStatusFilterChange(
                  event.target.value,
                )
              }
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400"
            >
              <option value="all">
                All Statuses
              </option>

              <option value="active">
                Active
              </option>

              <option value="inactive">
                Inactive
              </option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <Loader2 className="h-7 w-7 animate-spin" />
              <span className="text-sm">
                Loading administrators...
              </span>
            </div>
          </div>
        ) : admins.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 rounded-full bg-slate-100 p-4">
              <Users className="h-7 w-7 text-slate-400" />
            </div>

            <h3 className="text-base font-semibold text-slate-900">
              No administrators found
            </h3>

            <p className="mt-1 max-w-md text-sm text-slate-500">
              No administrator accounts
              match the current search
              and filter settings.
            </p>

            <button
              type="button"
              onClick={() => {
                setSearch("");
                setRoleFilter("all");
                setStatusFilter("all");
                setPage(1);
              }}
              className="mt-4 text-sm font-semibold text-slate-900 underline underline-offset-4"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-left">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Administrator
                    </th>

                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Role
                    </th>

                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </th>

                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Created
                    </th>

                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Last Sign In
                    </th>

                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {admins.map(
                    (admin) => (
                      <tr
                        key={
                          admin.user_id
                        }
                        className="transition hover:bg-slate-50/70"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                              {getInitials(
                                admin.full_name,
                                admin.email,
                              )}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {admin.full_name ||
                                  admin.display_name ||
                                  "Administrator"}
                              </p>

                              <p className="truncate text-xs text-slate-500">
                                {admin.email ||
                                  "No email"}
                              </p>

                              <p className="mt-0.5 max-w-[280px] truncate font-mono text-[10px] text-slate-400">
                                {admin.user_id}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div>
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getRoleBadgeClass(
                                admin.role,
                              )}`}
                            >
                              {getRoleLabel(
                                admin.role,
                              )}
                            </span>

                            <p className="mt-1 max-w-[220px] text-xs text-slate-400">
                              {getRoleDescription(
                                admin.role,
                              )}
                            </p>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          {admin.is_active ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                              Inactive
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {formatDate(
                            admin.created_at,
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {formatDate(
                            admin.last_sign_in_at,
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                openRoleModal(
                                  admin,
                                )
                              }
                              disabled={
                                statusLoading
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              Role
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleToggleStatus(
                                  admin,
                                )
                              }
                              disabled={
                                statusLoading
                              }
                              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                admin.is_active
                                  ? "bg-red-50 text-red-700 hover:bg-red-100"
                                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              }`}
                            >
                              {statusLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : admin.is_active ? (
                                <ShieldOff className="h-3.5 w-3.5" />
                              ) : (
                                <ShieldCheck className="h-3.5 w-3.5" />
                              )}

                              {admin.is_active
                                ? "Disable"
                                : "Activate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Showing{" "}
                <span className="font-semibold text-slate-700">
                  {admins.length}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-slate-700">
                  {total}
                </span>{" "}
                administrators
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={
                    page <= 1 ||
                    loading
                  }
                  onClick={() =>
                    setPage(
                      (current) =>
                        Math.max(
                          1,
                          current - 1,
                        ),
                    )
                  }
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>

                <span className="px-2 text-sm text-slate-500">
                  Page{" "}
                  <span className="font-semibold text-slate-800">
                    {page}
                  </span>{" "}
                  of{" "}
                  <span className="font-semibold text-slate-800">
                    {totalPages}
                  </span>
                </span>

                <button
                  type="button"
                  disabled={
                    page >=
                      totalPages ||
                    loading
                  }
                  onClick={() =>
                    setPage(
                      (current) =>
                        Math.min(
                          totalPages,
                          current + 1,
                        ),
                    )
                  }
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Activity className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />

        <div>
          <p className="text-sm font-semibold text-slate-800">
            Administrative actions are
            audited
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            Adding administrators, changing
            administrator roles, and changing
            administrator status are protected
            by the server-side super-admin
            authorization layer and are recorded
            in the administrative audit log.
          </p>
        </div>
      </div>
    </div>
  </div>

  {showAddModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div
        className="absolute inset-0"
        onClick={closeAddModal}
      />

      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
              <UserPlus className="h-5 w-5 text-slate-700" />
            </div>

            <h2 className="text-lg font-bold text-slate-900">
              Add Administrator
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Add an existing authenticated
              user as an administrator.
            </p>
          </div>

          <button
            type="button"
            onClick={closeAddModal}
            disabled={addLoading}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={handleAddAdmin}
          className="space-y-5 p-5"
        >
          <div>
            <label
              htmlFor="admin-user-id"
              className="mb-1.5 block text-sm font-semibold text-slate-700"
            >
              User ID
            </label>

            <input
              id="admin-user-id"
              type="text"
              value={newAdminUserId}
              onChange={(event) =>
                setNewAdminUserId(
                  event.target.value,
                )
              }
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              disabled={addLoading}
              required
              className="h-11 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-50"
            />

            <p className="mt-1.5 text-xs text-slate-400">
              This must be the UUID of an existing
              user in Supabase Auth.
            </p>
          </div>

          <div>
            <label
              htmlFor="admin-role"
              className="mb-1.5 block text-sm font-semibold text-slate-700"
            >
              Administrator Role
            </label>

            <select
              id="admin-role"
              value={newAdminRole}
              onChange={(event) =>
                setNewAdminRole(
                  event.target
                    .value as AdminRole,
                )
              }
              disabled={addLoading}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
            >
              {ROLE_OPTIONS.map(
                (role) => (
                  <option
                    key={role.value}
                    value={role.value}
                  >
                    {role.label}
                  </option>
                ),
              )}
            </select>

            <p className="mt-1.5 text-xs text-slate-400">
              {getRoleDescription(
                newAdminRole,
              )}
            </p>
          </div>

          <div>
            <label
              htmlFor="admin-display-name"
              className="mb-1.5 block text-sm font-semibold text-slate-700"
            >
              Display Name
              <span className="ml-1 font-normal text-slate-400">
                Optional
              </span>
            </label>

            <input
              id="admin-display-name"
              type="text"
              value={
                newAdminDisplayName
              }
              onChange={(event) =>
                setNewAdminDisplayName(
                  event.target.value,
                )
              }
              placeholder="e.g. Operations Manager"
              disabled={addLoading}
              className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-50"
            />
          </div>

          <div>
            <label
              htmlFor="admin-notes"
              className="mb-1.5 block text-sm font-semibold text-slate-700"
            >
              Notes
              <span className="ml-1 font-normal text-slate-400">
                Optional
              </span>
            </label>

            <textarea
              id="admin-notes"
              value={newAdminNotes}
              onChange={(event) =>
                setNewAdminNotes(
                  event.target.value,
                )
              }
              placeholder="Optional internal notes..."
              rows={3}
              disabled={addLoading}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-50"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={closeAddModal}
              disabled={addLoading}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                addLoading ||
                !newAdminUserId.trim()
              }
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add Administrator
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )}

  {showRoleModal &&
    selectedAdmin && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
        <div
          className="absolute inset-0"
          onClick={closeRoleModal}
        />

        <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl">
          <div className="flex items-start justify-between border-b border-slate-200 p-5">
            <div>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                <Edit3 className="h-5 w-5 text-slate-700" />
              </div>

              <h2 className="text-lg font-bold text-slate-900">
                Change Administrator Role
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {selectedAdmin.email ||
                  selectedAdmin.full_name ||
                  "Administrator"}
              </p>
            </div>

            <button
              type="button"
              onClick={closeRoleModal}
              disabled={roleLoading}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form
            onSubmit={handleChangeRole}
            className="space-y-5 p-5"
          >
            <div>
              <label
                htmlFor="change-admin-role"
                className="mb-1.5 block text-sm font-semibold text-slate-700"
              >
                New Role
              </label>

              <select
                id="change-admin-role"
                value={newRole}
                onChange={(event) =>
                  setNewRole(
                    event.target
                      .value as AdminRole,
                  )
                }
                disabled={roleLoading}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              >
                {ROLE_OPTIONS.map(
                  (role) => (
                    <option
                      key={role.value}
                      value={role.value}
                    >
                      {role.label}
                    </option>
                  ),
                )}
              </select>

              <p className="mt-2 text-xs leading-5 text-slate-500">
                {getRoleDescription(
                  newRole,
                )}
              </p>
            </div>

            {selectedAdmin.role ===
              "super_admin" &&
              newRole !==
                "super_admin" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  This will remove the
                  administrator's super-admin
                  privileges.
                </div>
              )}

            {selectedAdmin.role !==
              "super_admin" &&
              newRole ===
                "super_admin" && (
                <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs leading-5 text-purple-800">
                  This grants full
                  administrator privileges.
                  Only assign this role to a
                  trusted administrator.
                </div>
              )}

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={closeRoleModal}
                disabled={roleLoading}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={
                  roleLoading ||
                  selectedAdmin.role ===
                    newRole
                }
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {roleLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4" />
                    Update Role
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
</AdminLayout>

);
}

export default AdminManagementPage;
