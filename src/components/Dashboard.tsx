import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Banknote,
  CreditCard,
  Eye,
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
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

import ServiceCard from "@/components/ServiceCard";
import FundWalletModal from "@/components/FundWalletModal";
import ServicePayment from "@/components/ServicePayment";
import QRCodeModal from "@/components/QRCodeModal";
import WhatsAppFloat from "@/components/WhatsAppFloat";
import SupportChat from "@/components/SupportChat";
import SendMoneyPage from "@/components/SendMoneyPage";
import ProfilePage from "@/components/ProfilePage";
import TransactionHistory from "@/components/TransactionHistory";
import RewardsPage from "@/components/RewardsPage";
import CardsPage from "@/components/CardsPage";
import MePage from "@/components/MePage";
import CustomerServicePage from "@/components/CustomerServicePage";
import SupportPage from "@/components/SupportPage";
import TransactionLimitPage from "@/components/TransactionLimitPage";
import PaymentPinPage from "@/components/PaymentPinPage";
import DisputesPage from "@/components/DisputesPage";

import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  "bill_payment",
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
  "airtime_card",
  "data_card",
  "smile",
  "waec",
  "jamb",
]);

const normalizeText = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const isSuccessfulTransaction = (
  transaction: DashboardTransaction,
) =>
  SUCCESS_STATUSES.has(
    normalizeText(transaction.status),
  );

const isFailedTransaction = (
  transaction: DashboardTransaction,
) =>
  FAILED_STATUSES.has(
    normalizeText(transaction.status),
  );

const isMoneyOutTransaction = (
  transaction: DashboardTransaction,
) => {
  const type = normalizeText(transaction.transaction_type);

  if (MONEY_OUT_TYPES.has(type)) {
    return true;
  }

  const category = normalizeText(transaction.category);

  return MONEY_OUT_TYPES.has(category);
};

const getServiceTypeForTransaction = (
  service: BillService,
) => {
  switch (service) {
    case "airtime-card":
      return "airtime-card";

    case "data-card":
      return "data-card";

    default:
      return service;
  }
};

