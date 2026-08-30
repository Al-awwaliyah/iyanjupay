import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  CheckCircle2,
  Clock3,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";

import AdminLayout from "./AdminLayout";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/* ============================================================
   TYPES
   ============================================================ */

interface DashboardUserStats {
  total: number;
  verified: number;
  pending: number;
  unverified: number;
}

interface DashboardWalletStats {
  total: number;
  active: number;
  total_balance: number;
  total_held_balance: number;
}

interface DashboardTransactionStats {
  total: number;
  successful: number;
  pending: number;
  failed: number;
  total_volume: number;
  successful_volume: number;
  pending_volume: number;
  failed_volume: number;
}

interface DashboardTodayStats {
  transactions: number;
  volume: number;
  successful: number;
  pending: number;
  failed: number;
  successful_volume: number;
  pending_volume: number;
  failed_volume: number;
  deposits: number;
  transfers: number;
  bill_payments: number;
}

interface RecentTransaction {
  id: string;
  user_id: string;
  transaction_type: string;
  amount: number;
  currency: string;
  description: string | null;
  status: string;
  reference_number: string;
  category: string | null;
  provider: string | null;
  provider_reference: string | null;
  created_at: string | null;
  completed_at: string | null;
  user_name: string;
}

interface TransactionTypeBreakdown {
  transaction_type: string;
  count: number;
  volume: number;
}

interface DashboardStats {
  admin_role: string;

  users: DashboardUserStats;

  wallets: DashboardWalletStats;

  transactions: DashboardTransactionStats;

  today: DashboardTodayStats;

  transaction_types: TransactionTypeBreakdown[];

  recent_transactions: RecentTransaction[];

  generated_at: string;
}

/* ============================================================
   SAFE FRONTEND ERROR MESSAGES
   ============================================================ */

/**
 * IMPORTANT:
 *
 * Never expose raw Supabase/PostgreSQL/Edge Function errors
 * directly to the frontend.
 *
 * Backend errors are logged to the browser console for
 * debugging, while the user receives a safe generic message.
 */
const SAFE_ERROR_MESSAGES = {
  dashboardLoad:
    "We couldn't load the dashboard right now. Please try again.",
} as const;

/**
 * Converts any backend/runtime error into a safe user-facing
 * message.
 *
 * Do NOT return error.message, error.details, error.hint,
 * PostgreSQL error codes, SQL statements, function names,
 * Supabase internals, or Edge Function responses here.
 */
const getSafeErrorMessage = (
  _error: unknown,
  fallback: string
): string => {
  return fallback;
};

/* ============================================================
   FORMATTERS
   ============================================================ */

const formatNumber = (
  value: number
) => {
  return new Intl.NumberFormat(
    "en-NG"
  ).format(value || 0);
};

const formatMoney = (
  value: number,
  currency = "NGN"
) => {
  return new Intl.NumberFormat(
    "en-NG",
    {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }
  ).format(value || 0);
};

const formatDate = (
  value: string | null
) => {
  if (!value) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(
      "en-NG",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    ).format(new Date(value));
  } catch {
    return "—";
  }
};

const normalizeStatus = (
  status: string
) => {
  return status
    .toLowerCase()
    .replace(/[_-]/g, " ");
};

const getStatusClasses = (
  status: string
) => {
  const normalized =
    normalizeStatus(status);

  if (
    normalized === "success" ||
    normalized === "successful" ||
    normalized === "completed"
  ) {
    return "bg-green-100 text-green-700";
  }

  if (
    normalized === "pending" ||
    normalized === "processing" ||
    normalized === "queued" ||
    normalized === "initiated"
  ) {
    return "bg-yellow-100 text-yellow-700";
  }

  return "bg-red-100 text-red-700";
};

/* ============================================================
   PAGE
   ============================================================ */

