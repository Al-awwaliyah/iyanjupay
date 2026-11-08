
import React from "react";

import { useAuth } from "@/hooks/useAuth";

import {
  ChevronRight,
  CreditCard,
  FileWarning,
  HelpCircle,
  History,
  LockKeyhole,
  LogOut,
  MessageCircle,
  ShieldCheck,
  User,
} from "lucide-react";

interface MePageProps {
  onBack: () => void;
  onProfileClick: () => void;
  onHistoryClick: () => void;
  onCustomerServiceClick: () => void;
  onSupportClick: () => void;
  onTransactionLimitClick: () => void;
  onPaymentPinClick: () => void;
  onDisputesClick: () => void;
  onSecurityClick: () => void;
  inspectionMode?: boolean;
  inspectionUserName?: string;
  inspectionUserEmail?: string | null;
  inspectionUserCreatedAt?: string | null;
}

const MePage = ({
  onProfileClick,
  onHistoryClick,
  onCustomerServiceClick,
  onSupportClick,
  onTransactionLimitClick,
  onPaymentPinClick,
  onDisputesClick,
  onSecurityClick,
  inspectionMode = false,
  inspectionUserName,
  inspectionUserEmail,
  inspectionUserCreatedAt,
}: MePageProps) => {
  const {
    user: authenticatedUser,
    signOut,
  } = useAuth();

  const user =
    inspectionMode && authenticatedUser
      ? {
          ...authenticatedUser,
          email: inspectionUserEmail ?? null,
          created_at:
            inspectionUserCreatedAt ?? undefined,
          user_metadata: {
            ...authenticatedUser.user_metadata,
            full_name: inspectionUserName || "Customer",
          },
        }
      : authenticatedUser;

  const fullName = String(
    user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email?.split("@")[0] ||
      "User",
  ).trim();

  const avatarUrl = String(
    user?.user_metadata?.avatar_url ||
      user?.user_metadata?.picture ||
      "",
  );

  const emailVerified = Boolean(user?.email_confirmed_at);

  const menuItems = [
    {
      icon: User,
      title: "Profile",
      description: "Manage your personal information",
      onClick: onProfileClick,
    },
    {
      icon: History,
      title: "Transaction History",
      description: "View all your transactions",
      onClick: onHistoryClick,
    },
    {
      icon: FileWarning,
      title: "Disputes",
      description: "Report and track transaction disputes",
      onClick: onDisputesClick,
    },
    {
      icon: MessageCircle,
      title: "Customer Service",
      description: "Get help and support",
      onClick: onCustomerServiceClick,
    },
    {
      icon: HelpCircle,
      title: "Support",
      description: "FAQs and help center",
      onClick: onSupportClick,
    },
    {
      icon: CreditCard,
      title: "Transaction Limit",
      description: "View and manage limits",
      onClick: onTransactionLimitClick,
    },
    {
      icon: ShieldCheck,
      title: "Security & Notifications",
      description: "Biometrics, app lock and push alerts",
      onClick: onSecurityClick,
    },
    {
      icon: LockKeyhole,
      title: "Payment PIN",
      description: "Change or reset your payment PIN",
      onClick: onPaymentPinClick,
    },
  ];

  return (
    <main data-iyj-me-root="true"
      className="iyanjupay-dashboard iyanjupay-me-page min-h-[calc(100dvh-5rem)] px-4 pb-8 pt-6 transition-colors duration-200 sm:px-5">
      <div className="mx-auto w-full max-w-md">

        {/* Page heading */}
        <h1 data-iyj-me-heading="true"
          className="mb-6 text-center text-[20px] font-bold tracking-tight">
          My Profile
        </h1>

        {/* Profile information */}
        <section className="mb-7 flex flex-col items-center text-center">
          <div className="relative mb-3 h-[88px] w-[88px] rounded-full bg-[#e9e5ff] p-1 ring-2 ring-[#d7d0ff] dark:bg-[#211b3c] dark:ring-[#393052]">
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#ded8ff] dark:bg-[#30264d]">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={fullName}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <User className="h-10 w-10 text-[#4932a5] dark:text-[#c4b5fd]" />
              )}
            </div>

            <span
              className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-[3px] border-[#f8f7ff] bg-[#1688ed] text-white dark:border-[#090817]"
              aria-hidden="true"
            >
              <ShieldCheck className="h-3 w-3" />
            </span>
          </div>

          <h2 className="max-w-full truncate text-[17px] font-bold leading-tight text-[#171044] dark:text-white">
            {fullName}
          </h2>

          <p className="mt-1 max-w-full truncate text-[11px] font-medium text-[#77738e] dark:text-[#b8b3ca]">
            {user?.email || "No email address"}
          </p>

          <span
            className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold ${
              emailVerified
                ? "bg-[#d9f8e9] text-[#087c4b] dark:bg-[#123b30] dark:text-[#86efc1]"
                : "bg-[#fff0d8] text-[#9a5b00] dark:bg-[#453019] dark:text-[#fcd28b]"
            }`}
          >
            <ShieldCheck className="h-3 w-3" />
            {emailVerified ? "Verified" : "Verification pending"}
          </span>
        </section>

        {/* Eight menu items */}
        <nav
          aria-label="Profile menu"
          data-iyj-me-menu="true"
          className="overflow-hidden rounded-2xl border px-3 shadow-[0_4px_20px_rgba(37,25,87,0.035)] transition-colors duration-200"
        >
          {menuItems.map((item, index) => {
            const Icon = item.icon;

            return (
              <button
                key={item.title}
                type="button"
                onClick={item.onClick}
                data-iyj-me-menu-item="true"
                className={`group flex min-h-[67px] w-full items-center gap-3 py-3 text-left transition-colors duration-200 ${
                  index !== menuItems.length - 1
                    ? "border-b border-[#f0edf7] dark:border-[#302a43]"
                    : ""
                }`}
              >
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[#f0edff] text-[#4932a5] transition-colors group-hover:bg-[#e8e2ff] dark:bg-[#30264d] dark:text-[#c4b5fd] dark:group-hover:bg-[#3b305c]">
                  <Icon
                    className="h-[16px] w-[16px]"
                    strokeWidth={1.8}
                  />
                </span>

                <span className="min-w-0 flex-1">
                  <span data-iyj-me-menu-title="true"
                    className="block truncate text-[12px] font-semibold leading-5">
                    {item.title}
                  </span>

                  <span data-iyj-me-menu-description="true"
                    className="mt-0.5 block truncate text-[10px] font-normal leading-4">
                    {item.description}
                  </span>
                </span>

                <ChevronRight className="h-[15px] w-[15px] shrink-0 text-[#aaa5bd] transition-transform group-hover:translate-x-0.5 dark:text-[#88819f]" />
              </button>
            );
          })}
        </nav>

        {/* Sign out */}
        {!inspectionMode && (
          <div data-iyj-me-signout="true"
            className="mt-5 overflow-hidden rounded-2xl border px-3 transition-colors duration-200">
            <button
              type="button"
              onClick={signOut}
              className="flex min-h-[48px] w-full items-center gap-3 text-left text-red-600 transition-colors hover:bg-red-50 dark:text-[#ff858f] dark:hover:bg-[#3b1d2b]"
            >
              <span className="flex h-[32px] w-[32px] items-center justify-center rounded-[10px] bg-red-50 dark:bg-[#40202d]">
                <LogOut className="h-[15px] w-[15px]" />
              </span>

              <span className="flex-1 text-[12px] font-semibold">
                Sign Out
              </span>

              <ChevronRight className="h-[15px] w-[15px] text-red-300 dark:text-[#c97886]" />
            </button>
          </div>
        )}

        {/* Administrator inspection notice */}
        {inspectionMode && (
          <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-[11px] leading-5 text-amber-950 dark:border-[#70501f] dark:bg-[#302514] dark:text-[#ffdf9b]">
            Read-only customer inspection. Signing out is
            disabled to protect your administrator session.
          </div>
        )}
      </div>
    </main>
  );
};

export default MePage;
