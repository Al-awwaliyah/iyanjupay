import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import { Banknote, CreditCard, Eye,
  EyeOff,
  Gift,
  GraduationCap,
  Headphones,
  History,
  Home,
  Loader2,
  LogOut,
  Plus,
  PiggyBank,
  QrCode,
  Receipt,
  Radio,
  Send,
  Shield,
  Smartphone,
  User,
  Wifi,
  Zap,
  Sun,
  Moon,
  Palette,
  Check,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
} from "@/components/ui/card";

import ServiceCard from "./services/ServiceCard";
import FundWalletModal from "./modals/FundWalletModal";
import ServicePayment from "@/pages/ServicePayment";
import QRCodeModal from "./modals/QRCodeModal";
import WhatsAppFloat from "./WhatsAppFloat";
import SupportChat from "./support/SupportChat";
import SendMoneyPage from "@/pages/SendMoney";

import ProfilePage from "./profile/ProfilePage";
import TransactionHistory from "./transactions/TransactionHistory";
import RewardsPage from "./rewards/RewardsPage";
import CardsPage from "./cards/CardsPage";
import MePage from "./me/MePage";

import CustomerServicePage from "./me/CustomerServicePage";
import SupportPage from "./me/SupportPage";
import TransactionLimitPage from "./me/TransactionLimitPage";
import PaymentPinPage from "./me/PaymentPinPage";
import DisputesPage from "./disputes/UserDisputesPage";

import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/*
 * ============================================================
 * SERVICE TYPES
 * ============================================================
 */

type BillService =
  | "airtime"
  | "data"
  | "electricity"
  | "cable"
  | "airtime-card"
  | "data-card"
  | "smile"
  | "waec"
  | "jamb"
  | "internet"
  | "insurance"
  | "savings";

type CurrentPage =
  | "home"
  | "rewards"
  | "cards"
  | "me"
  | "profile"
  | "history"
  | "customer-service"
  | "support"
  | "transaction-limit"
  | "payment-pin"
  | "disputes"
  | "send-money"
  | "service-payment";

type SelectedService = {
  title: string;
  type: BillService;
};

type TransactionStats = {
  monthlySpent: number;
  monthlyTransactions: number;
  successRate: number;
};

type DashboardTransaction = {
  id: string;
  amount: number | string;
  transaction_type: string;
  status: string;
  category: string | null;
  description: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
};

/*
 * ============================================================
 * SUPPORTED SERVICES
 * ============================================================
 */

const SUPPORTED_BILL_SERVICES: BillService[] = [
  "airtime",
  "data",
  "electricity",
  "cable",
  "airtime-card",
  "data-card",
  "smile",
  "waec",
  "jamb",
];

const COMING_SOON_SERVICES: BillService[] = [
  "internet",
  "insurance",
  "savings",
];

/*
 * ============================================================
 * TRANSACTION HELPERS
 * ============================================================
 */

const SUCCESS_STATUSES = new Set([
  "success",
  "successful",
  "completed",
  "complete",
  "succeeded",
]);

const FAILED_STATUSES = new Set([
  "failed",
  "failure",
  "declined",
  "rejected",
  "cancelled",
  "canceled",
  "reversed",
]);

const MONEY_OUT_TYPES = new Set([
  "debit",
  "transfer",
  "bank_transfer",
  "bank-transfer",
  "bill_payment",
  "bill-payment",
  "airtime",
  "data",
  "electricity",
  "cable",
  "internet",
  "payment",
  "withdrawal",
  "withdraw",
  "payout",
  "service_payment",
  "service-payment",
  "airtime_card",
  "airtime-card",
  "data_card",
  "data-card",
  "smile",
  "waec",
  "jamb",
]);

const normalizeText = (
  value: unknown
): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
};

const isSuccessfulTransaction = (
  transaction: DashboardTransaction
): boolean => {
  return SUCCESS_STATUSES.has(
    normalizeText(transaction.status)
  );
};

const isFailedTransaction = (
  transaction: DashboardTransaction
): boolean => {
  return FAILED_STATUSES.has(
    normalizeText(transaction.status)
  );
};

const isMoneyOutTransaction = (
  transaction: DashboardTransaction
): boolean => {
  const type = normalizeText(
    transaction.transaction_type
  );

  const category = normalizeText(
    transaction.category
  );

  const description = normalizeText(
    transaction.description
  );

  const metadata =
    transaction.metadata ?? {};

  const metadataDirection =
    normalizeText(
      metadata?.direction
    );

  const metadataType =
    normalizeText(
      metadata?.type
    );

  const metadataTransactionType =
    normalizeText(
      metadata?.transaction_type
    );

  if (
    type === "credit" ||
    type === "funding" ||
    type === "deposit" ||
    type === "wallet_funding" ||
    type === "wallet-funding" ||
    category === "funding" ||
    category === "deposit" ||
    metadataDirection === "credit" ||
    metadataDirection === "in"
  ) {
    return false;
  }

  if (
    type === "debit" ||
    metadataDirection === "debit" ||
    metadataDirection === "out" ||
    metadataDirection === "outgoing"
  ) {
    return true;
  }

  if (
    MONEY_OUT_TYPES.has(type) ||
    MONEY_OUT_TYPES.has(category) ||
    MONEY_OUT_TYPES.has(metadataType) ||
    MONEY_OUT_TYPES.has(
      metadataTransactionType
    )
  ) {
    return true;
  }

  const moneyOutWords = [
    "transfer",
    "airtime",
    "data",
    "electricity",
    "cable",
    "internet",
    "payment",
    "withdraw",
    "payout",
    "debit",
    "service",
    "smile",
    "waec",
    "jamb",
  ];

  return moneyOutWords.some(
    (word) =>
      description.includes(word)
  );
};

/*
 * ============================================================
 * DASHBOARD
 * ============================================================
 */