const Dashboard: React.FC = () => {
  const { user, signOut } = useAuth();
  const {
    wallet,
    loading: walletLoading,
    refreshWallet,
  } = useWallet(user?.id);

  const { toast } = useToast();

  const [currentPage, setCurrentPage] =
    useState<CurrentPage>("home");

  const [fundModalOpen, setFundModalOpen] =
    useState(false);

  const [qrModalOpen, setQrModalOpen] =
    useState(false);

  const [supportChatOpen, setSupportChatOpen] =
    useState(false);

  const [selectedService, setSelectedService] =
    useState<SelectedService | null>(null);

  const [showBalance, setShowBalance] =
    useState(true);

  const [stats, setStats] =
    useState<TransactionStats>({
      monthlySpent: 0,
      monthlyTransactions: 0,
      successRate: 100,
    });

  const [statsLoading, setStatsLoading] =
    useState(false);

  /*
   * -------------------------------------------------------
   * AUTH
   * -------------------------------------------------------
   */

  useEffect(() => {
    if (!user) {
      setCurrentPage("home");
    }
  }, [user]);

  /*
   * -------------------------------------------------------
   * EDGE FUNCTION ERROR HELPER
   * -------------------------------------------------------
   */

  const extractFunctionError = useCallback(
    async (error: any) => {
      try {
        if (error?.context instanceof Response) {
          const clone = error.context.clone();

          try {
            const body = await clone.json();

            return (
              body?.error ||
              body?.message ||
              body?.provider_message ||
              body?.provider_response?.message ||
              body?.provider_response?.remark ||
              error?.message ||
              "Request failed."
            );
          } catch {
            try {
              const text = await error.context
                .clone()
                .text();

              if (text) {
                return text;
              }
            } catch {
              // Ignore response parsing failure.
            }
          }
        }

        return (
          error?.message ||
          error?.error_description ||
          "Request failed."
        );
      } catch {
        return "Request failed.";
      }
    },
    [],
  );

  /*
   * -------------------------------------------------------
   * DASHBOARD STATISTICS
   * -------------------------------------------------------
   */

  const loadDashboardStats = useCallback(async () => {
    if (!user?.id) {
      return;
    }

    setStatsLoading(true);

    try {
      const { data, error } = await supabase
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
          `,
        )
        .eq("user_id", user.id)
        .order("created_at", {
          ascending: false,
        })
        .limit(500);

      if (error) {
        throw error;
      }

      const transactions =
        (data || []) as DashboardTransaction[];

      const now = new Date();

      const monthStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
      );

      const monthTransactions =
        transactions.filter((transaction) => {
          const createdAt = new Date(
            transaction.created_at,
          );

          return createdAt >= monthStart;
        });

      const monthlySpent =
        monthTransactions
          .filter(
            (transaction) =>
              isSuccessfulTransaction(transaction) &&
              isMoneyOutTransaction(transaction),
          )
          .reduce((total, transaction) => {
            const amount = Number(
              transaction.amount ?? 0,
            );

            return total + (Number.isFinite(amount) ? amount : 0);
          }, 0);

      const terminalTransactions =
        transactions.filter(
          (transaction) =>
            isSuccessfulTransaction(transaction) ||
            isFailedTransaction(transaction),
        );

      const successfulTransactions =
        terminalTransactions.filter(
          isSuccessfulTransaction,
        ).length;

      const failedTransactions =
        terminalTransactions.filter(
          isFailedTransaction,
        ).length;

      const totalTerminal =
        successfulTransactions +
        failedTransactions;

      const successRate =
        totalTerminal > 0
          ? Math.round(
              (successfulTransactions /
                totalTerminal) *
                100,
            )
          : 100;

      setStats({
        monthlySpent,
        monthlyTransactions:
          monthTransactions.length,
        successRate,
      });
    } catch (error) {
      console.error(
        "Failed to load dashboard statistics:",
        error,
      );
    } finally {
      setStatsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    void loadDashboardStats();

    const channel = supabase
      .channel(
        `dashboard-transactions-${user.id}`,
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
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, loadDashboardStats]);

  /*
   * -------------------------------------------------------
   * WALLET BOOTSTRAP
   * -------------------------------------------------------
   */

  useEffect(() => {
    const bootstrapWallet = async () => {
      if (!user?.id) {
        return;
      }

      try {
        const { error } =
          await supabase.functions.invoke(
            "wallet-bootstrap",
            {
              body: {
                user_id: user.id,
              },
            },
          );

        if (error) {
          console.error(
            "Wallet bootstrap failed:",
            error,
          );
          return;
        }

        await refreshWallet();
        await loadDashboardStats();
      } catch (error) {
        console.error(
          "Wallet bootstrap error:",
          error,
        );
      }
    };

    void bootstrapWallet();
  }, [
    user?.id,
    refreshWallet,
    loadDashboardStats,
  ]);

  /*
   * -------------------------------------------------------
   * SERVICES
   * -------------------------------------------------------
   */

  const services = useMemo(
    () => [
      {
        title: "Buy Airtime",
        description:
          "Recharge your phone instantly",
        icon: Smartphone,
        color: "blue",
        type: "airtime" as BillService,
        available: true,
      },
      {
        title: "Buy Data",
        description: "Fast data bundles",
        icon: Wifi,
        color: "purple",
        type: "data" as BillService,
        available: true,
      },
      {
        title: "Electricity",
        description: "Pay your power bill",
        icon: Zap,
        color: "yellow",
        type: "electricity" as BillService,
        available: true,
      },
      {
        title: "Cable TV",
        description:
          "DStv, GOtv & Startimes",
        icon: CreditCard,
        color: "red",
        type: "cable" as BillService,
        available: true,
      },
      {
        title: "Airtime E-Pin",
        description: "Buy recharge PINs",
        icon: Receipt,
        color: "green",
        type: "airtime-card" as BillService,
        available: true,
      },
      {
        title: "Data E-Pin",
        description: "Buy data PINs",
        icon: Radio,
        color: "indigo",
        type: "data-card" as BillService,
        available: true,
      },
      {
        title: "Smile",
        description: "Smile data bundles",
        icon: Wifi,
        color: "cyan",
        type: "smile" as BillService,
        available: true,
      },
      {
        title: "WAEC",
        description: "WAEC services",
        icon: GraduationCap,
        color: "orange",
        type: "waec" as BillService,
        available: true,
      },
      {
        title: "JAMB",
        description: "JAMB services",
        icon: GraduationCap,
        color: "emerald",
        type: "jamb" as BillService,
        available: true,
      },
      {
        title: "Internet Bills",
        description: "Coming soon",
        icon: Wifi,
        color: "slate",
        type: "internet" as BillService,
        available: false,
      },
      {
        title: "Insurance",
        description: "Coming soon",
        icon: Shield,
        color: "teal",
        type: "insurance" as BillService,
        available: false,
      },
      {
        title: "Savings",
        description: "Coming soon",
        icon: PiggyBank,
        color: "pink",
        type: "savings" as BillService,
        available: false,
      },
    ],
    [],
  );

  const handleServiceClick = useCallback(
    (service: {
      title: string;
      type: BillService;
      available: boolean;
    }) => {
      if (
        !service.available ||
        COMING_SOON_SERVICES.includes(
          service.type,
        )
      ) {
        toast({
          title: "Coming soon",
          description:
            `${service.title} will be available soon.`,
        });

        return;
      }

      if (
        !SUPPORTED_BILL_SERVICES.includes(
          service.type,
        )
      ) {
        toast({
          title: "Service unavailable",
          description:
            "This service is currently unavailable.",
          variant: "destructive",
        });

        return;
      }

      setSelectedService({
        title: service.title,
        type: service.type,
      });

      setCurrentPage("service-payment");
    },
    [toast],
  );

  /*
   * -------------------------------------------------------
   * SERVICE PURCHASE
   * -------------------------------------------------------
   */

  const handlePurchase = useCallback(
    async (
      amount: number,
      paymentDetails: Record<string, any>,
    ) => {
      if (!user?.id) {
        toast({
          title: "Authentication required",
          description:
            "Please sign in again to continue.",
          variant: "destructive",
        });

        return;
      }

      if (!selectedService) {
        toast({
          title: "Service not selected",
          description:
            "Please select a service first.",
          variant: "destructive",
        });

        return;
      }

      if (
        !SUPPORTED_BILL_SERVICES.includes(
          selectedService.type,
        )
      ) {
        toast({
          title: "Unsupported service",
          description:
            "This service is not currently supported.",
          variant: "destructive",
        });

        return;
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        toast({
          title: "Invalid amount",
          description:
            "Please enter a valid amount.",
          variant: "destructive",
        });

        return;
      }

      const walletBalance = Number(
        wallet?.balance ?? 0,
      );

      if (amount > walletBalance) {
        toast({
          title: "Insufficient balance",
          description:
            "Please fund your wallet and try again.",
          variant: "destructive",
        });

        return;
      }

      try {
        const service =
          getServiceTypeForTransaction(
            selectedService.type,
          );

        const requestBody = {
          action: "purchase",
          service,
          amount,
          country:
            paymentDetails?.country || "NG",

          customer:
            paymentDetails?.customer ||
            paymentDetails?.customer_name ||
            paymentDetails?.name ||
            undefined,

          biller_code:
            paymentDetails?.biller_code,

          network_code:
            paymentDetails?.network_code,

          item_code:
            paymentDetails?.item_code,

          product_code:
            paymentDetails?.product_code,

          variation_code:
            paymentDetails?.variation_code,

          meter_type:
            paymentDetails?.meter_type,

          meter_number:
            paymentDetails?.meter_number,

          meter_no:
            paymentDetails?.meter_no,

          smartcard_no:
            paymentDetails?.smartcard_no,

          smartcard_number:
            paymentDetails?.smartcard_number,

          phone_no:
            paymentDetails?.phone_no,

          phone:
            paymentDetails?.phone,

          phoneNumber:
            paymentDetails?.phoneNumber,

          mobile_number:
            paymentDetails?.mobile_number,

          account_id:
            paymentDetails?.account_id,

          data_plan:
            paymentDetails?.data_plan,

          package:
            paymentDetails?.package,

          package_code:
            paymentDetails?.package_code,

          electric_company:
            paymentDetails?.electric_company,

          cable_tv:
            paymentDetails?.cable_tv,

          exam_type:
            paymentDetails?.exam_type,

          value:
            paymentDetails?.value,

          quantity:
            paymentDetails?.quantity,

          details:
            paymentDetails?.details,
        };

        const { data, error } =
          await supabase.functions.invoke(
            "clubkonnect-services",
            {
              body: requestBody,
            },
          );

        if (error) {
          throw new Error(
            await extractFunctionError(error),
          );
        }

        if (!data?.success) {
          throw new Error(
            data?.error ||
              data?.message ||
              data?.provider_message ||
              data?.provider_response
                ?.message ||
              data?.provider_response
                ?.remark ||
              "The service purchase could not be completed.",
          );
        }

        await refreshWallet();
        await loadDashboardStats();

        const status = normalizeText(
          data?.status ||
            data?.transaction?.status ||
            data?.provider_response?.status,
        );

        const isPending = [
          "pending",
          "processing",
          "order_received",
          "order_processed",
          "on_hold",
          "300",
          "399",
          "201",
        ].includes(status);

        toast({
          title: isPending
            ? "Transaction processing"
            : "Transaction successful",
          description:
            data?.message ||
            (isPending
              ? "Your transaction is being processed."
              : "Your transaction has been completed successfully."),
        });
      } catch (error: any) {
        console.error(
          "Service purchase failed:",
          error,
        );

        toast({
          title: "Transaction failed",
          description:
            error?.message ||
            "Unable to complete this transaction.",
          variant: "destructive",
        });

        throw error;
      }
    },
    [
      user?.id,
      selectedService,
      wallet?.balance,
      toast,
      refreshWallet,
      loadDashboardStats,
      extractFunctionError,
    ],
  );

  /*
   * -------------------------------------------------------
   * BANK TRANSFER
   *
   * SendMoneyPage remains the dedicated transfer UI.
   * Do NOT route IyanjuPay transfers through TransferModal.
   * -------------------------------------------------------
   */

  const handleTransfer = useCallback(
    async (
      amount: number,
      transferDetails: Record<string, any>,
    ) => {
      if (!user?.id) {
        toast({
          title: "Authentication required",
          description:
            "Please sign in again to continue.",
          variant: "destructive",
        });

        return;
      }

      if (
        transferDetails?.type ===
        "iyanju_transfer"
      ) {
        toast({
          title: "Use Send Money",
          description:
            "IyanjuPay wallet transfers are handled by the dedicated Send Money page.",
          variant: "destructive",
        });

        return;
      }

      const walletBalance = Number(
        wallet?.balance ?? 0,
      );

      if (amount <= 0) {
        toast({
          title: "Invalid amount",
          description:
            "Please enter a valid transfer amount.",
          variant: "destructive",
        });

        return;
      }

      if (amount > walletBalance) {
        toast({
          title: "Insufficient balance",
          description:
            "Your wallet balance is insufficient for this transfer.",
          variant: "destructive",
        });

        return;
      }

      if (
        !transferDetails?.account_number ||
        !transferDetails?.account_bank
      ) {
        toast({
          title: "Missing bank details",
          description:
            "Please provide the recipient's account number and bank.",
          variant: "destructive",
        });

        return;
      }

      if (!transferDetails?.beneficiary_name) {
        toast({
          title: "Missing recipient",
          description:
            "Please provide the recipient's name.",
          variant: "destructive",
        });

        return;
      }

      try {
        const idempotencyKey =
          transferDetails?.idempotency_key ||
          `transfer-${user.id}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 10)}`;

        const { data, error } =
          await supabase.functions.invoke(
            "flutterwave-transfer",
            {
              body: {
                amount,
                account_number:
                  transferDetails.account_number,
                account_bank:
                  transferDetails.account_bank,
                beneficiary_name:
                  transferDetails.beneficiary_name,
                narration:
                  transferDetails.narration ||
                  "IyanjuPay transfer",
                idempotency_key:
                  idempotencyKey,
              },
            },
          );

        if (error) {
          throw new Error(
            await extractFunctionError(error),
          );
        }

        if (
          data?.success === false ||
          data?.error
        ) {
          throw new Error(
            data?.error ||
              data?.message ||
              "The transfer could not be completed.",
          );
        }

        await refreshWallet();
        await loadDashboardStats();

        toast({
          title: "Transfer submitted",
          description:
            data?.message ||
            "Your bank transfer has been submitted for processing.",
        });
      } catch (error: any) {
        console.error(
          "Bank transfer failed:",
          error,
        );

        toast({
          title: "Transfer failed",
          description:
            error?.message ||
            "Unable to complete the transfer.",
          variant: "destructive",
        });

        throw error;
      }
    },
    [
      user?.id,
      wallet?.balance,
      toast,
      refreshWallet,
      loadDashboardStats,
      extractFunctionError,
    ],
  );

  /*
   * -------------------------------------------------------
   * LOADING / AUTH
   * -------------------------------------------------------
   */

  if (walletLoading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-7 w-7 animate-spin text-violet-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-7 w-7 animate-spin text-violet-600" />
      </div>
    );
  }

  /*
   * -------------------------------------------------------
   * INTERNAL PAGES
   * -------------------------------------------------------
   */

  if (
    currentPage === "service-payment" &&
    selectedService
  ) {
    return (
      <ServicePayment
        serviceType={selectedService.type}
        serviceTitle={selectedService.title}
        walletBalance={Number(
          wallet?.balance ?? 0,
        )}
        onBack={() =>
          setCurrentPage("home")
        }
        onPurchase={handlePurchase}
        onHistory={() =>
          setCurrentPage("history")
        }
      />
    );
  }

  if (currentPage === "send-money") {
    return (
      <SendMoneyPage
        onBack={() =>
          setCurrentPage("home")
        }
        walletBalance={Number(
          wallet?.balance ?? 0,
        )}
        onTransfer={handleTransfer}
      />
    );
  }

  if (currentPage === "profile") {
    return (
      <ProfilePage
        onBack={() =>
          setCurrentPage("home")
        }
      />
    );
  }

  if (currentPage === "history") {
    return (
      <TransactionHistory
        onBack={() =>
          setCurrentPage("home")
        }
      />
    );
  }

  if (currentPage === "rewards") {
    return (
      <RewardsPage
        onBack={() =>
          setCurrentPage("home")
        }
      />
    );
  }

  if (currentPage === "cards") {
    return (
      <CardsPage
        onBack={() =>
          setCurrentPage("home")
        }
      />
    );
  }

  if (currentPage === "customer-service") {
    return (
      <CustomerServicePage
        onBack={() =>
          setCurrentPage("home")
        }
      />
    );
  }

  if (currentPage === "support") {
    return (
      <SupportPage
        onBack={() =>
          setCurrentPage("home")
        }
      />
    );
  }

  if (
    currentPage === "transaction-limit"
  ) {
    return (
      <TransactionLimitPage
        onBack={() =>
          setCurrentPage("home")
        }
      />
    );
  }

  if (currentPage === "payment-pin") {
    return (
      <PaymentPinPage
        onBack={() =>
          setCurrentPage("home")
        }
      />
    );
  }

  if (currentPage === "disputes") {
    return (
      <DisputesPage
        onBack={() =>
          setCurrentPage("home")
        }
      />
    );
  }

  if (currentPage === "me") {
    return (
      <MePage
        onBack={() =>
          setCurrentPage("home")
        }
        onNavigate={(page: CurrentPage) =>
          setCurrentPage(page)
        }
      />
    );
  }

  /*
   * -------------------------------------------------------
   * HOME DATA
   * -------------------------------------------------------
   */

  const walletBalance = Number(
    wallet?.balance ?? 0,
  );

  const formattedBalance =
    walletBalance.toLocaleString(
      "en-NG",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    );

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "User";

  const firstName =
    displayName
      .trim()
      .split(/\s+/)[0] || "User";

  /*
   * -------------------------------------------------------
   * HOME
   * -------------------------------------------------------
   */

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* ==================================================
          HEADER
          ================================================== */}

      <header className="sticky top-0 z-40 border-b border-white/10 bg-gradient-to-r from-violet-900 via-violet-700 to-blue-600 text-white shadow-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() =>
              setCurrentPage("home")
            }
            className="flex items-center gap-2.5"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <span className="text-lg font-black">
                IP
              </span>
            </div>

            <div className="hidden text-left sm:block">
              <p className="text-sm font-bold">
                IyanjuPay
              </p>
              <p className="text-[10px] text-white/70">
                Payments made simple
              </p>
            </div>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setQrModalOpen(true)
              }
              className="h-9 w-9 rounded-xl text-white hover:bg-white/10"
              aria-label="QR Code"
            >
              <QrCode className="h-4.5 w-4.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setCurrentPage("history")
              }
              className="h-9 w-9 rounded-xl text-white hover:bg-white/10"
              aria-label="Transaction history"
            >
              <History className="h-4.5 w-4.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setCurrentPage("profile")
              }
              className="h-9 w-9 rounded-xl text-white hover:bg-white/10"
              aria-label="Profile"
            >
              <User className="h-4.5 w-4.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => void signOut()}
              className="h-9 w-9 rounded-xl text-white hover:bg-white/10"
              aria-label="Logout"
            >
              <LogOut className="h-4.5 w-4.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* ==================================================
          MAIN
          ================================================== */}

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        {/* Greeting */}

        <section className="mb-5">
          <p className="text-xs font-medium text-slate-500 sm:text-sm">
            Welcome back 👋
          </p>

          <h1 className="mt-0.5 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            Hi, {firstName}
          </h1>

          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            Manage your payments and services
            from one place.
          </p>
        </section>

        {/* ==================================================
            WALLET HERO
            ================================================== */}

        <section className="mb-6">
          <Card className="overflow-hidden rounded-3xl border-0 bg-gradient-to-br from-violet-900 via-violet-700 to-blue-600 text-white shadow-xl">
            <CardContent className="relative p-5 sm:p-7">
              <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -bottom-20 left-20 h-40 w-40 rounded-full bg-blue-400/20 blur-2xl" />

              <div className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-white/70 sm:text-sm">
                      Available Balance
                    </p>

                    <div className="mt-1 flex items-center gap-2">
                      <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
                        {showBalance
                          ? `₦${formattedBalance}`
                          : "₦••••••"}
                      </h2>

                      <button
                        type="button"
                        onClick={() =>
                          setShowBalance(
                            (value) => !value,
                          )
                        }
                        className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
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
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/10 p-2.5 backdrop-blur">
                    <Banknote className="h-5 w-5 text-white/90" />
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-white/50">
                      Wallet ID
                    </p>

                    <p className="mt-0.5 max-w-[180px] truncate text-xs font-semibold text-white/85 sm:max-w-none">
                      {wallet?.id ||
                        user.id.slice(0, 18)}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() =>
                        setFundModalOpen(true)
                      }
                      className="h-9 rounded-xl bg-white px-3 text-xs font-bold text-violet-800 shadow-sm hover:bg-white/90 sm:h-10 sm:px-4"
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add Money
                    </Button>

                    <Button
                      onClick={() =>
                        setCurrentPage(
                          "send-money",
                        )
                      }
                      variant="outline"
                      className="h-9 rounded-xl border-white/20 bg-white/10 px-3 text-xs font-bold text-white hover:bg-white/20 hover:text-white sm:h-10 sm:px-4"
                    >
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      Send
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ==================================================
            QUICK ACTIONS
            ================================================== */}

        <section className="mb-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 sm:text-lg">
              Quick Actions
            </h2>
          </div>

          <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() =>
                handleServiceClick({
                  title: "Buy Airtime",
                  type: "airtime",
                  available: true,
                })
              }
              className="group rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md sm:p-4"
            >
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-100 sm:h-11 sm:w-11">
                <Smartphone className="h-5 w-5" />
              </div>

              <p className="mt-2 text-[11px] font-bold text-slate-800 sm:text-xs">
                Airtime
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                handleServiceClick({
                  title: "Buy Data",
                  type: "data",
                  available: true,
                })
              }
              className="group rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md sm:p-4"
            >
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 transition group-hover:bg-violet-100 sm:h-11 sm:w-11">
                <Wifi className="h-5 w-5" />
              </div>

              <p className="mt-2 text-[11px] font-bold text-slate-800 sm:text-xs">
                Data
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                setCurrentPage(
                  "send-money",
                )
              }
              className="group rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md sm:p-4"
            >
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition group-hover:bg-emerald-100 sm:h-11 sm:w-11">
                <Send className="h-5 w-5" />
              </div>

              <p className="mt-2 text-[11px] font-bold text-slate-800 sm:text-xs">
                Transfer
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                setCurrentPage("history")
              }
              className="group rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md sm:p-4"
            >
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition group-hover:bg-slate-200 sm:h-11 sm:w-11">
                <History className="h-5 w-5" />
              </div>

              <p className="mt-2 text-[11px] font-bold text-slate-800 sm:text-xs">
                History
              </p>
            </button>
          </div>
        </section>

        {/* ==================================================
            SERVICES
            ================================================== */}

        <section className="mb-7">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                Services
              </h2>

              <p className="mt-0.5 text-[11px] text-slate-500 sm:text-xs">
                Everything you need, in one place
              </p>
            </div>

            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-700 sm:text-xs">
              {
                services.filter(
                  (service) =>
                    service.available,
                ).length
              }{" "}
              Available
            </span>
          </div>

          {/*
           * COMPACT SERVICE GRID
           *
           * Mobile  : 3 columns
           * Small   : 4 columns
           * Large   : 5 columns
           *
           * This deliberately keeps service cards
           * smaller than the previous dashboard.
           */}

          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5">
            {services.map((service) => (
              <div
                key={service.type}
                className="min-w-0"
              >
                <ServiceCard
                  title={service.title}
                  description={
                    service.description
                  }
                  icon={service.icon}
                  color={service.color}
                  available={
                    service.available
                  }
                  onClick={() =>
                    handleServiceClick(
                      service,
                    )
                  }
                />
              </div>
            ))}
          </div>
        </section>

        {/* ==================================================
            ACCOUNT OVERVIEW
            ================================================== */}

        <section className="mb-7">
          <div className="mb-3">
            <h2 className="text-base font-bold text-slate-900 sm:text-lg">
              Account Overview
            </h2>
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-3 sm:p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600 sm:h-9 sm:w-9">
                  <Banknote className="h-4 w-4" />
                </div>

                <p className="mt-3 text-[10px] font-medium text-slate-500 sm:text-xs">
                  Monthly Spent
                </p>

                <p className="mt-0.5 truncate text-sm font-black text-slate-900 sm:text-base">
                  {statsLoading
                    ? "..."
                    : `₦${stats.monthlySpent.toLocaleString(
                        "en-NG",
                        {
                          maximumFractionDigits: 0,
                        },
                      )}`}
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-3 sm:p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 sm:h-9 sm:w-9">
                  <Receipt className="h-4 w-4" />
                </div>

                <p className="mt-3 text-[10px] font-medium text-slate-500 sm:text-xs">
                  Transactions
                </p>

                <p className="mt-0.5 text-sm font-black text-slate-900 sm:text-base">
                  {statsLoading
                    ? "..."
                    : stats.monthlyTransactions}
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-3 sm:p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 sm:h-9 sm:w-9">
                  <Shield className="h-4 w-4" />
                </div>

                <p className="mt-3 text-[10px] font-medium text-slate-500 sm:text-xs">
                  Success Rate
                </p>

                <p className="mt-0.5 text-sm font-black text-slate-900 sm:text-base">
                  {statsLoading
                    ? "..."
                    : `${stats.successRate}%`}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ==================================================
            SECURITY / TRUST
            ================================================== */}

        <section>
          <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <Shield className="h-5 w-5" />
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Keep your account secure
                  </h3>

                  <p className="mt-0.5 text-xs text-slate-500">
                    Set up your payment PIN for safer transactions.
                  </p>
                </div>
              </div>

              <Button
                onClick={() =>
                  setCurrentPage(
                    "payment-pin",
                  )
                }
                className="h-10 rounded-xl bg-violet-600 px-4 text-xs font-bold hover:bg-violet-700"
              >
                Payment PIN
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>

      {/* ==================================================
          BOTTOM NAVIGATION
          ================================================== */}

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 bg-white/95 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="mx-auto grid max-w-lg grid-cols-4 px-2 pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            onClick={() =>
              setCurrentPage("home")
            }
            className={`flex flex-col items-center gap-1 px-2 py-2.5 text-[10px] font-semibold transition ${
              currentPage === "home"
                ? "text-violet-700"
                : "text-slate-500"
            }`}
          >
            <Home
              className={`h-5 w-5 ${
                currentPage === "home"
                  ? "fill-violet-100"
                  : ""
              }`}
            />
            Home
          </button>

          <button
            type="button"
            onClick={() =>
              setCurrentPage("rewards")
            }
            className={`flex flex-col items-center gap-1 px-2 py-2.5 text-[10px] font-semibold transition ${
              currentPage === "rewards"
                ? "text-violet-700"
                : "text-slate-500"
            }`}
          >
            <Gift className="h-5 w-5" />
            Rewards
          </button>

          <button
            type="button"
            onClick={() =>
              setCurrentPage("cards")
            }
            className={`flex flex-col items-center gap-1 px-2 py-2.5 text-[10px] font-semibold transition ${
              currentPage === "cards"
                ? "text-violet-700"
                : "text-slate-500"
            }`}
          >
            <CreditCard className="h-5 w-5" />
            Cards
          </button>

          <button
            type="button"
            onClick={() =>
              setCurrentPage("me")
            }
            className={`flex flex-col items-center gap-1 px-2 py-2.5 text-[10px] font-semibold transition ${
              currentPage === "me"
                ? "text-violet-700"
                : "text-slate-500"
            }`}
          >
            <User className="h-5 w-5" />
            Me
          </button>
        </div>
      </nav>

      {/* ==================================================
          MODALS / FLOATING COMPONENTS
          ================================================== */}

      <FundWalletModal
        open={fundModalOpen}
        onOpenChange={setFundModalOpen}
        onSuccess={async () => {
          await refreshWallet();
          await loadDashboardStats();
        }}
      />

      <QRCodeModal
        open={qrModalOpen}
        onOpenChange={setQrModalOpen}
      />

      <SupportChat
        open={supportChatOpen}
        onOpenChange={setSupportChatOpen}
      />

      <WhatsAppFloat />
    </div>
  );
};

export default Dashboard;
