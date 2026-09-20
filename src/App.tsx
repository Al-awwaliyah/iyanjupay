import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

import React, {
  useEffect,
  useState,
} from "react";

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

/**
 * User Dashboard only owns the IyanjuPay ThemeProvider.
 * Admin routes intentionally render outside the provider so the
 * admin portal has no dependency on the user dashboard theme state.
 */
const ThemeGate = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const isAdminRoute = location.pathname === "/admin" || location.pathname.startsWith("/admin/");

  if (isAdminRoute) {
    return <>{children}</>;
  }

  return <ThemeProvider>{children}</ThemeProvider>;
};

const App = () => {
  const [showSplash, setShowSplash] =
    useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowSplash(false);
    }, 3_000);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const restore = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted || !data.session) return;
      try {
        await restorePushRegistration();
      } catch (error) {
        console.warn("Unable to restore push registration:", error);
      }
    };

    void restore();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || !session || event === "SIGNED_OUT") return;
      window.setTimeout(() => {
        void restorePushRegistration().catch((error) => {
          console.warn("Unable to refresh push registration:", error);
        });
      }, 0);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  /*
   * ============================================================
   * APP SPLASH SCREEN
   * ============================================================
   */

  if (showSplash) {
    return <AppSplash />;
  }

  /*
   * ============================================================
   * MAIN APPLICATION
   * ============================================================
   */

  return (
    <QueryClientProvider
      client={queryClient}
    >
      <TooltipProvider>
        <Toaster />

        <Sonner />

        <BrowserRouter>
          <ThemeGate>
          <Routes>

            {/* ==================================================
                MAIN APPLICATION
            ================================================== */}

            <Route
              path="/"
              element={<Index />}
            />

            {/* ==================================================
                SIGNUP
            ==================================================

            */}

            <Route
              path="/signup"
              element={<Index />}
            />

            <Route
              path="/payment-pin"
              element={<PaymentPinPage />}
            />
            
            
            
            <Route
              path="/dashboard"
              element={<AppLockGuard><Dashboard /></AppLockGuard>}
            />

            <Route
              path="/notifications"
              element={<AppLockGuard><UserNotificationsPage /></AppLockGuard>}
            />

            <Route
              path="/notifications/:id"
              element={<AppLockGuard><NotificationDetailsPage /></AppLockGuard>}
            />

            {/* ==================================================
                EMAIL VERIFICATION
            ================================================== */}

            <Route
              path="/verify-email-otp"
              element={<VerifyEmailOtp />}
            />

            {/* ==================================================
                PROFILE ONBOARDING
            ==================================================

                New users are sent here after successful
                email verification when their profile is
                incomplete.

               
            */}

            <Route
              path="/onboarding"
              element={<OnboardingPage />}
            />

            <Route
              path="/onboarding/bvn"
              element={<OnboardingBvnPage />}
            />
            {/* ==================================================
                PASSWORD RECOVERY
            ================================================== */}

            <Route
              path="/forgot-password"
              element={<ForgotPassword />}
            />

            <Route
              path="/verify-recovery-otp"
              element={
                <VerifyRecoveryOtp />
              }
            />
            <Route
              path="/verify-payment-pin-reset"
              element={<VerifyPaymentPinResetOtp />}
            />

            <Route
              path="/transaction-processing"
              element={<TransactionProcessing />}
            />

            <Route
              path="/send-money"
              element={<SendMoney />}
            />

            <Route
              path="/reward"
              element={<RewardsPage />}
            />
            
            <Route
              path="/reset-payment-pin"
              element={<ResetPaymentPin />}
            />

            <Route
              path="/service-payment"
              element={<ServicePayment />}
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
              path="/admin/customers"
              element={
                <AdminRouteGuard>
                  <AdminCustomersPage />
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
              path="/admin/disputes"
              element={
                <AdminRouteGuard>
                  <AdminDisputesPage />
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

            <Route
              path="/admin/login"
              element={<AdminLoginPage />}
            />

            <Route
              path="/admin/change-password"
              element={<AdminChangePasswordPage />}
            />
            
            <Route
              path="/disputes"
              element={<UserDisputesPage />}
            />
              
            <Route
              path="/reset-password"
              element={<ResetPassword />}
            />

            {/* ==================================================
                404
            ================================================== */}

            <Route
              path="*"
              element={<NotFound />}
            />

          </Routes>
          </ThemeGate>

          {/* ==================================================
              PWA INSTALL PROMPT
          ================================================== */}

          <PWAInstallPrompt />

          </BrowserRouter>
        </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