const Dashboard = () => {
  const {
    user,
    loading: authLoading,
    signOut,
  } = useAuth();

  const { toast } = useToast();

  /*
   * ============================================================
   * PAGE
   * ============================================================
   */

  const [currentPage, setCurrentPage] =
    useState<CurrentPage>("home");

  /*
   * ============================================================
   * WALLET
   * ============================================================
   */

  const {
    wallet,
    loading: walletLoading,
    refreshWallet,
  } = useWallet(user?.id);

  /*
   * ============================================================
   * MODALS
   * ============================================================
   */

  const [fundModalOpen, setFundModalOpen] =
    useState(false);

  const [qrModalOpen, setQrModalOpen] =
    useState(false);

  const [
    supportChatOpen,
    setSupportChatOpen,
  ] = useState(false);

  const [selectedService, setSelectedService] =
    useState<SelectedService | null>(null);

  const [showBalance, setShowBalance] =
    useState(true);

  /*
   * ============================================================
   * DASHBOARD APPEARANCE
   * ============================================================
   * light = clean light appearance
   * blue  = blue IyanjuPay appearance
   * dark  = dark appearance
   *
   * Dashboard remains the single source of truth.
   */

  type DashboardTheme =
    | "light"
    | "blue"
    | "dark";

  const [dashboardTheme, setDashboardTheme] =
    useState<DashboardTheme>(() => {
      if (
        typeof window ===
        "undefined"
      ) {
        return "light";
      }

      const saved =
        window.localStorage.getItem(
          "iyanjupay-dashboard-theme"
        );

      return saved === "dark" ||
        saved === "blue" ||
        saved === "light"
        ? saved
        : "light";
    });

  const [appearanceOpen, setAppearanceOpen] =
    useState(false);

  useEffect(() => {
    window.localStorage.setItem(
      "iyanjupay-dashboard-theme",
      dashboardTheme
    );

    document.documentElement.dataset.iyanjupayTheme =
      dashboardTheme;

    return () => {
      delete document.documentElement
        .dataset.iyanjupayTheme;
    };
  }, [dashboardTheme]);

  const appearanceConfig = {
    light: {
      label: "Light",
      icon: Sun,
      header:
        "from-[#5b21b6] via-[#6d28d9] to-[#2563eb]",
      wallet:
        "from-[#4c1d95] via-[#6d28d9] to-[#2563eb]",
    },
    blue: {
      label: "Blue",
      icon: Palette,
      header:
        "from-[#082A63] via-[#1554B8] to-[#2563EB]",
      wallet:
        "from-[#082A63] via-[#1554B8] to-[#2563EB]",
    },
    dark: {
      label: "Dark",
      icon: Moon,
      header:
        "from-[#111827] via-[#1E1B4B] to-[#172554]",
      wallet:
        "from-[#111827] via-[#312E81] to-[#1E40AF]",
    },
  } as const;

  const ActiveAppearanceIcon =
    appearanceConfig[
      dashboardTheme
    ].icon;

  /*
   * ============================================================
   * GLOBAL IYANJUPAY THEME
   * ============================================================
   *
   * IMPORTANT:
   * This style is rendered BEFORE all child-page early returns.
   *
   * Therefore Dashboard controls the appearance of:
   * - Dashboard
   * - Rewards
   * - Cards
   * - Me
   * - Profile
   * - History
   * - Support
   * - Customer Service
   * - Transaction Limit
   * - Payment PIN
   * - Disputes
   * - Send Money
   * - Service Payment
   *
   * Child pages do not own theme state.
   *
   * White cards inside the Me/Rewards child pages remain white
   * in Dark mode and their text remains dark/black.
   */

  const dashboardThemeStyles = (
    <style>{`
      .iyanjupay-dashboard {
        background: #f7f8fc;
        color: #0f172a;
        transition:
          background-color 180ms ease,
          color 180ms ease;
      }

      .iyanjupay-theme-blue {
        background: #f4f8ff;
      }

      .iyanjupay-theme-dark {
        background: #090d18;
        color: #f8fafc;
      }

      /*
       * ==========================================================
       * DARK THEME - MAIN DASHBOARD
       * ==========================================================
       */

      .iyanjupay-theme-dark .bg-white {
        background-color: #111827 !important;
      }

      .iyanjupay-theme-dark .bg-slate-50 {
        background-color: #090d18 !important;
      }

      .iyanjupay-theme-dark .bg-slate-100 {
        background-color: #1e293b !important;
      }

      .iyanjupay-theme-dark [class*="border-slate-200"] {
        border-color: #334155 !important;
      }

      .iyanjupay-theme-dark .text-slate-950,
      .iyanjupay-theme-dark .text-slate-900 {
        color: #f8fafc !important;
      }

      .iyanjupay-theme-dark .text-slate-700 {
        color: #e2e8f0 !important;
      }

      .iyanjupay-theme-dark .text-slate-600 {
        color: #cbd5e1 !important;
      }

      .iyanjupay-theme-dark .text-slate-500 {
        color: #94a3b8 !important;
      }

      .iyanjupay-theme-dark .text-slate-400 {
        color: #64748b !important;
      }

      .iyanjupay-theme-dark [class*="hover:bg-slate-50"]:hover {
        background-color: #1e293b !important;
      }

      .iyanjupay-theme-dark .bg-purple-50 {
        background-color: #312e81 !important;
      }

      .iyanjupay-theme-dark .text-purple-700,
      .iyanjupay-theme-dark .text-purple-600 {
        color: #c4b5fd !important;
      }

      .iyanjupay-theme-dark .bg-blue-50 {
        background-color: #172554 !important;
      }

      .iyanjupay-theme-dark .bg-emerald-50 {
        background-color: #052e2b !important;
      }

      .iyanjupay-theme-dark .bg-orange-50 {
        background-color: #431407 !important;
      }

      /*
       * ==========================================================
       * CHILD PAGES
       * ==========================================================
       *
       * MePage and RewardsPage use these page root classes.
       *
       * They remain visually controlled by Dashboard.
       */

      [data-iyanjupay-theme="dark"] .iyanjupay-me-page,
      [data-iyanjupay-theme="dark"] .iyanjupay-rewards-page {
        background: #090d18;
        color: #f8fafc;
      }

      /*
       * White cards in child pages stay WHITE.
       */
      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-white,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-white {
        background-color: #ffffff !important;
      }

      /*
       * ==========================================================
       * WHITE CARD TEXT MUST STAY BLACK
       * ==========================================================
       *
       * This is the central fix for the Me tabs.
       *
       * Even when the overall Dashboard theme is Dark, anything
       * inside a white card remains dark/black and readable.
       */

      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-white,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-white h1,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-white h2,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-white h3,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-white h4,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-white h5,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-white h6,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-white p,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-white span,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-white label,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-white .text-gray-900,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-white .text-gray-800,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-white .text-gray-700,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-white .text-gray-600 {
        color: #111827 !important;
      }

      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-white
        .text-gray-500 {
        color: #4b5563 !important;
      }

      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-white
        .text-gray-400 {
        color: #6b7280 !important;
      }

      /*
       * Rewards white cards receive the same treatment.
       */
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-white,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-white h1,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-white h2,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-white h3,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-white h4,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-white h5,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-white h6,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-white p,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-white span,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-white label,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-white .text-gray-900,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-white .text-gray-800,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-white .text-gray-700,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-white .text-gray-600 {
        color: #111827 !important;
      }

      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-white
        .text-gray-500 {
        color: #4b5563 !important;
      }

      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-white
        .text-gray-400 {
        color: #6b7280 !important;
      }

      /*
       * ==========================================================
       * CHILD PAGE DARK BACKGROUNDS / BORDERS
       * ==========================================================
       */

      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-slate-50,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-slate-50 {
        background-color: #090d18 !important;
      }

      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-slate-100,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-slate-100 {
        background-color: #1e293b !important;
      }

      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        [class*="border-gray-200"],
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        [class*="border-gray-200"] {
        border-color: #334155 !important;
      }

      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        [class*="border-gray-100"],
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        [class*="border-gray-100"] {
        border-color: #334155 !important;
      }

      /*
       * ==========================================================
       * DARK PURPLE ACCENTS
       * ==========================================================
       */

      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-purple-50,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-purple-50 {
        background-color: #312e81 !important;
      }

      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-purple-100,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-purple-100 {
        background-color: #ede9fe !important;
      }

      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .text-purple-700,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .text-purple-600,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .text-purple-700,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .text-purple-600 {
        color: #c4b5fd !important;
      }

      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .bg-purple-100
        .text-purple-600,
      [data-iyanjupay-theme="dark"]
        .iyanjupay-rewards-page
        .bg-purple-100
        .text-purple-600 {
        color: #7c3aed !important;
      }

      /*
       * ==========================================================
       * BLUE THEME
       * ==========================================================
       */

      .iyanjupay-theme-blue .bg-purple-50 {
        background-color: #dbeafe !important;
      }

      .iyanjupay-theme-blue .text-purple-700,
      .iyanjupay-theme-blue .text-purple-600 {
        color: #1d4ed8 !important;
      }

      .iyanjupay-theme-blue .bg-purple-600 {
        background-color: #2563eb !important;
      }

      .iyanjupay-theme-blue [class*="hover:bg-purple-700"]:hover {
        background-color: #1d4ed8 !important;
      }

      [data-iyanjupay-theme="blue"]
        .iyanjupay-me-page
        .bg-purple-50,
      [data-iyanjupay-theme="blue"]
        .iyanjupay-rewards-page
        .bg-purple-50 {
        background-color: #dbeafe !important;
      }

      [data-iyanjupay-theme="blue"]
        .iyanjupay-me-page
        .bg-purple-100,
      [data-iyanjupay-theme="blue"]
        .iyanjupay-rewards-page
        .bg-purple-100 {
        background-color: #dbeafe !important;
      }

      [data-iyanjupay-theme="blue"]
        .iyanjupay-me-page
        .text-purple-700,
      [data-iyanjupay-theme="blue"]
        .iyanjupay-me-page
        .text-purple-600,
      [data-iyanjupay-theme="blue"]
        .iyanjupay-rewards-page
        .text-purple-700,
      [data-iyanjupay-theme="blue"]
        .iyanjupay-rewards-page
        .text-purple-600 {
        color: #1d4ed8 !important;
      }

      [data-iyanjupay-theme="blue"]
        .iyanjupay-me-page
        .border-purple-100,
      [data-iyanjupay-theme="blue"]
        .iyanjupay-rewards-page
        .border-purple-100 {
        border-color: #bfdbfe !important;
      }

      /*
       * ==========================================================
       * SIGN-OUT
       * ==========================================================
       */

      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .text-red-600 {
        color: #dc2626 !important;
      }

      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        .text-red-700 {
        color: #b91c1c !important;
      }

      [data-iyanjupay-theme="dark"]
        .iyanjupay-me-page
        [class*="hover:bg-red-50"]:hover {
        background-color: #fee2e2 !important;
      }
    `}</style>
  );

  /*
   * ============================================================
   * STATS
   * ============================================================
   */

  const [stats, setStats] =
    useState<TransactionStats>({
      monthlySpent: 0,
      monthlyTransactions: 0,
      successRate: 100,
    });

  const [statsLoading, setStatsLoading] =
    useState(true);

  /*
   * ============================================================
   * AUTH REDIRECT
   * ============================================================
   */

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      window.location.replace("/");
    }
  }, [
    authLoading,
    user,
  ]);

  /*
   * ============================================================
   * EDGE FUNCTION ERROR
   * ============================================================
   */

  const extractFunctionError =
    async (
      error: any,
      fallback =
        "Unable to process your request."
    ): Promise<string> => {
      console.error(
        "Supabase function error:",
        error
      );

      try {
        if (
          error?.context &&
          typeof error.context.json ===
            "function"
        ) {
          const response =
            error.context;

          let payload: any = null;

          try {
            payload =
              await response.json();
          } catch {
            payload = null;
          }

          console.error(
            "Edge Function response:",
            payload
          );

          if (payload?.error) {
            return String(
              payload.error
            );
          }

          if (payload?.message) {
            return String(
              payload.message
            );
          }

          if (
            payload?.provider_message
          ) {
            return String(
              payload.provider_message
            );
          }

          if (
            payload?.provider_response
              ?.message
          ) {
            return String(
              payload.provider_response
                .message
            );
          }

          if (
            payload?.provider_response
              ?.data?.message
          ) {
            return String(
              payload.provider_response
                .data.message
            );
          }
        }
      } catch (parseError) {
        console.error(
          "Could not parse Edge Function error:",
          parseError
        );
      }

      if (
        error?.message &&
        error.message !==
          "Edge Function returned a non-2xx status code"
      ) {
        return String(
          error.message
        );
      }

      return fallback;
    };

  /*
   * ============================================================
   * DASHBOARD STATISTICS
   * ============================================================
   */

  const loadDashboardStats =
    useCallback(async () => {
      if (!user?.id) {
        setStats({
          monthlySpent: 0,
          monthlyTransactions: 0,
          successRate: 100,
        });

        setStatsLoading(false);

        return;
      }

      try {
        setStatsLoading(true);

        const {
          data,
          error,
        } =
          await supabase
            .from("transactions")
            .select(
              `
                id,
                amount,
                transaction_type,
                status,
                category,
                description,
                metadata,
                created_at
              `
            )
            .eq(
              "user_id",
              user.id
            )
            .order(
              "created_at",
              {
                ascending: false,
              }
            );

        if (error) {
          throw error;
        }

        const transactions =
          (data ??
            []) as DashboardTransaction[];

        const now = new Date();

        const monthStart =
          new Date(
            now.getFullYear(),
            now.getMonth(),
            1,
            0,
            0,
            0,
            0
          );

        const monthEnd =
          new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            1,
            0,
            0,
            0,
            0
          );

        const monthlyTransactions =
          transactions.filter(
            (transaction) => {
              const createdAt =
                new Date(
                  transaction.created_at
                );

              return (
                createdAt >=
                  monthStart &&
                createdAt < monthEnd
              );
            }
          );

        const monthlySpent =
          monthlyTransactions
            .filter(
              (transaction) =>
                isSuccessfulTransaction(
                  transaction
                ) &&
                isMoneyOutTransaction(
                  transaction
                )
            )
            .reduce(
              (
                total,
                transaction
              ) => {
                const amount =
                  Number(
                    transaction.amount
                  );

                if (
                  !Number.isFinite(
                    amount
                  )
                ) {
                  return total;
                }

                return (
                  total + amount
                );
              },
              0
            );

        const successfulCount =
          transactions.filter(
            isSuccessfulTransaction
          ).length;

        const failedCount =
          transactions.filter(
            isFailedTransaction
          ).length;

        const terminalTransactions =
          successfulCount +
          failedCount;

        const successRate =
          terminalTransactions ===
          0
            ? 100
            : Math.round(
                (successfulCount /
                  terminalTransactions) *
                  100
              );

        setStats({
          monthlySpent,
          monthlyTransactions:
            monthlyTransactions.length,
          successRate,
        });
      } catch (error) {
        console.error(
          "Dashboard statistics error:",
          error
        );

        setStats({
          monthlySpent: 0,
          monthlyTransactions: 0,
          successRate: 0,
        });
      } finally {
        setStatsLoading(false);
      }
    }, [user?.id]);

  useEffect(() => {
    if (
      authLoading ||
      !user
    ) {
      return;
    }

    void loadDashboardStats();
  }, [
    authLoading,
    user,
    loadDashboardStats,
  ]);

  /*
   * ============================================================
   * REALTIME TRANSACTIONS
   * ============================================================
   */

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const channel =
      supabase
        .channel(
          `dashboard-transactions-${user.id}`
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "transactions",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            void loadDashboardStats();
          }
        )
        .subscribe();

    return () => {
      void supabase.removeChannel(
        channel
      );
    };
  }, [
    user?.id,
    loadDashboardStats,
  ]);

  /*
   * ============================================================
   * WALLET BOOTSTRAP
   * ============================================================
   */

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    let cancelled = false;

    const bootstrapWallet =
      async () => {
        try {
          const {
            data,
            error,
          } =
            await supabase.functions.invoke(
              "wallet-bootstrap",
              {
                body: {},
              }
            );

          if (cancelled) {
            return;
          }

          if (error) {
            console.error(
              "Wallet bootstrap error:",
              error
            );

            return;
          }

          console.log(
            "Wallet bootstrap:",
            data
          );

          await refreshWallet();

          await loadDashboardStats();
        } catch (error) {
          if (cancelled) {
            return;
          }

          console.error(
            "Wallet bootstrap failed:",
            error
          );
        }
      };

    void bootstrapWallet();

    return () => {
      cancelled = true;
    };
  }, [
    user?.id,
    refreshWallet,
    loadDashboardStats,
  ]);

  /*
   * ============================================================
   * SERVICES
   * ============================================================
   */

  const services = [
    {
      title: "Buy Airtime",
      description:
        "Recharge your phone instantly",
      icon: Smartphone,
      color: "bg-blue-500",
      type: "airtime" as BillService,
      available: true,
    },
    {
      title: "Buy Data",
      description:
        "Fast data bundles",
      icon: Wifi,
      color: "bg-purple-500",
      type: "data" as BillService,
      available: true,
    },
    {
      title: "Electricity",
      description:
        "Pay your power bill",
      icon: Zap,
      color: "bg-yellow-500",
      type: "electricity" as BillService,
      available: true,
    },
    {
      title: "Cable TV",
      description:
        "DSTV, GOTV & Startimes",
      icon: CreditCard,
      color: "bg-red-500",
      type: "cable" as BillService,
      available: true,
    },
    {
      title: "Airtime E-Pin",
      description:
        "Buy recharge PINs",
      icon: Receipt,
      color: "bg-green-500",
      type: "airtime-card" as BillService,
      available: true,
    },
    {
      title: "Data E-Pin",
      description:
        "Buy data PINs",
      icon: Radio,
      color: "bg-indigo-500",
      type: "data-card" as BillService,
      available: true,
    },
    {
      title: "Smile",
      description:
        "Smile data bundles",
      icon: Wifi,
      color: "bg-cyan-500",
      type: "smile" as BillService,
      available: true,
    },
    {
      title: "WAEC",
      description:
        "WAEC services",
      icon: GraduationCap,
      color: "bg-orange-500",
      type: "waec" as BillService,
      available: true,
    },
    {
      title: "JAMB",
      description:
        "JAMB services",
      icon: GraduationCap,
      color: "bg-emerald-500",
      type: "jamb" as BillService,
      available: true,
    },
    {
      title: "Internet Bills",
      description:
        "Coming soon",
      icon: Wifi,
      color: "bg-slate-500",
      type: "internet" as BillService,
      available: false,
    },
    {
      title: "Insurance",
      description:
        "Coming soon",
      icon: Shield,
      color: "bg-teal-500",
      type: "insurance" as BillService,
      available: false,
    },
    {
      title: "Savings",
      description:
        "Coming soon",
      icon: PiggyBank,
      color: "bg-pink-500",
      type: "savings" as BillService,
      available: false,
    },
  ];

  /*
   * ============================================================
   * SERVICE CLICK
   * ============================================================
   */

  const handleServiceClick = (
    service: (typeof services)[number]
  ) => {
    if (
      COMING_SOON_SERVICES.includes(
        service.type
      )
    ) {
      toast({
        title: "Coming soon",
        description:
          `${service.title} is not yet available.`,
      });

      return;
    }

    if (
      !service.available ||
      !SUPPORTED_BILL_SERVICES.includes(
        service.type
      )
    ) {
      toast({
        title:
          "Service unavailable",
        description:
          `${service.title} is not currently available.`,
        variant:
          "destructive",
      });

      return;
    }

    setSelectedService({
      title: service.title,
      type: service.type,
    });

    setCurrentPage(
      "service-payment"
    );
  };

  /*
   * ============================================================
   * SERVICE PURCHASE
   * ============================================================
   */

  const handlePurchase = async (
    amount: number,
    details: Record<string, any>
  ): Promise<void> => {
    if (!user) {
      throw new Error(
        "Authentication required. Please log in again."
      );
    }

    if (!selectedService) {
      throw new Error(
        "Please select a service."
      );
    }

    const service =
      selectedService.type;

    if (
      !SUPPORTED_BILL_SERVICES.includes(
        service
      )
    ) {
      throw new Error(
        `${selectedService.title} is not currently available.`
      );
    }

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw new Error(
        "Please enter a valid payment amount."
      );
    }

    const currentBalance =
      Number(
        wallet?.balance ?? 0
      );

    if (
      amount > currentBalance
    ) {
      throw new Error(
        "Insufficient wallet balance. Please fund your wallet."
      );
    }

    const paymentDetails = {
      ...details,
      service,
      amount,
      country:
        String(
          details?.country ?? "NG"
        )
          .trim()
          .toUpperCase() || "NG",
    };

    toast({
      title:
        "Processing payment",
      description:
        `Processing ${selectedService.title.toLowerCase()}...`,
    });

    try {
      const {
        data,
        error,
      } =
        await supabase.functions.invoke(
          "clubkonnect-services",
          {
            body: {
              action: "purchase",

              service,

              amount,

              country:
                paymentDetails.country,

              customer:
                paymentDetails.customer,

              biller_code:
                paymentDetails.biller_code,

              network_code:
                paymentDetails.network_code,

              item_code:
                paymentDetails.item_code,

              product_code:
                paymentDetails.product_code,

              variation_code:
                paymentDetails.variation_code,

              meter_type:
                paymentDetails.meter_type,

              meter_number:
                paymentDetails.meter_number,

              meter_no:
                paymentDetails.meter_no,

              smartcard_no:
                paymentDetails.smartcard_no,

              smartcard_number:
                paymentDetails.smartcard_number,

              phone_no:
                paymentDetails.phone_no,

              phone:
                paymentDetails.phone,

              phoneNumber:
                paymentDetails.phoneNumber,

              mobile_number:
                paymentDetails.mobile_number,

              account_id:
                paymentDetails.account_id,

              data_plan:
                paymentDetails.data_plan,

              package:
                paymentDetails.package,

              package_code:
                paymentDetails.package_code,

              electric_company:
                paymentDetails.electric_company,

              cable_tv:
                paymentDetails.cable_tv,

              exam_type:
                paymentDetails.exam_type,

              value:
                paymentDetails.value,

              quantity:
                Number(
                  paymentDetails.quantity ??
                    1
                ),

              details:
                paymentDetails,
            },
          }
        );

      if (error) {
        const message =
          await extractFunctionError(
            error,
            "Unable to process this service payment."
          );

        throw new Error(
          message
        );
      }

      if (
        !data ||
        data.success !== true
      ) {
        throw new Error(
          data?.error ||
            data?.message ||
            data?.provider_message ||
            "Service payment failed."
        );
      }

      await refreshWallet();

      await loadDashboardStats();

      const normalizedStatus =
        String(
          data?.status ?? ""
        )
          .trim()
          .toLowerCase();

      const isPending =
        normalizedStatus ===
          "pending" ||
        normalizedStatus ===
          "processing" ||
        normalizedStatus ===
          "order_received" ||
        normalizedStatus ===
          "order_processed" ||
        normalizedStatus ===
          "on_hold" ||
        normalizedStatus ===
          "300" ||
        normalizedStatus ===
          "399" ||
        normalizedStatus ===
          "201";

      toast({
        title: isPending
          ? "Payment Processing"
          : "Payment Successful",
        description:
          data?.message ||
          (isPending
            ? `${selectedService.title} payment is being processed.`
            : `${selectedService.title} payment was completed successfully.`),
      });
    } catch (error: any) {
      console.error(
        "Service payment failed:",
        error
      );

      throw new Error(
        error?.message ||
          "Unable to complete this service payment."
      );
    }
  };

  /*
   * ============================================================
   * BANK TRANSFER
   * ============================================================
   */

  const handleTransfer = async (
    amount: number,
    details: any
  ) => {
    if (!user) {
      toast({
        title:
          "Authentication required",
        description:
          "Please log in again.",
        variant:
          "destructive",
      });

      return;
    }

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      toast({
        title:
          "Invalid amount",
        description:
          "Please enter a valid transfer amount.",
        variant:
          "destructive",
      });

      return;
    }

    if (
      details?.type ===
        "iyanjupay" ||
      details?.transferType ===
        "iyanjupay" ||
      details?.recipientType ===
        "iyanjupay"
    ) {
      toast({
        title:
          "Transfer routing error",
        description:
          "Please try the IyanjuPay transfer again.",
        variant:
          "destructive",
      });

      return;
    }

    if (
      wallet &&
      amount >
        Number(wallet.balance)
    ) {
      toast({
        title:
          "Insufficient Balance",
        description:
          "Please fund your wallet to continue.",
        variant:
          "destructive",
      });

      return;
    }

    if (
      !details?.accountNumber
    ) {
      toast({
        title:
          "Invalid recipient",
        description:
          "Recipient bank account is missing.",
        variant:
          "destructive",
      });

      return;
    }

    if (!details?.bankCode) {
      toast({
        title:
          "Invalid bank",
        description:
          "Recipient bank code is missing.",
        variant:
          "destructive",
      });

      return;
    }

    if (!details?.recipient) {
      toast({
        title:
          "Invalid recipient",
        description:
          "Verified recipient name is missing.",
        variant:
          "destructive",
      });

      return;
    }

    try {
      const idempotencyKey =
        `transfer_${user.id}_${Date.now()}_${crypto.randomUUID()}`;

      toast({
        title:
          "Processing transfer",
        description:
          "Please wait while we send your money.",
      });

      const {
        data,
        error,
      } =
        await supabase.functions.invoke(
          "flutterwave-transfer",
          {
            body: {
              amount,

              account_number:
                details.accountNumber,

              account_bank:
                details.bankCode,

              beneficiary_name:
                details.recipient,

              narration:
                details.narration ||
                "IyanjuPay bank transfer",

              idempotency_key:
                idempotencyKey,
            },
          }
        );

      if (error) {
        const message =
          await extractFunctionError(
            error,
            "Unable to process bank transfer."
          );

        throw new Error(
          message
        );
      }

      if (
        !data ||
        data.success !== true
      ) {
        throw new Error(
          data?.error ||
            data?.message ||
            "Bank transfer failed."
        );
      }

      await refreshWallet();

      await loadDashboardStats();

      toast({
        title:
          "Transfer Processing",
        description:
          data?.message ||
          `₦${amount.toLocaleString()} sent to ${details.recipient}.`,
      });
    } catch (error: any) {
      console.error(
        "Bank transfer failed:",
        error
      );

      toast({
        title:
          "Transfer Failed",
        description:
          error?.message ||
          "Unable to complete the bank transfer.",
        variant:
          "destructive",
      });
    }
  };

  /*
   * ============================================================
   * AUTH LOADING
   * ============================================================
   */

  if (authLoading) {
    return (
      <>
        {dashboardThemeStyles}

        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            </div>

            <p className="mt-5 text-sm font-medium text-slate-600">
              Preparing your IyanjuPay account...
            </p>
          </div>
        </div>
      </>
    );
  }

  /*
   * ============================================================
   * NO USER
   * ============================================================
   */

  if (!user) {
    return (
      <>
        {dashboardThemeStyles}

        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        </div>
      </>
    );
  }

  /*
   * ============================================================
   * BOTTOM NAVIGATION
   *
   * IMPORTANT:
   * This is declared BEFORE the early page returns so it can
   * also be rendered on Rewards, Cards and Me.
   * ============================================================
   */

  const renderBottomNav = (
    page: CurrentPage
  ) => (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 bg-white/95 px-3 py-2 shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <div className="mx-auto max-w-3xl">
        <div className="grid grid-cols-4 gap-1">

          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setCurrentPage(
                "home"
              )
            }
            className={`h-14 rounded-2xl ${
              page === "home"
                ? "bg-purple-50 text-purple-700"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <span className="flex flex-col items-center gap-1">
              <Home className="h-5 w-5" />

              <span className="text-[11px] font-semibold">
                Home
              </span>
            </span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setCurrentPage(
                "rewards"
              )
            }
            className={`h-14 rounded-2xl ${
              page === "rewards"
                ? "bg-purple-50 text-purple-700"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <span className="flex flex-col items-center gap-1">
              <Gift className="h-5 w-5" />

              <span className="text-[11px] font-semibold">
                Rewards
              </span>
            </span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setCurrentPage(
                "cards"
              )
            }
            className={`h-14 rounded-2xl ${
              page === "cards"
                ? "bg-purple-50 text-purple-700"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <span className="flex flex-col items-center gap-1">
              <CreditCard className="h-5 w-5" />

              <span className="text-[11px] font-semibold">
                Cards
              </span>
            </span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setCurrentPage(
                "me"
              )
            }
            className={`h-14 rounded-2xl ${
              page === "me"
                ? "bg-purple-50 text-purple-700"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <span className="flex flex-col items-center gap-1">
              <User className="h-5 w-5" />

              <span className="text-[11px] font-semibold">
                Me
              </span>
            </span>
          </Button>

        </div>
      </div>
    </div>
  );

  /*
   * ============================================================
   * SERVICE PAYMENT
   * ============================================================
   */

  if (
    currentPage ===
    "service-payment"
  ) {
    return (
      <>
        {dashboardThemeStyles}

        <ServicePayment
          service={
            selectedService
          }
          walletBalance={Number(
            wallet?.balance ?? 0
          )}
          onBack={() => {
            setSelectedService(
              null
            );

            setCurrentPage(
              "home"
            );
          }}
          onPurchase={
            handlePurchase
          }
          onHistory={() => {
            setSelectedService(
              null
            );

            setCurrentPage(
              "history"
            );
          }}
        />
      </>
    );
  }

  /*
   * ============================================================
   * SEND MONEY
   * ============================================================
   */

  if (
    currentPage ===
    "send-money"
  ) {
    return (
      <>
        {dashboardThemeStyles}

        <SendMoneyPage
          onBack={() =>
            setCurrentPage(
              "home"
            )
          }
          walletBalance={Number(
            wallet?.balance ?? 0
          )}
          onTransfer={
            handleTransfer
          }
        />
      </>
    );
  }

  /*
   * ============================================================
   * PROFILE
   * ============================================================
   */

  if (
    currentPage ===
    "profile"
  ) {
    return (
      <>
        {dashboardThemeStyles}

        <ProfilePage
          onBack={() =>
            setCurrentPage(
              "me"
            )
          }
        />
      </>
    );
  }

  /*
   * ============================================================
   * HISTORY
   * ============================================================
   */

  if (
    currentPage ===
    "history"
  ) {
    return (
      <>
        {dashboardThemeStyles}

        <TransactionHistory
          onBack={() =>
            setCurrentPage(
              "me"
            )
          }
        />
      </>
    );
  }

  /*
   * ============================================================
   * REWARDS
   * ============================================================
   */

  if (
    currentPage ===
    "rewards"
  ) {
    return (
      <>
        {dashboardThemeStyles}

        <div className="min-h-screen pb-20">
          <RewardsPage
            onBack={() =>
              setCurrentPage(
                "home"
              )
            }
          />

          {renderBottomNav(
            "rewards"
          )}
        </div>
      </>
    );
  }

  /*
   * ============================================================
   * CARDS
   * ============================================================
   */

  if (
    currentPage ===
    "cards"
  ) {
    return (
      <>
        {dashboardThemeStyles}

        <div className="min-h-screen pb-20">
          <CardsPage
            onBack={() =>
              setCurrentPage(
                "home"
              )
            }
          />

          {renderBottomNav(
            "cards"
          )}
        </div>
      </>
    );
  }

  /*
   * ============================================================
   * CUSTOMER SERVICE
   * ============================================================
   */

  if (
    currentPage ===
    "customer-service"
  ) {
    return (
      <>
        {dashboardThemeStyles}

        <CustomerServicePage
          onBack={() =>
            setCurrentPage(
              "me"
            )
          }
        />
      </>
    );
  }

  /*
   * ============================================================
   * SUPPORT
   * ============================================================
   */

  if (
    currentPage ===
    "support"
  ) {
    return (
      <>
        {dashboardThemeStyles}

        <SupportPage
          onBack={() =>
            setCurrentPage(
              "me"
            )
          }
        />
      </>
    );
  }

  /*
   * ============================================================
   * TRANSACTION LIMIT
   * ============================================================
   */

  if (
    currentPage ===
    "transaction-limit"
  ) {
    return (
      <>
        {dashboardThemeStyles}

        <TransactionLimitPage
          onBack={() =>
            setCurrentPage(
              "me"
            )
          }
        />
      </>
    );
  }

  /*
   * ============================================================
   * PAYMENT PIN
   * ============================================================
   */

  if (
    currentPage ===
    "payment-pin"
  ) {
    return (
      <>
        {dashboardThemeStyles}

        <PaymentPinPage
          onBack={() =>
            setCurrentPage(
              "me"
            )
          }
        />
      </>
    );
  }

  /*
   * ============================================================
   * DISPUTES
   * ============================================================
   */

  if (
    currentPage ===
    "disputes"
  ) {
    return (
      <>
        {dashboardThemeStyles}

        <DisputesPage
          onBack={() =>
            setCurrentPage(
              "me"
            )
          }
        />
      </>
    );
  }

  /*
   * ============================================================
   * ME
   * ============================================================
   */

  if (
    currentPage ===
    "me"
  ) {
    return (
      <>
        {dashboardThemeStyles}

        <div className="min-h-screen pb-20">
          <MePage
            onBack={() =>
              setCurrentPage(
                "home"
              )
            }
            onProfileClick={() =>
              setCurrentPage(
                "profile"
              )
            }
            onHistoryClick={() =>
              setCurrentPage(
                "history"
              )
            }
            onCustomerServiceClick={() =>
              setCurrentPage(
                "customer-service"
              )
            }
            onSupportClick={() =>
              setCurrentPage(
                "support"
              )
            }
            onTransactionLimitClick={() =>
              setCurrentPage(
                "transaction-limit"
              )
            }
            onPaymentPinClick={() =>
              setCurrentPage(
                "payment-pin"
              )
            }
            onDisputesClick={() =>
              setCurrentPage(
                "disputes"
              )
            }
          />

          {renderBottomNav(
            "me"
          )}
        </div>
      </>
    );
  }

  /*
   * ============================================================
   * WALLET LOADING
   * ============================================================
   */

  if (walletLoading) {
    return (
      <>
        {dashboardThemeStyles}

        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            </div>

            <p className="mt-5 text-sm font-medium text-slate-600">
              Loading your wallet...
            </p>
          </div>
        </div>
      </>
    );
  }

  /*
   * ============================================================
   * BALANCE
   * ============================================================
   */

  const balance =
    Number(
      wallet?.balance ?? 0
    );

  const formattedBalance =
    balance.toLocaleString(
      "en-NG",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }
    );

  /*
   * ============================================================
   * USER DISPLAY NAME
   * ============================================================
   */

  const displayName =
    user?.user_metadata
      ?.full_name ||
    user?.user_metadata
      ?.name ||
    user?.email?.split("@")[0] ||
    "there";

  const firstName =
    String(displayName)
      .trim()
      .split(/\s+/)[0] ||
    "there";

  /*
   * ============================================================
   * MAIN DASHBOARD
   * ============================================================
   */

  return (
    <>
      {dashboardThemeStyles}

      <div
        className={`min-h-screen pb-24 iyanjupay-dashboard iyanjupay-theme-${dashboardTheme}`}
        data-theme={
          dashboardTheme
        }
      >

        {/* ====================================================== */}
        {/* TOP HEADER                                             */}
        {/* ====================================================== */}

        <header
          className={`sticky top-0 z-30 border-b border-white/10 bg-gradient-to-r ${appearanceConfig[dashboardTheme].header} text-white shadow-lg`}
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-[72px] items-center justify-between">

              <button
                type="button"
                onClick={() =>
                  setCurrentPage(
                    "home"
                  )
                }
                className="flex items-center gap-3"
                aria-label="Go to IyanjuPay home"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-md">
                  <span className="text-sm font-black text-purple-700">
                    IP
                  </span>
                </div>

                <div className="hidden sm:block">
                  <p className="text-lg font-black tracking-tight">
                    IyanjuPay
                  </p>

                  <p className="text-[10px] font-medium text-purple-100">
                    Your money. Your control.
                  </p>
                </div>
              </button>

              <div className="flex items-center gap-1 sm:gap-2">

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setQrModalOpen(
                      true
                    )
                  }
                  className="h-10 w-10 rounded-full p-0 text-white hover:bg-white/15"
                  aria-label="Show QR code"
                >
                  <QrCode className="h-5 w-5" />
                </Button>

                {/* APPEARANCE */}

                <div className="relative">

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setAppearanceOpen(
                        (open) =>
                          !open
                      )
                    }
                    className="h-10 w-10 rounded-full p-0 text-white hover:bg-white/15"
                    aria-label="Change dashboard appearance"
                    aria-expanded={
                      appearanceOpen
                    }
                    aria-haspopup="menu"
                  >
                    <ActiveAppearanceIcon className="h-5 w-5" />
                  </Button>

                  {appearanceOpen && (
                    <div
                      role="menu"
                      aria-label="Dashboard appearance"
                      className="absolute right-0 top-12 z-[60] w-40 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 text-slate-900 shadow-2xl"
                    >

                      <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Appearance
                      </div>

                      {(
                        Object.keys(
                          appearanceConfig
                        ) as DashboardTheme[]
                      ).map(
                        (
                          theme
                        ) => {
                          const ThemeIcon =
                            appearanceConfig[
                              theme
                            ].icon;

                          return (
                            <button
                              key={
                                theme
                              }
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setDashboardTheme(
                                  theme
                                );

                                setAppearanceOpen(
                                  false
                                );
                              }}
                              className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold transition ${
                                dashboardTheme ===
                                theme
                                  ? "bg-slate-100 text-slate-900"
                                  : "text-slate-600 hover:bg-slate-50"
                              }`}
                            >

                              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100">
                                <ThemeIcon className="h-3.5 w-3.5" />
                              </span>

                              <span className="flex-1">
                                {
                                  appearanceConfig[
                                    theme
                                  ].label
                                }
                              </span>

                              {dashboardTheme ===
                                theme && (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              )}

                            </button>
                          );
                        }
                      )}

                    </div>
                  )}

                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setCurrentPage(
                      "history"
                    )
                  }
                  className="hidden h-10 w-10 rounded-full p-0 text-white hover:bg-white/15 sm:flex"
                  aria-label="Transaction history"
                >
                  <History className="h-5 w-5" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setCurrentPage(
                      "me"
                    )
                  }
                  className="h-10 w-10 rounded-full p-0 text-white hover:bg-white/15"
                  aria-label="Open profile"
                >
                  <User className="h-5 w-5" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={
                    signOut
                  }
                  className="hidden h-10 w-10 rounded-full p-0 text-white hover:bg-white/15 sm:flex"
                  aria-label="Sign out"
                >
                  <LogOut className="h-5 w-5" />
                </Button>

              </div>
            </div>
          </div>
        </header>

        {/* ====================================================== */}
        {/* MAIN CONTENT                                           */}
        {/* ====================================================== */}

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">

          {/* GREETING */}

          <section className="mb-6">

            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">

              <div>

                <p className="mb-1 text-sm font-medium text-purple-600">
                  Welcome back
                </p>

                <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                  Hello, {firstName} 👋
                </h1>

                <p className="mt-1 text-sm text-slate-500 sm:text-base">
                  What would you like to do today?
                </p>

              </div>

              <div className="hidden rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm sm:flex sm:items-center sm:gap-2">

                <span className="h-2 w-2 rounded-full bg-emerald-500" />

                Account active

              </div>

            </div>

          </section>

          {/* WALLET HERO */}

          <section className="mb-7">

            <Card
              className={`relative overflow-hidden rounded-[28px] border-0 bg-gradient-to-br ${appearanceConfig[dashboardTheme].wallet} text-white shadow-[0_20px_60px_rgba(79,70,229,0.22)]`}
            >

              <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/10" />

              <div className="pointer-events-none absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-white/5" />

              <CardContent className="relative p-5 sm:p-7">

                <div className="flex flex-col gap-7">

                  <div className="flex items-start justify-between gap-4">

                    <div>

                      <div className="flex items-center gap-2">

                        <p className="text-sm font-medium text-purple-100">
                          Available Balance
                        </p>

                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-100">
                          NGN
                        </span>

                      </div>

                      <div className="mt-2 flex items-center gap-3">

                        <span className="text-3xl font-black tracking-tight sm:text-4xl">

                          ₦
                          {showBalance
                            ? formattedBalance
                            : "••••••"}

                        </span>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setShowBalance(
                              (
                                previous
                              ) =>
                                !previous
                            )
                          }
                          className="h-9 w-9 rounded-full bg-white/10 p-0 text-white hover:bg-white/20"
                          aria-label={
                            showBalance
                              ? "Hide balance"
                              : "Show balance"
                          }
                        >
                          {showBalance ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>

                      </div>

                      <p className="mt-2 text-xs text-purple-100">
                        Ready to spend securely
                      </p>

                    </div>

                    <div className="hidden text-right sm:block">

                      <p className="text-xs font-medium text-purple-100">
                        Wallet ID
                      </p>

                      <p className="mt-1 max-w-[180px] truncate font-mono text-sm font-bold tracking-wider">
                        {wallet?.wallet_id ||
                          "—"}
                      </p>

                    </div>

                  </div>

                  <div className="grid grid-cols-2 gap-3">

                    <Button
                      onClick={() =>
                        setFundModalOpen(
                          true
                        )
                      }
                      className="h-12 rounded-2xl bg-white text-purple-700 shadow-lg hover:bg-purple-50"
                    >
                      <Plus className="mr-2 h-5 w-5" />

                      <span className="font-bold">
                        Add Money
                      </span>
                    </Button>

                    <Button
                      onClick={() =>
                        setCurrentPage(
                          "send-money"
                        )
                      }
                      className="h-12 rounded-2xl border border-white/30 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
                    >
                      <Send className="mr-2 h-5 w-5" />

                      <span className="font-bold">
                        Send Money
                      </span>
                    </Button>

                  </div>

                  <div className="flex items-center justify-between border-t border-white/10 pt-4 sm:hidden">

                    <span className="text-xs text-purple-100">
                      Wallet ID
                    </span>

                    <span className="font-mono text-xs font-bold tracking-wider text-white">
                      {wallet?.wallet_id ||
                        "—"}
                    </span>

                  </div>

                </div>

              </CardContent>

            </Card>

          </section>

          {/* QUICK ACTIONS */}

          <section className="mb-8">

            <div className="mb-3 flex items-center justify-between">

              <div>

                <h2 className="text-lg font-black text-slate-950">
                  Quick Actions
                </h2>

                <p className="text-xs text-slate-500">
                  Get things done faster
                </p>

              </div>

            </div>

            <div className="grid grid-cols-4 gap-2 sm:gap-3">

              <button
                type="button"
                onClick={() =>
                  handleServiceClick(
                    services[0]
                  )
                }
                className="group rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md sm:p-4"
              >
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition group-hover:scale-105">
                  <Smartphone className="h-5 w-5" />
                </div>

                <p className="mt-2 text-[11px] font-bold text-slate-700 sm:text-xs">
                  Airtime
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleServiceClick(
                    services[1]
                  )
                }
                className="group rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-purple-200 hover:shadow-md sm:p-4"
              >
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 transition group-hover:scale-105">
                  <Wifi className="h-5 w-5" />
                </div>

                <p className="mt-2 text-[11px] font-bold text-slate-700 sm:text-xs">
                  Data
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  setCurrentPage(
                    "send-money"
                  )
                }
                className="group rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md sm:p-4"
              >
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition group-hover:scale-105">
                  <Send className="h-5 w-5" />
                </div>

                <p className="mt-2 text-[11px] font-bold text-slate-700 sm:text-xs">
                  Transfer
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  setCurrentPage(
                    "history"
                  )
                }
                className="group rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md sm:p-4"
              >
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 transition group-hover:scale-105">
                  <History className="h-5 w-5" />
                </div>

                <p className="mt-2 text-[11px] font-bold text-slate-700 sm:text-xs">
                  History
                </p>
              </button>

            </div>
          </section>

          {/* SERVICES */}

          <section className="mb-8">

            <div className="mb-4 flex items-end justify-between">

              <div>

                <h2 className="text-xl font-black tracking-tight text-slate-950">
                  Services
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Everything you need, in one place
                </p>

              </div>

              <span className="hidden rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700 sm:block">
                9 available
              </span>

            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">

              {services.map(
                (
                  service,
                  index
                ) => (
                  <div
                    key={`${service.type}-${index}`}
                    className={
                      service.available
                        ? "transition hover:-translate-y-0.5"
                        : "opacity-80"
                    }
                  >
                    <ServiceCard
                      title={
                        service.title
                      }
                      description={
                        service.description
                      }
                      icon={
                        service.icon
                      }
                      color={
                        service.color
                      }
                      onClick={() =>
                        handleServiceClick(
                          service
                        )
                      }
                    />
                  </div>
                )
              )}

            </div>

          </section>

          {/* ACCOUNT OVERVIEW */}

          <section className="mb-8">

            <div className="mb-4">

              <h2 className="text-xl font-black tracking-tight text-slate-950">
                Account Overview
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                A quick view of your activity
              </p>

            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

              <Card className="rounded-3xl border-slate-200/80 bg-white shadow-sm transition hover:shadow-md">

                <CardContent className="p-5">

                  <div className="flex items-start justify-between">

                    <div>

                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        This Month
                      </p>

                      <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">

                        {statsLoading
                          ? "..."
                          : `₦${stats.monthlySpent.toLocaleString(
                              "en-NG",
                              {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 2,
                              }
                            )}`}

                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Total spent
                      </p>

                    </div>

                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                      <Banknote className="h-5 w-5" />
                    </div>

                  </div>

                </CardContent>

              </Card>

              <Card className="rounded-3xl border-slate-200/80 bg-white shadow-sm transition hover:shadow-md">

                <CardContent className="p-5">

                  <div className="flex items-start justify-between">

                    <div>

                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Activity
                      </p>

                      <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">

                        {statsLoading
                          ? "..."
                          : stats.monthlyTransactions.toLocaleString()}

                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Transactions this month
                      </p>

                    </div>

                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                      <History className="h-5 w-5" />
                    </div>

                  </div>

                </CardContent>

              </Card>

              <Card className="rounded-3xl border-slate-200/80 bg-white shadow-sm transition hover:shadow-md">

                <CardContent className="p-5">

                  <div className="flex items-start justify-between">

                    <div>

                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Reliability
                      </p>

                      <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">

                        {statsLoading
                          ? "..."
                          : `${stats.successRate}%`}

                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Successful transactions
                      </p>

                    </div>

                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <Shield className="h-5 w-5" />
                    </div>

                  </div>

                </CardContent>

              </Card>

            </div>

          </section>

          {/* SECURITY / TRUST */}

          <section className="mb-4">

            <Card className="overflow-hidden rounded-3xl border-slate-200/80 bg-white shadow-sm">

              <CardContent className="p-5 sm:p-6">

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                  <div className="flex items-start gap-3">

                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
                      <Shield className="h-5 w-5" />
                    </div>

                    <div>

                      <p className="text-sm font-bold text-slate-900">
                        Your account is protected
                      </p>

                      <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">
                        IyanjuPay uses secure authentication and payment authorization to protect your money and transactions.
                      </p>

                    </div>

                  </div>

                  <Button
                    variant="outline"
                    onClick={() =>
                      setCurrentPage(
                        "payment-pin"
                      )
                    }
                    className="rounded-xl border-slate-200 font-semibold"
                  >
                    Security Settings
                  </Button>

                </div>

              </CardContent>

            </Card>

          </section>

        </main>

        {/* ====================================================== */}
        {/* BOTTOM NAVIGATION                                     */}
        {/* ====================================================== */}

        {renderBottomNav(
          currentPage
        )}

        {/* ====================================================== */}
        {/* FUND WALLET                                           */}
        {/* ====================================================== */}

        <FundWalletModal
          isOpen={
            fundModalOpen
          }
          onClose={() =>
            setFundModalOpen(
              false
            )
          }
          onFunded={async () => {
            await refreshWallet();
            await loadDashboardStats();
          }}
        />

        {/* ====================================================== */}
        {/* QR CODE                                                */}
        {/* ====================================================== */}

        <QRCodeModal
          isOpen={
            qrModalOpen
          }
          onClose={() =>
            setQrModalOpen(
              false
            )
          }
          virtualAccountNumber={
            wallet?.virtual_account_number ||
            ""
          }
          userName={
            user?.email ||
            "User"
          }
        />

        {/* ====================================================== */}
        {/* SUPPORT CHAT                                          */}
        {/* ====================================================== */}

        <Button
          type="button"
          onClick={() =>
            setSupportChatOpen(
              true
            )
          }
          className="fixed bottom-24 right-4 z-50 h-14 w-14 rounded-full bg-purple-600 p-0 shadow-[0_12px_30px_rgba(124,58,237,0.35)] hover:bg-purple-700 sm:bottom-24 sm:right-6"
          aria-label="Open live support chat"
        >
          <Headphones className="h-6 w-6" />
        </Button>

        <SupportChat
          open={
            supportChatOpen
          }
          onClose={() =>
            setSupportChatOpen(
              false
            )
          }
        />

        {/* ====================================================== */}
        {/* WHATSAPP                                              */}
        {/* ====================================================== */}

        <WhatsAppFloat />

      </div>
    </>
  );
};

export default Dashboard;
