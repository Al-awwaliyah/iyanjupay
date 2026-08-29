import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Filter,
  Fingerprint,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  User,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

import AdminLayout from "@/pages/admin/AdminLayout";

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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

import { useToast } from "@/components/ui/use-toast";


// ============================================================
// TYPES
// ============================================================

type AuditLog = {
  id: string;

  admin_user_id: string | null;

  admin_email: string | null;

  admin_name: string | null;

  admin_role: string | null;

  category: string;

  action: string;

  description: string | null;

  target_type: string | null;

  target_id: string | null;

  user_id: string | null;

  transaction_id: string | null;

  dispute_id: string | null;

  before_data: Record<string, any> | null;

  after_data: Record<string, any> | null;

  metadata: Record<string, any> | null;

  ip_address: string | null;

  user_agent: string | null;

  device_info: Record<string, any> | null;

  created_at: string;
};


type AuditListResponse = {
  items?: AuditLog[];

  total?: number;

  limit?: number;

  offset?: number;

  generated_at?: string;
};


type AuditSummary = {
  total: number;

  today: number;

  active_admins: number;

  categories: Record<string, number>;

  generated_at?: string;
};


// ============================================================
// CONSTANTS
// ============================================================

const PAGE_SIZE = 50;


// ============================================================
// HELPERS
// ============================================================

function formatDate(
  value: string | null,
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString(
    "en-NG",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  );
}


function formatShortDate(
  value: string | null,
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString(
    "en-NG",
    {
      dateStyle: "medium",
    },
  );
}


function shortenId(
  value: string | null,
  length = 16,
) {
  if (!value) {
    return "—";
  }

  if (value.length <= length) {
    return value;
  }

  return `${value.slice(
    0,
    length,
  )}…`;
}


function titleCase(
  value: string | null,
) {
  if (!value) {
    return "—";
  }

  return value
    .replace(/[_-]+/g, " ")
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}


function getInitialSummary(): AuditSummary {
  return {
    total: 0,

    today: 0,

    active_admins: 0,

    categories: {},
  };
}


