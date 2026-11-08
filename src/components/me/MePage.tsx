import React from "react";
import {
  Bell,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Palette,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/theme/ThemeProvider";

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
  onSupportClick,
  onSecurityClick,
  inspectionMode = false,
  inspectionUserName,
  inspectionUserEmail,
}: MePageProps) => {
  const { user: authenticatedUser } = useAuth();
  const { theme, setTheme } = useTheme();

  const user =
    inspectionMode && authenticatedUser
      ? {
          ...authenticatedUser,
          email: inspectionUserEmail ?? null,
          user_metadata: {
            ...authenticatedUser.user_metadata,
            full_name: inspectionUserName || "Customer",
          },
        }
      : authenticatedUser;

  const fullName =
    String(
      user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.email?.split("@")[0] ||
        "Your Name",
    ).trim();

  const nameParts = fullName.split(/\s+/);
  const firstName = nameParts.shift() || fullName;
  const surname = nameParts.join(" ");

  const avatarUrl =
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    "";

  const isVerified = Boolean(user?.email_confirmed_at);

  const cycleAppearance = () => {
    const nextTheme =
      theme === "light" ? "blue" : theme === "blue" ? "dark" : "light";
    setTheme(nextTheme);
  };

  const menuItems = [
    {
      label: "Account Details",
      icon: UserRound,
      onClick: onProfileClick,
    },
    {
      label: "KYC Verification",
      icon: ShieldCheck,
      onClick: onProfileClick,
    },
    {
      label: "Security & Privacy",
      icon: CreditCard,
      onClick: onSecurityClick,
    },
    {
      label: "Notifications",
      icon: Bell,
      onClick: onSecurityClick,
    },
    {
      label: "Appearance",
      icon: Palette,
      onClick: cycleAppearance,
    },
    {
      label: "Help & Support",
      icon: CircleHelp,
      onClick: onSupportClick,
    },
  ];

  return (
    <main
      className="iyanjupay-dashboard iyanjupay-me-page min-h-[calc(100dvh-5rem)] bg-[#f8f7ff] px-5 pb-6 pt-7 text-[#171044] dark:bg-slate-950 dark:text-white"
      data-theme={theme}
    >
      <div className="mx-auto w-full max-w-md">
        <h1 className="mb-7 text-center text-[25px] font-extrabold tracking-tight text-[#171044] dark:text-white">
          My Profile
        </h1>

        <section className="mb-8 flex flex-col items-center text-center">
          <div className="relative mb-4 h-28 w-28 rounded-full bg-[#e9e5ff] p-1.5 ring-2 ring-[#d7d0ff]">
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#dcd5ff]">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={fullName}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <UserRound className="h-14 w-14 text-[#4932a5]" />
              )}
            </div>
            <span
              className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-[#f8f7ff] bg-[#1688ed] text-white dark:border-slate-950"
              aria-label="Profile photo"
            >
              <UserRound className="h-3.5 w-3.5" />
            </span>
          </div>

          <h2 className="text-[25px] font-extrabold leading-tight text-[#171044] dark:text-white">
            <span>{firstName}</span>
            {surname && (
              <span className="ml-1.5 text-[#2875dc]">{surname}</span>
            )}
          </h2>

          <p className="mt-1 text-[16px] font-medium text-[#77738e] dark:text-slate-300">
            {user?.email || "No email address"}
          </p>

          <span
            className={`mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${
              isVerified
                ? "bg-[#d9f8e9] text-[#087c4b]"
                : "bg-[#fff0d8] text-[#9a5b00]"
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            {isVerified ? "Verified" : "Verification pending"}
          </span>
        </section>

        <nav
          aria-label="Profile menu"
          className="overflow-hidden rounded-2xl bg-transparent"
        >
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className={`flex min-h-[76px] w-full items-center gap-5 px-2 text-left transition-colors hover:bg-[#eeeaff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6b4bd8] dark:hover:bg-slate-800 ${
                  index < menuItems.length - 1
                    ? "border-b border-[#ebe8f5] dark:border-slate-800"
                    : ""
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center text-[#24136f] dark:text-[#c7baff]">
                  <Icon className="h-[29px] w-[29px]" strokeWidth={2.4} />
                </span>
                <span className="min-w-0 flex-1 text-[17px] font-bold tracking-tight text-[#171044] dark:text-white">
                  {item.label}
                </span>
                <ChevronRight className="mr-1 h-6 w-6 shrink-0 text-[#4b32a4]" strokeWidth={2.5} />
              </button>
            );
          })}
        </nav>
      </div>
    </main>
  );
};

export default MePage;
