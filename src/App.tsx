import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

import React, { useEffect, useState } from "react";

import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";

import AppSplash from "@/components/AppSplash";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";

import Index from "./pages/Index";
import ForgotPassword from "./pages/ForgotPassword";
import VerifyEmailOtp from "./pages/VerifyEmailOtp";
import OnboardingPage from "@/components/onboarding/OnboardingPage";
import OnboardingBvnPage from "@/components/onboarding/OnboardingBvnPage";
import Dashboard from "@/components/Dashboard";
import SendMoney from "./pages/SendMoney";
import RewardsPage from "./components/rewards/RewardsPage";
import TransactionProcessing from "./pages/TransactionProcessing";
import PaymentPinPage from "@/components/onboarding/PaymentPinPage";
import ServicePayment from "./pages/ServicePayment";
import VerifyRecoveryOtp from "./pages/VerifyRecoveryOtp";
import AdminSupportPage from "@/pages/admin/AdminSupportPage";
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import AdminCustomersPage from "@/pages/admin/AdminCustomersPage";
import AdminTransactionsPage from "@/pages/admin/AdminTransactionsPage";
import AdminDisputesPage from "@/pages/admin/AdminDisputesPage";
import ReconciliationPage from "@/pages/admin/ReconciliationPage";
import AnalyticsPage from "@/pages/admin/AnalyticsPage";
import NotificationsPage from "@/pages/admin/NotificationsPage";
import UserNotificationsPage from "@/pages/NotificationsPage";
import NotificationDetailsPage from "@/pages/NotificationDetailsPage";
import AuditLogsPage from "@/pages/admin/AuditLogsPage";
import AdminManagementPage from "@/pages/admin/AdminManagementPage";
import AdminSettingsPage from "@/pages/admin/AdminSettingsPage";
import AdminLoginPage from "@/pages/admin/AdminLoginPage";
import AdminChangePasswordPage from "@/pages/admin/AdminChangePasswordPage";
import AdminRouteGuard from "@/pages/admin/AdminRouteGuard";
import UserDisputesPage from "@/components/disputes/UserDisputesPage";
import VerifyPaymentPinResetOtp from "@/pages/VerifyPaymentPinResetOtp";
import ResetPaymentPin from "@/pages/ResetPaymentPin";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

import ThemeProvider from "@/components/theme/ThemeProvider";
import AppLockGuard from "@/components/security/AppLockGuard";

import { restorePushRegistration } from "@/lib/pushNotifications";
import { supabase } from "@/integrations/supabase/client";

const queryClient = new QueryClient();

const ThemeGate = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const location = useLocation();

  const isAdminRoute =
    location.pathname === "/admin" ||
    location.pathname.startsWith("/admin/");

  if (isAdminRoute) {
    return <>{children}</>;
  }

  return <ThemeProvider>{children}</ThemeProvider>;
};

