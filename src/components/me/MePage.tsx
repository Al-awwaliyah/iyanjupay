
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
          created_at: inspectionUserCreatedAt ?? undefined,
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
    <main className="iyanjupay-dashboard iyanjupay-me-page min-h-[calc(100dvh-5rem)] bg-[#f8f7ff] px-4 pb-8 pt-6 text-[#171044] transition-colors duration-200 dark:bg-[#080f20] dark:text-[#f4f5ff] sm:px-5">
      <div className="mx-auto w-full max-w-md">
        <h1 className="mb-6 text-center text-[21px] font-bold tracking-tight text-[#171044] dark:text-[#f7f7ff]">
          My Profile
        </h1>

        <section className="mb-7 flex flex-col items-center text-center">
          <div className="relative mb-3 h-[88px] w-[88px] rounded-full bg-[#e9e5ff] p-1 ring-2 ring-[#d7d0ff] dark:bg-[#171d35] dark:ring-[#51449a]/60">
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#ded8ff] dark:bg-[#222847]">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={fullName}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <User className="h-10 w-10 text-[#4932a5] dark:text-[#b6a8ff]" />
              )}
            </div>

            <span
              className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-[3px] border-[#f8f7ff] bg-[#1688ed] text-white dark:border-[#080f20]"
              aria-hidden="true"
            >
              <ShieldCheck className="h-3 w-3" />
            </span>
          </div>

          <h2 className="max-w-full truncate text-[17px] font-bold leading-tight text-[#171044] dark:text-white">
            {fullName}
          </h2>

          <p className="mt-1 max-w-full truncate text-[11px] font-medium text-[#77738e] dark:text-[#a3acc5]">
            {user?.email || "No email address"}
          </p>

          <span
            className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold ${
              emailVerified
                ? "bg-[#d9f8e9] text-[#087c4b] dark:bg-[#103c32] dark:text-[#6ee7b7]"
                : "bg-[#fff0d8] text-[#9a5b00] dark:bg-[#443018] dark:text-[#fcd28a]"
            }`}
          >
            <ShieldCheck className="h-3 w-3" />
            {emailVerified ? "Verified" : "Verification pending"}
          </span>
        </section>

        <nav
          aria-label="Profile menu"
          className="overflow-hidden rounded-2xl border border-[#eeeaf8] bg-white px-3 shadow-[0_4px_20px_rgba(37,25,87,0.035)] dark:border-[#252e49] dark:bg-[#111a2e] dark:shadow-[0_8px_30px_rgba(0,0,0,0.16)]"
        >
          {menuItems.map((item, index) => {
            const Icon = item.icon;

            return (
              <button
                key={item.title}
                type="button"
                onClick={item.onClick}
                className={`group flex min-h-[67px] w-full items-center gap-3 py-3 text-left transition-colors duration-200 hover:bg-[#faf9ff] active:bg-[#f3f0ff] dark:hover:bg-[#1a2640] dark:active:bg-[#202d49] ${
                  index !== menuItems.length - 1
                    ? "border-b border-[#f0edf7] dark:border-[#26304a]"
                    : ""
                }`}
              >
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[#f0edff] text-[#4932a5] transition-colors group-hover:bg-[#e8e2ff] dark:bg-[#28264b] dark:text-[#b9adff] dark:group-hover:bg-[#37315f]">
                  <Icon className="h-[16px] w-[16px]" strokeWidth={1.8} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold leading-5 text-[#21194c] dark:text-[#f0f2ff]">
                    {item.title}
                  </span>

                  <span className="mt-0.5 block truncate text-[10px] font-normal leading-4 text-[#918da5] dark:text-[#a0abc4]">
                    {item.description}
                  </span>
                </span>

                <ChevronRight className="h-[15px] w-[15px] shrink-0 text-[#aaa5bd] transition-transform group-hover:translate-x-0.5 dark:text-[#7885a4]" />
              </button>
            );
          })}
        </nav>

        {!inspectionMode && (
          <div className="mt-5 overflow-hidden rounded-2xl border border-red-100 bg-white px-3 dark:border-[#512b3b] dark:bg-[#171b2c]">
            <button
              type="button"
              onClick={signOut}
              className="flex min-h-[48px] w-full items-center gap-3 text-left text-red-600 transition-colors hover:bg-red-50 dark:text-[#ff858f] dark:hover:bg-[#40202d]/60"
            >
              <span className="flex h-[32px] w-[32px] items-center justify-center rounded-[10px] bg-red-50 dark:bg-[#422331]">
                <LogOut className="h-[15px] w-[15px]" />
              </span>

              <span className="flex-1 text-[12px] font-semibold">
                Sign Out
              </span>

              <ChevronRight className="h-[15px] w-[15px] text-red-300 dark:text-[#c46a7a]" />
            </button>
          </div>
        )}

        {inspectionMode && (
          <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-[11px] leading-5 text-amber-950 dark:border-[#795522] dark:bg-[#382b1b] dark:text-[#f8d89e]">
            Read-only customer inspection. Signing out is
            disabled to protect your administrator session.
          </div>
        )}
      </div>
    </main>
  );
};

export default MePage;
