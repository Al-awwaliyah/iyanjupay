import React from "react";

import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock3,
  MessageCircle,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

import AdminLayout from "./AdminLayout";

const AdminDashboardPage = () => {
  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        {/* ====================================================
            WELCOME
        ==================================================== */}

        <section>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Dashboard Overview
            </h2>

            <p className="text-sm text-gray-500 mt-1">
              Monitor IyanjuPay activity and
              administration from one place.
            </p>
          </div>
        </section>

        {/* ====================================================
            PRIMARY STATISTICS
        ==================================================== */}

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* USERS */}

          <div className="bg-white border rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">
                  Total Users
                </p>

                <p className="text-2xl font-bold text-gray-900 mt-2">
                  —
                </p>
              </div>

              <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-4">
              User statistics will be connected
              securely.
            </p>
          </div>

          {/* WALLET */}

          <div className="bg-white border rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">
                  Wallet Activity
                </p>

                <p className="text-2xl font-bold text-gray-900 mt-2">
                  —
                </p>
              </div>

              <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-purple-600" />
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-4">
              Ledger statistics will be connected
              securely.
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
                  —
                </p>
              </div>

              <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center">
                <Activity className="h-5 w-5 text-green-600" />
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-4">
              Transaction statistics will be
              connected securely.
            </p>
          </div>

          {/* SUPPORT */}

          <div className="bg-white border rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">
                  Support
                </p>

                <p className="text-2xl font-bold text-gray-900 mt-2">
                  —
                </p>
              </div>

              <div className="w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-orange-600" />
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-4">
              Support metrics will be connected
              next.
            </p>
          </div>
        </section>

        {/* ====================================================
            TRANSACTION SUMMARY
        ==================================================== */}

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white border rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">
                  Transaction Overview
                </h3>

                <p className="text-xs text-gray-500 mt-1">
                  Today's transaction activity
                </p>
              </div>

              <Activity className="h-5 w-5 text-gray-400" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
              <div className="rounded-xl border bg-green-50 p-4">
                <div className="flex items-center gap-2">
                  <ArrowDownToLine className="h-4 w-4 text-green-600" />

                  <span className="text-xs text-green-700">
                    Successful
                  </span>
                </div>

                <p className="text-xl font-bold text-green-700 mt-2">
                  —
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
                  —
                </p>
              </div>

              <div className="rounded-xl border bg-red-50 p-4">
                <div className="flex items-center gap-2">
                  <ArrowUpFromLine className="h-4 w-4 text-red-600" />

                  <span className="text-xs text-red-700">
                    Failed
                  </span>
                </div>

                <p className="text-xl font-bold text-red-700 mt-2">
                  —
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

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  Verified
                </span>

                <span className="font-semibold text-gray-900">
                  —
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  Pending
                </span>

                <span className="font-semibold text-gray-900">
                  —
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  Unverified
                </span>

                <span className="font-semibold text-gray-900">
                  —
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ====================================================
            QUICK ACCESS
        ==================================================== */}

        <section className="bg-white border rounded-2xl p-5">
          <div>
            <h3 className="font-bold text-gray-900">
              Administration Modules
            </h3>

            <p className="text-xs text-gray-500 mt-1">
              Access the administrative tools available
              to your role.
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
      </div>
    </AdminLayout>
  );
};

export default AdminDashboardPage;