const App = () => {
  const [showSplash, setShowSplash] = useState(true);

  /*
   * ------------------------------------------------------------
   * APP SPLASH
   *
   * IMPORTANT:
   * This timer is completely independent from Supabase,
   * push notifications, service workers, Capacitor, etc.
   *
   * Nothing in startup is allowed to keep the application
   * on this screen.
   * ------------------------------------------------------------
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowSplash(false);
    }, 3000);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  /*
   * The HTML document contains a zero-JS boot splash so there is no
   * white flash before React starts. Remove that static layer as soon
   * as React has mounted. If it is left in the DOM it sits above the
   * entire application with a z-index of 2147483647 and makes the web
   * app appear permanently stuck on the splash screen.
   */
  useEffect(() => {
    const bootSplash = document.getElementById("iyanjupay-boot-splash");

    if (bootSplash) {
      bootSplash.remove();
    }
  }, []);

  /*
   * ------------------------------------------------------------
   * AUTH + PUSH RESTORATION
   *
   * Push restoration is deliberately fire-and-forget.
   *
   * A failed/slow push registration MUST NEVER prevent:
   * - React from rendering
   * - routing
   * - login
   * - dashboard
   * - PWA startup
   * ------------------------------------------------------------
   */
  useEffect(() => {
    let mounted = true;

    const restorePushSafely = () => {
      /*
       * Give React/browser startup priority.
       *
       * We deliberately do not await this call.
       */
      window.setTimeout(() => {
        if (!mounted) return;

        void Promise.race([
          restorePushRegistration(),

          new Promise<void>((resolve) => {
            window.setTimeout(resolve, 5000);
          }),
        ]).catch((error) => {
          /*
           * Push errors are background-only.
           * Never show raw backend/native errors to the user.
           */
          console.warn(
            "IyanjuPay push registration skipped:",
            error instanceof Error
              ? error.message
              : "unknown error",
          );
        });
      }, 0);
    };

    const restore = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.warn(
            "IyanjuPay session initialization skipped.",
          );

          return;
        }

        if (!mounted || !session) {
          return;
        }

        restorePushSafely();
      } catch {
        /*
         * Authentication startup failure must never block
         * the application UI.
         */
        console.warn(
          "IyanjuPay authentication initialization skipped.",
        );
      }
    };

    void restore();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (
          !mounted ||
          !session ||
          event === "SIGNED_OUT"
        ) {
          return;
        }

        /*
         * Never execute push restoration directly inside
         * the Supabase auth callback.
         */
        restorePushSafely();
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /*
   * ------------------------------------------------------------
   * SPLASH
   * ------------------------------------------------------------
   */
  if (showSplash) {
    return <AppSplash />;
  }

  /*
   * ------------------------------------------------------------
   * APPLICATION
   * ------------------------------------------------------------
   */
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />

        <BrowserRouter>
          <ThemeGate>
            <Routes>
              {/* =================================================
                  PUBLIC / AUTH
              ================================================= */}

              <Route
                path="/"
                element={<Index />}
              />

              <Route
                path="/signup"
                element={<Index />}
              />

              <Route
                path="/forgot-password"
                element={<ForgotPassword />}
              />

              <Route
                path="/reset-password"
                element={<ResetPassword />}
              />

              <Route
                path="/verify-email-otp"
                element={<VerifyEmailOtp />}
              />

              <Route
                path="/verify-recovery-otp"
                element={<VerifyRecoveryOtp />}
              />

              {/* =================================================
                  ONBOARDING
              ================================================= */}

              <Route
                path="/onboarding"
                element={<OnboardingPage />}
              />

              <Route
                path="/onboarding/bvn"
                element={<OnboardingBvnPage />}
              />

              <Route
                path="/payment-pin"
                element={<PaymentPinPage />}
              />

              <Route
                path="/verify-payment-pin-reset"
                element={<VerifyPaymentPinResetOtp />}
              />

              <Route
                path="/reset-payment-pin"
                element={<ResetPaymentPin />}
              />

              {/* =================================================
                  CUSTOMER
              ================================================= */}

              <Route
                path="/dashboard"
                element={
                  <AppLockGuard>
                    <Dashboard />
                  </AppLockGuard>
                }
              />

              <Route
                path="/send-money"
                element={
                  <AppLockGuard>
                    <SendMoney />
                  </AppLockGuard>
                }
              />

              <Route
                path="/service-payment"
                element={
                  <AppLockGuard>
                    <ServicePayment />
                  </AppLockGuard>
                }
              />

              <Route
                path="/transaction-processing"
                element={
                  <AppLockGuard>
                    <TransactionProcessing />
                  </AppLockGuard>
                }
              />

              <Route
                path="/reward"
                element={
                  <AppLockGuard>
                    <RewardsPage />
                  </AppLockGuard>
                }
              />

              <Route
                path="/notifications"
                element={
                  <AppLockGuard>
                    <UserNotificationsPage />
                  </AppLockGuard>
                }
              />

              <Route
                path="/notifications/:id"
                element={
                  <AppLockGuard>
                    <NotificationDetailsPage />
                  </AppLockGuard>
                }
              />

              <Route
                path="/disputes"
                element={
                  <AppLockGuard>
                    <UserDisputesPage />
                  </AppLockGuard>
                }
              />

              {/* =================================================
                  ADMIN
              ================================================= */}

              <Route
                path="/admin/login"
                element={<AdminLoginPage />}
              />

              <Route
                path="/admin/change-password"
                element={<AdminChangePasswordPage />}
              />

              <Route
                path="/admin"
                element={
                  <AdminRouteGuard>
                    <AdminDashboardPage />
                  </AdminRouteGuard>
                }
              />

              <Route
                path="/admin/dashboard"
                element={
                  <AdminRouteGuard>
                    <AdminDashboardPage />
                  </AdminRouteGuard>
                }
              />

              <Route
                path="/admin/support"
                element={
                  <AdminRouteGuard>
                    <AdminSupportPage />
                  </AdminRouteGuard>
                }
              />

              <Route
                path="/admin/customers"
                element={
                  <AdminRouteGuard>
                    <AdminCustomersPage />
                  </AdminRouteGuard>
                }
              />

              <Route
                path="/admin/transactions"
                element={
                  <AdminRouteGuard>
                    <AdminTransactionsPage />
                  </AdminRouteGuard>
                }
              />

              <Route
                path="/admin/disputes"
                element={
                  <AdminRouteGuard>
                    <AdminDisputesPage />
                  </AdminRouteGuard>
                }
              />

              <Route
                path="/admin/reconciliation"
                element={
                  <AdminRouteGuard>
                    <ReconciliationPage />
                  </AdminRouteGuard>
                }
              />

              <Route
                path="/admin/analytics"
                element={
                  <AdminRouteGuard>
                    <AnalyticsPage />
                  </AdminRouteGuard>
                }
              />

              <Route
                path="/admin/notifications"
                element={
                  <AdminRouteGuard>
                    <NotificationsPage />
                  </AdminRouteGuard>
                }
              />

              <Route
                path="/admin/audit-logs"
                element={
                  <AdminRouteGuard>
                    <AuditLogsPage />
                  </AdminRouteGuard>
                }
              />

              <Route
                path="/admin/management"
                element={
                  <AdminRouteGuard>
                    <AdminManagementPage />
                  </AdminRouteGuard>
                }
              />

              <Route
                path="/admin/settings"
                element={
                  <AdminRouteGuard>
                    <AdminSettingsPage />
                  </AdminRouteGuard>
                }
              />

              {/* =================================================
                  FALLBACK
              ================================================= */}

              <Route
                path="*"
                element={<NotFound />}
              />
            </Routes>
          </ThemeGate>

          <PWAInstallPrompt />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