const AdminDashboardPage =
  () => {
    const { toast } =
      useToast();

    const [stats, setStats] =
      useState<DashboardStats | null>(
        null
      );

    const [loading, setLoading] =
      useState(true);

    const [refreshing, setRefreshing] =
      useState(false);

    const [error, setError] =
      useState<string | null>(
        null
      );

    /* ========================================================
       LOAD DASHBOARD
       ======================================================== */

    const loadDashboard =
      useCallback(
        async (
          isRefresh = false
        ) => {
          if (isRefresh) {
            setRefreshing(true);
          } else {
            setLoading(true);
          }

          setError(null);

          try {
            const {
              data,
              error: rpcError,
            } =
              await supabase.rpc(
                "get_admin_dashboard_stats"
              );

            /*
             * IMPORTANT:
             *
             * Keep the actual backend error for console/debugging,
             * but NEVER send its message/details/hint to the UI.
             */
            if (rpcError) {
              console.error(
                "Admin dashboard RPC failed:",
                rpcError
              );

              throw rpcError;
            }

            if (!data) {
              console.error(
                "Admin dashboard RPC returned no data."
              );

              throw new Error(
                "Dashboard data unavailable."
              );
            }

            setStats(
              data as DashboardStats
            );
          } catch (err: unknown) {
            /*
             * The complete backend error is available only in the
             * developer console. It is NOT rendered to the user.
             */
            console.error(
              "Admin dashboard loading failed:",
              err
            );

            const safeMessage =
              getSafeErrorMessage(
                err,
                SAFE_ERROR_MESSAGES.dashboardLoad
              );

            setError(
              safeMessage
            );

            toast({
              title:
                "Dashboard unavailable",
              description:
                safeMessage,
              variant:
                "destructive",
            });
          } finally {
            setLoading(false);
            setRefreshing(false);
          }
        },
        [toast]
      );

    /* ========================================================
       INITIAL LOAD
       ======================================================== */

    useEffect(() => {
      void loadDashboard();
    }, [loadDashboard]);

    /* ========================================================
       LOADING STATE
       ======================================================== */

    if (loading) {
      return (
        <AdminLayout>
          <div className="min-h-[70vh] flex items-center justify-center p-6">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto">
                <BarChart3 className="h-7 w-7 text-purple-600" />
              </div>

              <div className="mt-4 flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-purple-600" />

                <p className="text-sm text-gray-500">
                  Loading dashboard statistics...
                </p>
              </div>
            </div>
          </div>
        </AdminLayout>
      );
    }

    /* ========================================================
       ERROR STATE
       ======================================================== */

    if (
      error ||
      !stats
    ) {
      return (
        <AdminLayout>
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="max-w-xl mx-auto bg-white border rounded-2xl p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
                <XCircle className="h-7 w-7 text-red-600" />
              </div>

              <h2 className="text-lg font-bold text-gray-900 mt-4">
                Unable to load dashboard
              </h2>

              <p className="text-sm text-gray-500 mt-2">
                {error ||
                  SAFE_ERROR_MESSAGES.dashboardLoad}
              </p>

              <button
                type="button"
                onClick={() =>
                  void loadDashboard()
                }
                className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700"
              >
                <RefreshCw className="h-4 w-4" />

                Try again
              </button>
            </div>
          </div>
        </AdminLayout>
      );
    }

    /* ========================================================
       MAIN DASHBOARD
       ======================================================== */

    return (
      <AdminLayout>
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">

          {/* ==================================================
              HEADER
          ================================================== */}

          <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Dashboard Overview
              </h2>

              <p className="text-sm text-gray-500 mt-1">
                Monitor IyanjuPay activity and administration.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void loadDashboard(true)
              }
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  refreshing
                    ? "animate-spin"
                    : ""
                }`}
              />

              {refreshing
                ? "Refreshing..."
                : "Refresh"}
            </button>
          </section>

          {/* ==================================================
              PRIMARY STATISTICS
          ================================================== */}

          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

            {/* USERS */}

            <div className="bg-white border rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500">
                    Total Users
                  </p>

                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    {formatNumber(
                      stats.users.total
                    )}
                  </p>
                </div>

                <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4 text-xs">
                <span className="text-green-600 font-medium">
                  {formatNumber(
                    stats.users.verified
                  )}{" "}
                  verified
                </span>

                <span className="text-gray-300">
                  •
                </span>

                <span className="text-yellow-600">
                  {formatNumber(
                    stats.users.pending
                  )}{" "}
                  pending
                </span>
              </div>
            </div>

            {/* WALLET */}

            <div className="bg-white border rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500">
                    Wallets
                  </p>

                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    {formatNumber(
                      stats.wallets.total
                    )}
                  </p>
                </div>

                <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-purple-600" />
                </div>
              </div>

              <p className="text-xs text-gray-400 mt-4">
                {formatNumber(
                  stats.wallets.active
                )}{" "}
                active wallets
              </p>
            </div>

            {/* TRANSACTIONS */}

            <div className="bg-white border rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500">
                    Transactions
                  </p>

                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    {formatNumber(
                      stats.transactions.total
                    )}
                  </p>
                </div>

                <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-green-600" />
                </div>
              </div>

              <p className="text-xs text-gray-400 mt-4">
                {formatMoney(
                  stats.transactions.total_volume
                )}{" "}
                total volume
              </p>
            </div>

            {/* TODAY */}

            <div className="bg-white border rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500">
                    Today's Activity
                  </p>

                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    {formatNumber(
                      stats.today.transactions
                    )}
                  </p>
                </div>

                <div className="w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-orange-600" />
                </div>
              </div>

              <p className="text-xs text-gray-400 mt-4">
                {formatMoney(
                  stats.today.volume
                )}{" "}
                today
              </p>
            </div>
          </section>

          {/* ==================================================
              TODAY'S FINANCIAL ACTIVITY
          ================================================== */}

          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">

            <div className="bg-white border rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                  <ArrowDownToLine className="h-5 w-5 text-green-600" />
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Today's Deposits
                  </p>

                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {formatMoney(
                      stats.today.deposits
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <ArrowUpFromLine className="h-5 w-5 text-blue-600" />
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Today's Transfers
                  </p>

                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {formatMoney(
                      stats.today.transfers
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-orange-600" />
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Today's Bill Payments
                  </p>

                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {formatMoney(
                      stats.today.bill_payments
                    )}
                  </p>
                </div>
              </div>
            </div>

          </section>

          {/* ==================================================
              TRANSACTION STATUS + KYC
          ================================================== */}

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* TRANSACTION STATUS */}

            <div className="lg:col-span-2 bg-white border rounded-2xl p-5">

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900">
                    Transaction Overview
                  </h3>

                  <p className="text-xs text-gray-500 mt-1">
                    Today's transaction status
                  </p>
                </div>

                <Activity className="h-5 w-5 text-gray-400" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">

                <div className="rounded-xl border bg-green-50 p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />

                    <span className="text-xs text-green-700">
                      Successful
                    </span>
                  </div>

                  <p className="text-xl font-bold text-green-700 mt-2">
                    {formatNumber(
                      stats.today.successful
                    )}
                  </p>

                  <p className="text-xs text-green-600 mt-1">
                    {formatMoney(
                      stats.today.successful_volume
                    )}
                  </p>
                </div>

                <div className="rounded-xl border bg-yellow-50 p-4">
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-yellow-600" />

                    <span className="text-xs text-yellow-700">
                      Pending
                    </span>
                  </div>

                  <p className="text-xl font-bold text-yellow-700 mt-2">
                    {formatNumber(
                      stats.today.pending
                    )}
                  </p>

                  <p className="text-xs text-yellow-600 mt-1">
                    {formatMoney(
                      stats.today.pending_volume
                    )}
                  </p>
                </div>

                <div className="rounded-xl border bg-red-50 p-4">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />

                    <span className="text-xs text-red-700">
                      Failed
                    </span>
                  </div>

                  <p className="text-xl font-bold text-red-700 mt-2">
                    {formatNumber(
                      stats.today.failed
                    )}
                  </p>

                  <p className="text-xs text-red-600 mt-1">
                    {formatMoney(
                      stats.today.failed_volume
                    )}
                  </p>
                </div>

              </div>
            </div>

            {/* KYC */}

            <div className="bg-white border rounded-2xl p-5">

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5 text-green-600" />
                </div>

                <div>
                  <h3 className="font-bold text-gray-900">
                    KYC Overview
                  </h3>

                  <p className="text-xs text-gray-500">
                    Verification activity
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-4">

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Verified
                  </span>

                  <span className="font-semibold text-green-600">
                    {formatNumber(
                      stats.users.verified
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Pending
                  </span>

                  <span className="font-semibold text-yellow-600">
                    {formatNumber(
                      stats.users.pending
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Unverified
                  </span>

                  <span className="font-semibold text-gray-700">
                    {formatNumber(
                      stats.users.unverified
                    )}
                  </span>
                </div>

              </div>
            </div>

          </section>

          {/* ==================================================
              RECENT TRANSACTIONS
          ================================================== */}

          <section className="bg-white border rounded-2xl overflow-hidden">

            <div className="p-5 border-b flex items-center justify-between">

              <div>
                <h3 className="font-bold text-gray-900">
                  Recent Transactions
                </h3>

                <p className="text-xs text-gray-500 mt-1">
                  Latest wallet activity across IyanjuPay.
                </p>
              </div>

              <Activity className="h-5 w-5 text-gray-400" />

            </div>

            {stats.recent_transactions.length === 0 ? (

              <div className="p-10 text-center">

                <Activity className="h-8 w-8 text-gray-300 mx-auto" />

                <p className="text-sm text-gray-500 mt-3">
                  No transactions yet.
                </p>

              </div>

            ) : (

              <div className="overflow-x-auto">

                <table className="w-full min-w-[850px]">

                  <thead>
                    <tr className="border-b bg-gray-50">

                      <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        Transaction
                      </th>

                      <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        User
                      </th>

                      <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        Type
                      </th>

                      <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        Amount
                      </th>

                      <th className="text-center px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        Status
                      </th>

                      <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        Date
                      </th>

                    </tr>
                  </thead>

                  <tbody>

                    {stats.recent_transactions.map(
                      (transaction) => (
                        <tr
                          key={
                            transaction.id
                          }
                          className="border-b last:border-b-0 hover:bg-gray-50"
                        >

                          <td className="px-5 py-4">

                            <p className="text-sm font-semibold text-gray-900">
                              {transaction.reference_number}
                            </p>

                            <p className="text-xs text-gray-400 mt-1 max-w-[220px] truncate">
                              {transaction.description ||
                                "Transaction"}
                            </p>

                          </td>

                          <td className="px-5 py-4">

                            <p className="text-sm font-medium text-gray-800">
                              {transaction.user_name}
                            </p>

                            <p className="text-[11px] text-gray-400 mt-1">
                              {transaction.user_id.slice(
                                0,
                                8
                              )}
                              ...
                            </p>

                          </td>

                          <td className="px-5 py-4">

                            <span className="text-xs font-medium text-gray-700 capitalize">
                              {transaction.transaction_type ||
                                "Unknown"}
                            </span>

                          </td>

                          <td className="px-5 py-4 text-right">

                            <p className="text-sm font-bold text-gray-900">
                              {formatMoney(
                                Number(
                                  transaction.amount
                                ),
                                transaction.currency ||
                                  "NGN"
                              )}
                            </p>

                          </td>

                          <td className="px-5 py-4 text-center">

                            <span
                              className={`
                                inline-flex
                                items-center
                                px-2.5
                                py-1
                                rounded-full
                                text-[11px]
                                font-semibold
                                capitalize
                                ${getStatusClasses(
                                  transaction.status
                                )}
                              `}
                            >
                              {
                                transaction.status
                              }
                            </span>

                          </td>

                          <td className="px-5 py-4 text-right">

                            <p className="text-xs text-gray-500 whitespace-nowrap">
                              {formatDate(
                                transaction.created_at
                              )}
                            </p>

                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>

            )}

          </section>

          {/* ==================================================
              TRANSACTION TYPES
          ================================================== */}

          <section className="bg-white border rounded-2xl p-5">

            <div className="flex items-center justify-between">

              <div>
                <h3 className="font-bold text-gray-900">
                  Transaction Types
                </h3>

                <p className="text-xs text-gray-500 mt-1">
                  Breakdown from the actual transaction records.
                </p>
              </div>

              <Activity className="h-5 w-5 text-gray-400" />

            </div>

            {stats.transaction_types.length === 0 ? (

              <p className="text-sm text-gray-400 mt-5">
                No transaction types available.
              </p>

            ) : (

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">

                {stats.transaction_types
                  .slice(0, 8)
                  .map(
                    (item) => (
                      <div
                        key={
                          item.transaction_type
                        }
                        className="rounded-xl border p-4"
                      >

                        <p className="text-xs text-gray-500 capitalize">
                          {
                            item.transaction_type
                          }
                        </p>

                        <p className="text-xl font-bold text-gray-900 mt-2">
                          {formatNumber(
                            Number(
                              item.count
                            )
                          )}
                        </p>

                        <p className="text-xs text-gray-400 mt-1">
                          {formatMoney(
                            Number(
                              item.volume
                            )
                          )}
                        </p>

                      </div>
                    )
                  )}

              </div>

            )}

          </section>

          {/* ==================================================
              WALLET POSITION
          ================================================== */}

          <section className="bg-white border rounded-2xl p-5">

            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-purple-600" />
              </div>

              <div>
                <h3 className="font-bold text-gray-900">
                  Wallet Position
                </h3>

                <p className="text-xs text-gray-500">
                  Current wallet balances.
                </p>
              </div>

            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">

              <div className="rounded-xl bg-purple-50 border border-purple-100 p-4">

                <p className="text-xs text-purple-600">
                  Available Wallet Balance
                </p>

                <p className="text-2xl font-bold text-purple-900 mt-2">
                  {formatMoney(
                    stats.wallets.total_balance
                  )}
                </p>

              </div>

              <div className="rounded-xl bg-orange-50 border border-orange-100 p-4">

                <p className="text-xs text-orange-600">
                  Held Wallet Balance
                </p>

                <p className="text-2xl font-bold text-orange-900 mt-2">
                  {formatMoney(
                    stats.wallets.total_held_balance
                  )}
                </p>

              </div>

            </div>

          </section>

          {/* ==================================================
              QUICK ACCESS
          ================================================== */}

          <section className="bg-white border rounded-2xl p-5">

            <div>
              <h3 className="font-bold text-gray-900">
                Administration Modules
              </h3>

              <p className="text-xs text-gray-500 mt-1">
                Access the administrative tools available to your role.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">

              <button
                type="button"
                onClick={() =>
                  window.location.href =
                    "/admin/support"
                }
                className="text-left rounded-xl border p-4 hover:bg-purple-50 hover:border-purple-200 transition"
              >
                <MessageCircle className="h-5 w-5 text-purple-600" />

                <p className="font-semibold text-sm text-gray-900 mt-3">
                  Support Center
                </p>

                <p className="text-xs text-gray-500 mt-1">
                  Manage customer conversations.
                </p>
              </button>

              <div className="rounded-xl border p-4 bg-gray-50">

                <Users className="h-5 w-5 text-blue-600" />

                <p className="font-semibold text-sm text-gray-900 mt-3">
                  Customers
                </p>

                <p className="text-xs text-gray-500 mt-1">
                  Customer management coming next.
                </p>

              </div>

              <div className="rounded-xl border p-4 bg-gray-50">

                <Activity className="h-5 w-5 text-green-600" />

                <p className="font-semibold text-sm text-gray-900 mt-3">
                  Transactions
                </p>

                <p className="text-xs text-gray-500 mt-1">
                  Transaction center coming next.
                </p>

              </div>

              <div className="rounded-xl border p-4 bg-gray-50">

                <Wallet className="h-5 w-5 text-orange-600" />

                <p className="font-semibold text-sm text-gray-900 mt-3">
                  Reconciliation
                </p>

                <p className="text-xs text-gray-500 mt-1">
                  Reconciliation center coming later.
                </p>

              </div>

            </div>

          </section>

          {/* ==================================================
              FOOTER
          ================================================== */}

          <div className="text-center pb-4">

            <p className="text-[11px] text-gray-400">
              Dashboard generated{" "}
              {formatDate(
                stats.generated_at
              )}
            </p>

          </div>

        </div>
      </AdminLayout>
    );
  };

export default AdminDashboardPage;