function categoryClass(
  category: string,
) {
  switch (
    category.toLowerCase()
  ) {
    case "authentication":
    case "auth":
      return "border-blue-200 bg-blue-100 text-blue-700";

    case "transaction":
    case "finance":
      return "border-emerald-200 bg-emerald-100 text-emerald-700";

    case "customer":
    case "user":
      return "border-purple-200 bg-purple-100 text-purple-700";

    case "dispute":
      return "border-amber-200 bg-amber-100 text-amber-700";

    case "settings":
      return "border-orange-200 bg-orange-100 text-orange-700";

    case "admin":
    case "administration":
      return "border-indigo-200 bg-indigo-100 text-indigo-700";

    case "security":
      return "border-red-200 bg-red-100 text-red-700";

    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}


function actionClass(
  action: string,
) {
  const normalized =
    action.toLowerCase();

  if (
    normalized.includes("delete") ||
    normalized.includes("disable") ||
    normalized.includes("reject") ||
    normalized.includes("fail")
  ) {
    return "border-red-200 bg-red-100 text-red-700";
  }

  if (
    normalized.includes("create") ||
    normalized.includes("approve") ||
    normalized.includes("enable") ||
    normalized.includes("success") ||
    normalized.includes("complete")
  ) {
    return "border-emerald-200 bg-emerald-100 text-emerald-700";
  }

  if (
    normalized.includes("update") ||
    normalized.includes("edit") ||
    normalized.includes("change")
  ) {
    return "border-blue-200 bg-blue-100 text-blue-700";
  }

  if (
    normalized.includes("login") ||
    normalized.includes("logout")
  ) {
    return "border-purple-200 bg-purple-100 text-purple-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-700";
}


function safeJson(
  value: Record<string, any> | null,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  try {
    return JSON.stringify(
      value,
      null,
      2,
    );
  } catch {
    return "Unable to display JSON";
  }
}


// ============================================================
// COMPONENT
// ============================================================

function AuditLogsPage() {
  const { toast } =
    useToast();


  // ==========================================================
  // DATA
  // ==========================================================

  const [rows, setRows] =
    useState<AuditLog[]>([]);

  const [summary, setSummary] =
    useState<AuditSummary>(
      getInitialSummary(),
    );

  const [total, setTotal] =
    useState(0);


  // ==========================================================
  // LOADING
  // ==========================================================

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [detailLoading, setDetailLoading] =
    useState(false);


  // ==========================================================
  // FILTERS
  // ==========================================================

  const [search, setSearch] =
    useState("");

  const [categoryFilter, setCategoryFilter] =
    useState("all");

  const [actionFilter, setActionFilter] =
    useState("all");

  const [roleFilter, setRoleFilter] =
    useState("all");

  const [targetTypeFilter, setTargetTypeFilter] =
    useState("all");

  const [startDate, setStartDate] =
    useState("");

  const [endDate, setEndDate] =
    useState("");

  const [page, setPage] =
    useState(1);


  // ==========================================================
  // DETAIL
  // ==========================================================

  const [
    selectedAuditLog,
    setSelectedAuditLog,
  ] = useState<AuditLog | null>(
    null,
  );

  const [detailOpen, setDetailOpen] =
    useState(false);


  // ==========================================================
  // RESET FILTERS
  // ==========================================================

  const resetFilters =
    useCallback(() => {
      setSearch("");

      setCategoryFilter("all");

      setActionFilter("all");

      setRoleFilter("all");

      setTargetTypeFilter("all");

      setStartDate("");

      setEndDate("");

      setPage(1);
    }, []);


  // ==========================================================
  // FETCH SUMMARY
  // ==========================================================

  const fetchSummary =
    useCallback(
      async () => {
        const {
          data,
          error,
        } = await supabase.rpc(
          "admin_audit_logs_summary",
          {
            p_start_at: startDate
              ? new Date(
                  `${startDate}T00:00:00`,
                ).toISOString()
              : null,

            p_end_at: endDate
              ? new Date(
                  `${endDate}T23:59:59.999`,
                ).toISOString()
              : null,
          },
        );

        if (error) {
          throw error;
        }

        const result =
          data as
            | AuditSummary
            | null;

        if (!result) {
          setSummary(
            getInitialSummary(),
          );

          return;
        }

        setSummary({
          total: Number(
            result.total || 0,
          ),

          today: Number(
            result.today || 0,
          ),

          active_admins: Number(
            result.active_admins || 0,
          ),

          categories:
            result.categories || {},

          generated_at:
            result.generated_at,
        });
      },
      [
        startDate,
        endDate,
      ],
    );


  // ==========================================================
  // FETCH AUDIT LOGS
  // ==========================================================

  const fetchRows =
    useCallback(
      async (
        showRefresh = false,
      ) => {
        if (showRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        try {
          const {
            data,
            error,
          } = await supabase.rpc(
            "admin_audit_logs_list",
            {
              p_search:
                search.trim() ||
                null,

              p_category:
                categoryFilter ===
                "all"
                  ? null
                  : categoryFilter,

              p_action:
                actionFilter ===
                "all"
                  ? null
                  : actionFilter,

              p_admin_user_id:
                null,

              p_admin_role:
                roleFilter ===
                "all"
                  ? null
                  : roleFilter,

              p_target_type:
                targetTypeFilter ===
                "all"
                  ? null
                  : targetTypeFilter,

              p_target_id:
                null,

              p_user_id:
                null,

              p_transaction_id:
                null,

              p_dispute_id:
                null,

              p_start_at:
                startDate
                  ? new Date(
                      `${startDate}T00:00:00`,
                    ).toISOString()
                  : null,

              p_end_at:
                endDate
                  ? new Date(
                      `${endDate}T23:59:59.999`,
                    ).toISOString()
                  : null,

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

          const result =
            data as
              | AuditListResponse
              | null;

          const items =
            Array.isArray(
              result?.items,
            )
              ? result.items
              : [];

          setRows(items);

          setTotal(
            Number(
              result?.total || 0,
            ),
          );
        } catch (error: any) {
          console.error(
            "Audit logs fetch failed:",
            error,
          );

          toast({
            title:
              "Unable to load audit logs",

            description:
              error?.message ||
              "Something went wrong while loading audit logs.",

            variant:
              "destructive",
          });

          setRows([]);

          setTotal(0);
        } finally {
          setLoading(false);

          setRefreshing(false);
        }
      },
      [
        search,
        categoryFilter,
        actionFilter,
        roleFilter,
        targetTypeFilter,
        startDate,
        endDate,
        page,
        toast,
      ],
    );


  // ==========================================================
  // REFRESH
  // ==========================================================

  const refreshAll =
    useCallback(
      async (
        showRefresh = true,
      ) => {
        try {
          await Promise.all([
            fetchRows(
              showRefresh,
            ),
            fetchSummary(),
          ]);
        } catch (error) {
          console.error(
            "Audit log refresh failed:",
            error,
          );
        }
      },
      [
        fetchRows,
        fetchSummary,
      ],
    );


  // ==========================================================
  // LOAD LOGS
  // ==========================================================

  useEffect(() => {
    fetchRows(false);
  }, [fetchRows]);


  // ==========================================================
  // LOAD SUMMARY
  // ==========================================================

  useEffect(() => {
    fetchSummary().catch(
      (error) => {
        console.error(
          "Audit summary failed:",
          error,
        );
      },
    );
  }, [fetchSummary]);


  // ==========================================================
  // OPEN DETAIL
  // ==========================================================

  const openDetail =
    useCallback(
      async (
        auditLogId: string,
      ) => {
        setDetailOpen(true);

        setDetailLoading(true);

        setSelectedAuditLog(
          null,
        );

        try {
          const {
            data,
            error,
          } = await supabase.rpc(
            "admin_audit_log_get",
            {
              p_audit_log_id:
                auditLogId,
            },
          );

          if (error) {
            throw error;
          }

          if (!data) {
            throw new Error(
              "Audit log not found.",
            );
          }

          setSelectedAuditLog(
            data as AuditLog,
          );
        } catch (error: any) {
          console.error(
            "Audit detail failed:",
            error,
          );

          toast({
            title:
              "Unable to load audit log",

            description:
              error?.message ||
              "The audit log could not be loaded.",

            variant:
              "destructive",
          });

          setDetailOpen(false);
        } finally {
          setDetailLoading(false);
        }
      },
      [toast],
    );


  // ==========================================================
  // PAGINATION
  // ==========================================================

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        total / PAGE_SIZE,
      ),
    );

  const hasPreviousPage =
    page > 1;

  const hasNextPage =
    page < totalPages;


  const goPrevious =
    useCallback(() => {
      if (!hasPreviousPage) {
        return;
      }

      setPage(
        (current) =>
          Math.max(
            1,
            current - 1,
          ),
      );
    }, [hasPreviousPage]);


  const goNext =
    useCallback(() => {
      if (!hasNextPage) {
        return;
      }

      setPage(
        (current) =>
          Math.min(
            totalPages,
            current + 1,
          ),
      );
    }, [
      hasNextPage,
      totalPages,
    ]);


  // ==========================================================
  // ACTIVE FILTERS
  // ==========================================================

  const filtersActive =
    useMemo(
      () =>
        Boolean(
          search.trim() ||
            categoryFilter !==
              "all" ||
            actionFilter !==
              "all" ||
            roleFilter !==
              "all" ||
            targetTypeFilter !==
              "all" ||
            startDate ||
            endDate,
        ),
      [
        search,
        categoryFilter,
        actionFilter,
        roleFilter,
        targetTypeFilter,
        startDate,
        endDate,
      ],
    );


  // ==========================================================
  // PAGE
  // ==========================================================

  return (
    <AdminLayout>
      <div className="space-y-6 p-4 md:p-6">

        {/* ====================================================
            HEADER
        ==================================================== */}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

          <div>
            <div className="flex items-center gap-3">

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>

              <div>

                <h1 className="text-2xl font-bold tracking-tight">
                  Audit Logs
                </h1>

                <p className="text-sm text-muted-foreground">
                  Monitor administrator activity,
                  investigations, changes and security
                  events.
                </p>

              </div>

            </div>
          </div>


          <Button
            variant="outline"
            onClick={() =>
              refreshAll(true)
            }
            disabled={
              refreshing
            }
          >
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}

            Refresh
          </Button>

        </div>


        {/* ====================================================
            SUMMARY
        ==================================================== */}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <Card>

            <CardHeader className="pb-2">

              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Audit Events
              </CardTitle>

            </CardHeader>

            <CardContent>

              <div className="flex items-center justify-between">

                <div className="text-2xl font-bold">
                  {summary.total.toLocaleString()}
                </div>

                <Activity className="h-5 w-5 text-muted-foreground" />

              </div>

            </CardContent>

          </Card>


          <Card>

            <CardHeader className="pb-2">

              <CardTitle className="text-sm font-medium text-muted-foreground">
                Events Today
              </CardTitle>

            </CardHeader>

            <CardContent>

              <div className="flex items-center justify-between">

                <div className="text-2xl font-bold">
                  {summary.today.toLocaleString()}
                </div>

                <Calendar className="h-5 w-5 text-muted-foreground" />

              </div>

            </CardContent>

          </Card>


          <Card>

            <CardHeader className="pb-2">

              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Admins
              </CardTitle>

            </CardHeader>

            <CardContent>

              <div className="flex items-center justify-between">

                <div className="text-2xl font-bold">
                  {summary.active_admins.toLocaleString()}
                </div>

                <User className="h-5 w-5 text-muted-foreground" />

              </div>

            </CardContent>

          </Card>


          <Card>

            <CardHeader className="pb-2">

              <CardTitle className="text-sm font-medium text-muted-foreground">
                Categories
              </CardTitle>

            </CardHeader>

            <CardContent>

              <div className="flex items-center justify-between">

                <div className="text-2xl font-bold">
                  {Object.keys(
                    summary.categories || {},
                  ).length}
                </div>

                <Fingerprint className="h-5 w-5 text-muted-foreground" />

              </div>

            </CardContent>

          </Card>

        </div>


        {/* ====================================================
            CATEGORY OVERVIEW
        ==================================================== */}

        {Object.keys(
          summary.categories || {},
        ).length > 0 && (
          <Card>

            <CardHeader>

              <CardTitle className="text-base">
                Activity by Category
              </CardTitle>

            </CardHeader>

            <CardContent>

              <div className="flex flex-wrap gap-3">

                {Object.entries(
                  summary.categories,
                )
                  .sort(
                    (
                      [, a],
                      [, b],
                    ) => b - a,
                  )
                  .map(
                    ([
                      category,
                      count,
                    ]) => (
                      <div
                        key={
                          category
                        }
                        className="flex items-center gap-2 rounded-lg border px-4 py-3"
                      >

                        <Badge
                          variant="outline"
                          className={categoryClass(
                            category,
                          )}
                        >
                          {titleCase(
                            category,
                          )}
                        </Badge>

                        <span className="font-semibold">
                          {Number(
                            count,
                          ).toLocaleString()}
                        </span>

                      </div>
                    ),
                  )}

              </div>

            </CardContent>

          </Card>
        )}


        {/* ====================================================
            FILTERS
        ==================================================== */}

        <Card>

          <CardHeader>

            <div className="flex items-center justify-between gap-4">

              <CardTitle className="flex items-center gap-2 text-base">

                <Filter className="h-4 w-4" />

                Filters

              </CardTitle>


              {filtersActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={
                    resetFilters
                  }
                >
                  <X className="mr-2 h-4 w-4" />

                  Clear
                </Button>
              )}

            </div>

          </CardHeader>


          <CardContent>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">

              {/* SEARCH */}

              <div className="space-y-2 lg:col-span-2">

                <Label>
                  Search
                </Label>

                <div className="relative">

                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                  <Input
                    value={
                      search
                    }
                    onChange={(
                      event,
                    ) => {
                      setSearch(
                        event.target
                          .value,
                      );

                      setPage(1);
                    }}
                    placeholder="Admin, action, description, target, user or transaction ID..."
                    className="pl-9"
                  />

                </div>

              </div>


              {/* CATEGORY */}

              <div className="space-y-2">

                <Label>
                  Category
                </Label>

                <Select
                  value={
                    categoryFilter
                  }
                  onValueChange={(
                    value,
                  ) => {
                    setCategoryFilter(
                      value,
                    );

                    setPage(1);
                  }}
                >

                  <SelectTrigger>
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>

                  <SelectContent>

                    <SelectItem value="all">
                      All categories
                    </SelectItem>

                    <SelectItem value="authentication">
                      Authentication
                    </SelectItem>

                    <SelectItem value="transaction">
                      Transaction
                    </SelectItem>

                    <SelectItem value="finance">
                      Finance
                    </SelectItem>

                    <SelectItem value="customer">
                      Customer
                    </SelectItem>

                    <SelectItem value="dispute">
                      Dispute
                    </SelectItem>

                    <SelectItem value="settings">
                      Settings
                    </SelectItem>

                    <SelectItem value="admin">
                      Admin
                    </SelectItem>

                    <SelectItem value="security">
                      Security
                    </SelectItem>

                    <SelectItem value="system">
                      System
                    </SelectItem>

                  </SelectContent>

                </Select>

              </div>


              {/* ROLE */}

              <div className="space-y-2">

                <Label>
                  Admin role
                </Label>

                <Select
                  value={
                    roleFilter
                  }
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

                    <SelectItem value="super_admin">
                      Super Admin
                    </SelectItem>

                    <SelectItem value="operations_admin">
                      Operations Admin
                    </SelectItem>

                    <SelectItem value="finance_admin">
                      Finance Admin
                    </SelectItem>

                    <SelectItem value="read_only_admin">
                      Read Only Admin
                    </SelectItem>

                  </SelectContent>

                </Select>

              </div>


              {/* ACTION */}

              <div className="space-y-2">

                <Label>
                  Action
                </Label>

                <Input
                  value={
                    actionFilter ===
                    "all"
                      ? ""
                      : actionFilter
                  }
                  onChange={(
                    event,
                  ) => {
                    const value =
                      event.target
                        .value;

                    setActionFilter(
                      value ||
                        "all",
                    );

                    setPage(1);
                  }}
                  placeholder="e.g. transaction_investigated"
                />

              </div>


              {/* TARGET TYPE */}

              <div className="space-y-2">

                <Label>
                  Target type
                </Label>

                <Select
                  value={
                    targetTypeFilter
                  }
                  onValueChange={(
                    value,
                  ) => {
                    setTargetTypeFilter(
                      value,
                    );

                    setPage(1);
                  }}
                >

                  <SelectTrigger>
                    <SelectValue placeholder="All target types" />
                  </SelectTrigger>

                  <SelectContent>

                    <SelectItem value="all">
                      All target types
                    </SelectItem>

                    <SelectItem value="transaction">
                      Transaction
                    </SelectItem>

                    <SelectItem value="user">
                      User
                    </SelectItem>

                    <SelectItem value="customer">
                      Customer
                    </SelectItem>

                    <SelectItem value="dispute">
                      Dispute
                    </SelectItem>

                    <SelectItem value="admin">
                      Admin
                    </SelectItem>

                    <SelectItem value="settings">
                      Settings
                    </SelectItem>

                  </SelectContent>

                </Select>

              </div>


              {/* FROM */}

              <div className="space-y-2">

                <Label>
                  From
                </Label>

                <Input
                  type="date"
                  value={
                    startDate
                  }
                  onChange={(
                    event,
                  ) => {
                    setStartDate(
                      event.target
                        .value,
                    );

                    setPage(1);
                  }}
                />

              </div>


              {/* TO */}

              <div className="space-y-2">

                <Label>
                  To
                </Label>

                <Input
                  type="date"
                  value={
                    endDate
                  }
                  onChange={(
                    event,
                  ) => {
                    setEndDate(
                      event.target
                        .value,
                    );

                    setPage(1);
                  }}
                />

              </div>

            </div>

          </CardContent>

        </Card>


        {/* ====================================================
            AUDIT TABLE
        ==================================================== */}

        <Card className="overflow-hidden">

          <CardHeader>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <CardTitle className="text-base">
                  Audit Events
                </CardTitle>

                <p className="text-sm text-muted-foreground">
                  {total.toLocaleString()} matching
                  event
                  {total === 1
                    ? ""
                    : "s"}
                </p>

              </div>


              {loading && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}

            </div>

          </CardHeader>


          <CardContent className="p-0">

            {loading &&
            rows.length === 0 ? (
              <div className="flex min-h-[300px] items-center justify-center">

                <div className="flex flex-col items-center gap-3 text-muted-foreground">

                  <Loader2 className="h-7 w-7 animate-spin" />

                  <span>
                    Loading audit logs...
                  </span>

                </div>

              </div>
            ) : rows.length ===
              0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">

                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">

                  <Shield className="h-6 w-6 text-muted-foreground" />

                </div>

                <h3 className="font-semibold">
                  No audit events found
                </h3>

                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  There are no audit events matching
                  the current filters.
                </p>

                {filtersActive && (
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={
                      resetFilters
                    }
                  >
                    Clear filters
                  </Button>
                )}

              </div>
            ) : (
              <div className="overflow-x-auto">

                <table className="w-full min-w-[1200px] text-sm">

                  <thead className="border-y bg-muted/50">

                    <tr>

                      <th className="px-4 py-3 text-left font-medium">
                        Activity
                      </th>

                      <th className="px-4 py-3 text-left font-medium">
                        Admin
                      </th>

                      <th className="px-4 py-3 text-left font-medium">
                        Category
                      </th>

                      <th className="px-4 py-3 text-left font-medium">
                        Action
                      </th>

                      <th className="px-4 py-3 text-left font-medium">
                        Target
                      </th>

                      <th className="px-4 py-3 text-left font-medium">
                        Time
                      </th>

                      <th className="px-4 py-3 text-right font-medium">
                        Action
                      </th>

                    </tr>

                  </thead>


                  <tbody className="divide-y">

                    {rows.map(
                      (
                        audit,
                      ) => (
                        <tr
                          key={
                            audit.id
                          }
                          className="transition-colors hover:bg-muted/30"
                        >

                          {/* ACTIVITY */}

                          <td className="max-w-[360px] px-4 py-4">

                            <div className="flex items-start gap-3">

                              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">

                                <Activity className="h-4 w-4 text-primary" />

                              </div>


                              <div className="min-w-0">

                                <div className="font-medium">
                                  {audit.description ||
                                    titleCase(
                                      audit.action,
                                    )}
                                </div>

                                <p className="mt-1 truncate text-xs text-muted-foreground">

                                  {audit.target_type
                                    ? `${titleCase(
                                        audit.target_type,
                                      )} • ${shortenId(
                                        audit.target_id,
                                      )}`
                                    : "System activity"}

                                </p>

                              </div>

                            </div>

                          </td>


                          {/* ADMIN */}

                          <td className="px-4 py-4">

                            <div>

                              <div className="font-medium">
                                {audit.admin_name ||
                                  audit.admin_email ||
                                  shortenId(
                                    audit.admin_user_id,
                                  )}
                              </div>

                              {audit.admin_email && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {audit.admin_email}
                                </div>
                              )}

                              {audit.admin_role && (
                                <Badge
                                  variant="outline"
                                  className="mt-2"
                                >
                                  {titleCase(
                                    audit.admin_role,
                                  )}
                                </Badge>
                              )}

                            </div>

                          </td>


                          {/* CATEGORY */}

                          <td className="px-4 py-4">

                            <Badge
                              variant="outline"
                              className={categoryClass(
                                audit.category,
                              )}
                            >
                              {titleCase(
                                audit.category,
                              )}
                            </Badge>

                          </td>


                          {/* ACTION */}

                          <td className="px-4 py-4">

                            <Badge
                              variant="outline"
                              className={actionClass(
                                audit.action,
                              )}
                            >
                              {titleCase(
                                audit.action,
                              )}
                            </Badge>

                          </td>


                          {/* TARGET */}

                          <td className="px-4 py-4">

                            <div className="space-y-1">

                              {audit.target_type && (
                                <div className="font-medium">
                                  {titleCase(
                                    audit.target_type,
                                  )}
                                </div>
                              )}

                              {audit.target_id && (
                                <div className="font-mono text-xs text-muted-foreground">
                                  {shortenId(
                                    audit.target_id,
                                    20,
                                  )}
                                </div>
                              )}

                              {audit.transaction_id && (
                                <div className="text-xs text-muted-foreground">
                                  TX:{" "}
                                  {shortenId(
                                    audit.transaction_id,
                                    16,
                                  )}
                                </div>
                              )}

                            </div>

                          </td>


                          {/* TIME */}

                          <td className="px-4 py-4 text-xs text-muted-foreground">

                            <div>
                              {formatDate(
                                audit.created_at,
                              )}
                            </div>

                          </td>


                          {/* VIEW */}

                          <td className="px-4 py-4 text-right">

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                openDetail(
                                  audit.id,
                                )
                              }
                            >
                              <Eye className="mr-2 h-4 w-4" />

                              View

                            </Button>

                          </td>

                        </tr>
                      ),
                    )}

                  </tbody>

                </table>

              </div>
            )}

          </CardContent>


          {/* PAGINATION */}

          {!loading &&
            rows.length > 0 && (
              <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">

                <div className="text-sm text-muted-foreground">

                  Showing{" "}

                  <span className="font-medium text-foreground">
                    {Math.min(
                      (page - 1) *
                        PAGE_SIZE +
                        1,
                      total,
                    )}
                  </span>

                  {" "}–{" "}

                  <span className="font-medium text-foreground">
                    {Math.min(
                      page *
                        PAGE_SIZE,
                      total,
                    )}
                  </span>

                  {" "}of{" "}

                  <span className="font-medium text-foreground">
                    {total.toLocaleString()}
                  </span>

                </div>


                <div className="flex items-center gap-2">

                  <span className="mr-2 text-sm text-muted-foreground">
                    Page{" "}
                    {page} of{" "}
                    {totalPages}
                  </span>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={
                      goPrevious
                    }
                    disabled={
                      !hasPreviousPage
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={
                      goNext
                    }
                    disabled={
                      !hasNextPage
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>

                </div>

              </div>
            )}

        </Card>


        {/* ====================================================
            DETAIL DIALOG
        ==================================================== */}

        <Dialog
          open={detailOpen}
          onOpenChange={
            setDetailOpen
          }
        >

          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">

            <DialogHeader>

              <DialogTitle className="flex items-center gap-2">

                <Shield className="h-5 w-5" />

                Audit Event Details

              </DialogTitle>

              <DialogDescription>
                Complete administrator activity,
                target and state-change information.
              </DialogDescription>

            </DialogHeader>


            {detailLoading ? (
              <div className="flex min-h-[300px] items-center justify-center">

                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />

              </div>
            ) : selectedAuditLog ? (
              <div className="space-y-6">

                {/* ==================================================
                    EVENT HEADER
                ================================================== */}

                <div className="rounded-xl border bg-muted/20 p-5">

                  <div className="flex items-start gap-4">

                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">

                      <Activity className="h-6 w-6 text-primary" />

                    </div>


                    <div className="min-w-0 flex-1">

                      <div className="flex flex-wrap items-center gap-2">

                        <h3 className="font-semibold">
                          {selectedAuditLog.description ||
                            titleCase(
                              selectedAuditLog.action,
                            )}
                        </h3>

                        <Badge
                          variant="outline"
                          className={categoryClass(
                            selectedAuditLog.category,
                          )}
                        >
                          {titleCase(
                            selectedAuditLog.category,
                          )}
                        </Badge>

                        <Badge
                          variant="outline"
                          className={actionClass(
                            selectedAuditLog.action,
                          )}
                        >
                          {titleCase(
                            selectedAuditLog.action,
                          )}
                        </Badge>

                      </div>


                      {selectedAuditLog.description && (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                          {
                            selectedAuditLog.description
                          }
                        </p>
                      )}

                    </div>

                  </div>

                </div>


                {/* ==================================================
                    ADMIN INFORMATION
                ================================================== */}

                <div className="space-y-3">

                  <h3 className="font-semibold">
                    Administrator
                  </h3>


                  <div className="grid gap-3 sm:grid-cols-2">

                    <div className="rounded-lg border p-4">

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">

                        <User className="h-4 w-4" />

                        Admin name

                      </div>

                      <div className="mt-2 font-medium">
                        {selectedAuditLog.admin_name ||
                          "—"}
                      </div>

                    </div>


                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Admin email
                      </div>

                      <div className="mt-2 break-all font-medium">
                        {selectedAuditLog.admin_email ||
                          "—"}
                      </div>

                    </div>


                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Admin role
                      </div>

                      <div className="mt-2">

                        {selectedAuditLog.admin_role ? (
                          <Badge variant="outline">
                            {titleCase(
                              selectedAuditLog.admin_role,
                            )}
                          </Badge>
                        ) : (
                          "—"
                        )}

                      </div>

                    </div>


                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Admin user ID
                      </div>

                      <div className="mt-2 break-all font-mono text-xs">
                        {selectedAuditLog.admin_user_id ||
                          "—"}
                      </div>

                    </div>

                  </div>

                </div>


                {/* ==================================================
                    TARGET INFORMATION
                ================================================== */}

                <div className="space-y-3">

                  <h3 className="font-semibold">
                    Target & References
                  </h3>


                  <div className="grid gap-3 sm:grid-cols-2">

                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Target type
                      </div>

                      <div className="mt-2 font-medium">
                        {titleCase(
                          selectedAuditLog.target_type,
                        )}
                      </div>

                    </div>


                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Target ID
                      </div>

                      <div className="mt-2 break-all font-mono text-xs">
                        {selectedAuditLog.target_id ||
                          "—"}
                      </div>

                    </div>


                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Customer/User ID
                      </div>

                      <div className="mt-2 break-all font-mono text-xs">
                        {selectedAuditLog.user_id ||
                          "—"}
                      </div>

                    </div>


                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Transaction ID
                      </div>

                      <div className="mt-2 break-all font-mono text-xs">
                        {selectedAuditLog.transaction_id ||
                          "—"}
                      </div>

                    </div>


                    <div className="rounded-lg border p-4 sm:col-span-2">

                      <div className="text-xs text-muted-foreground">
                        Dispute ID
                      </div>

                      <div className="mt-2 break-all font-mono text-xs">
                        {selectedAuditLog.dispute_id ||
                          "—"}
                      </div>

                    </div>

                  </div>

                </div>


                {/* ==================================================
                    TIMESTAMP / NETWORK
                ================================================== */}

                <div className="space-y-3">

                  <h3 className="font-semibold">
                    Request Information
                  </h3>


                  <div className="grid gap-3 sm:grid-cols-2">

                    <div className="rounded-lg border p-4">

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">

                        <Clock className="h-4 w-4" />

                        Timestamp

                      </div>

                      <div className="mt-2 text-sm font-medium">
                        {formatDate(
                          selectedAuditLog.created_at,
                        )}
                      </div>

                    </div>


                    <div className="rounded-lg border p-4">

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">

                        <Globe className="h-4 w-4" />

                        IP address

                      </div>

                      <div className="mt-2 font-mono text-sm">
                        {selectedAuditLog.ip_address ||
                          "—"}
                      </div>

                    </div>


                    <div className="rounded-lg border p-4 sm:col-span-2">

                      <div className="text-xs text-muted-foreground">
                        User agent
                      </div>

                      <div className="mt-2 break-all text-xs leading-relaxed">
                        {selectedAuditLog.user_agent ||
                          "—"}
                      </div>

                    </div>

                  </div>

                </div>


                {/* ==================================================
                    BEFORE / AFTER
                ================================================== */}

                <div className="space-y-3">

                  <h3 className="font-semibold">
                    State Changes
                  </h3>


                  <div className="grid gap-4 lg:grid-cols-2">

                    <div className="overflow-hidden rounded-lg border">

                      <div className="border-b bg-muted/40 px-4 py-3">

                        <div className="font-medium">
                          Before
                        </div>

                        <div className="text-xs text-muted-foreground">
                          State before the action
                        </div>

                      </div>

                      <pre className="max-h-[350px] overflow-auto bg-muted/10 p-4 text-xs leading-relaxed">
                        {safeJson(
                          selectedAuditLog.before_data,
                        )}
                      </pre>

                    </div>


                    <div className="overflow-hidden rounded-lg border">

                      <div className="border-b bg-muted/40 px-4 py-3">

                        <div className="font-medium">
                          After
                        </div>

                        <div className="text-xs text-muted-foreground">
                          State after the action
                        </div>

                      </div>

                      <pre className="max-h-[350px] overflow-auto bg-muted/10 p-4 text-xs leading-relaxed">
                        {safeJson(
                          selectedAuditLog.after_data,
                        )}
                      </pre>

                    </div>

                  </div>

                </div>


                {/* ==================================================
                    METADATA
                ================================================== */}

                {selectedAuditLog.metadata && (
                  <div className="space-y-3">

                    <h3 className="font-semibold">
                      Metadata
                    </h3>

                    <pre className="max-h-[300px] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs leading-relaxed">
                      {safeJson(
                        selectedAuditLog.metadata,
                      )}
                    </pre>

                  </div>
                )}


                {/* ==================================================
                    DEVICE INFO
                ================================================== */}

                {selectedAuditLog.device_info && (
                  <div className="space-y-3">

                    <h3 className="font-semibold">
                      Device Information
                    </h3>

                    <pre className="max-h-[300px] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs leading-relaxed">
                      {safeJson(
                        selectedAuditLog.device_info,
                      )}
                    </pre>

                  </div>
                )}


                {/* ==================================================
                    AUDIT ID
                ================================================== */}

                <div className="rounded-lg border bg-muted/20 p-4">

                  <div className="text-xs text-muted-foreground">
                    Audit log ID
                  </div>

                  <div className="mt-2 break-all font-mono text-xs">
                    {
                      selectedAuditLog.id
                    }
                  </div>

                </div>


                {/* ==================================================
                    SECURITY NOTICE
                ================================================== */}

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">

                  <div className="flex gap-3">

                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />

                    <div>

                      <div className="font-medium text-blue-800">
                        Append-only audit record
                      </div>

                      <p className="mt-1 text-sm text-blue-700/90">
                        Audit records are designed to remain
                        immutable. This event records the
                        administrator identity, action, target
                        and available request context.
                      </p>

                    </div>

                  </div>

                </div>

              </div>
            ) : (
              <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Audit log unavailable.
                </div>
              </div>
            )}


            <DialogFooter>

              <Button
                variant="outline"
                onClick={() =>
                  setDetailOpen(
                    false,
                  )
                }
              >
                Close
              </Button>

            </DialogFooter>

          </DialogContent>

        </Dialog>

      </div>
    </AdminLayout>
  );
}


export default AuditLogsPage;
