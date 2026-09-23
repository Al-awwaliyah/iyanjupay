import { getSafeErrorMessage } from "@/lib/errorHandling";
import React, {
  useCallback,
  useEffect,
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
import BilalsadasubExtras from "@/pages/BilalsadasubExtras";
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
import { THEME_OPTIONS, useTheme } from "@/components/theme/ThemeProvider";
import NotificationCenter from "@/components/notifications/NotificationCenter";
import AnnouncementBanner from "@/components/notifications/AnnouncementBanner";
import SecuritySettingsPage from "@/components/security/SecuritySettingsPage";
import { useCustomerAppSettings } from "@/hooks/useCustomerAppSettings";

type BillService =
  | "airtime"
  | "data"
  | "electricity"
  | "cable"
  | "education"
  | "recharge-card"
  | "airtime-card"
  | "data-card"
  | "internet"
  | "airtime-cash"
  | "gift-card"
  | "esim"
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
  | "service-payment"
  | "bilalsadasub-extra"
  | "security";

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
  "cable",
  "electricity",
  "education",
  "internet",
  "airtime-card",
  "data-card",
  "recharge-card",
  "airtime-cash",
  "gift-card",
  "esim",
];

const COMING_SOON_SERVICES: BillService[] = [
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
    MONEY_OUT_TYPES.has(category)
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
  ];

  return moneyOutWords.some(
    (word) =>
      description.includes(word)
  );
};

const Dashboard = () => {
  const {
    user,
    loading: authLoading,
    signOut,
  } = useAuth();

  const { toast } = useToast();

  const {
    maintenanceMode,
    showMaintenanceBanner,
    maintenanceReason,
    allowTransfers,
    allowWalletFunding,
    allowBillPayments,
  } = useCustomerAppSettings();

  const [currentPage, setCurrentPage] =
    useState<CurrentPage>("home");

  const {
    wallet,
    loading: walletLoading,
    refreshWallet,
  } = useWallet(user?.id);

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

  const { theme: dashboardTheme, setTheme: setDashboardTheme } = useTheme();

  const [appearanceOpen, setAppearanceOpen] = useState(false);

  const ActiveAppearanceIcon =
    THEME_OPTIONS.find((option) => option.value === dashboardTheme)?.icon ??
    THEME_OPTIONS[0].icon;

  const [stats, setStats] =
    useState<TransactionStats>({
      monthlySpent: 0,
      monthlyTransactions: 0,
      successRate: 100,
    });

  const [statsLoading, setStatsLoading] =
    useState(true);

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
        }
      } catch (parseError) {
        console.error(
          "Could not parse Edge Function error:",
          parseError
        );
      }

      if (
        getSafeErrorMessage(error) &&
        getSafeErrorMessage(error) !==
          "Edge Function returned a non-2xx status code"
      ) {
        return String(
          getSafeErrorMessage(error)
        );
      }

      return fallback;
    };

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
  createdAt >= monthStart &&
  createdAt < monthEnd
);
});

const monthlySpent =
  monthlyTransactions
    .filter(
      (transaction) =>
        isSuccessfulTransaction(transaction) &&
        isMoneyOutTransaction(transaction)
    )
    .reduce(
      (
        total,
        transaction
      ) => {
        const amount =
          Number(transaction.amount);

        if (
          !Number.isFinite(amount)
        ) {
          return total;
        }

        return total + amount;
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
  terminalTransactions === 0
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
    title: "Cable TV",
    description:
      "DSTV, GOTV and Startimes",
    icon: CreditCard,
    color: "bg-red-500",
    type: "cable" as BillService,
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
    title: "Education",
    description:
      "Education services",
    icon: GraduationCap,
    color: "bg-orange-500",
    type: "education" as BillService,
    available: true,
  },
  {
    title: "Airtime Recharge PIN",
    description:
      "Generate MTN, Glo, 9mobile and Airtel recharge PINs",
    icon: Receipt,
    color: "bg-slate-500",
    type: "airtime-card" as BillService,
    available: true,
  },
  {
    title: "Data Card",
    description:
      "Generate data card PINs",
    icon: Receipt,
    color: "bg-cyan-500",
    type: "data-card" as BillService,
    available: true,
  },
  {
    title: "Airtime Card",
    description:
      "Generate discounted airtime recharge PINs",
    icon: Receipt,
    color: "bg-slate-500",
    type: "recharge-card" as BillService,
    available: true,
  },
  {
    title: "Airtime to Cash",
    description:
      "Convert eligible airtime to wallet balance",
    icon: Banknote,
    color: "bg-emerald-500",
    type: "airtime-cash" as BillService,
    available: true,
  },
  {
    title: "Gift Cards",
    description:
      "Buy or sell supported gift cards",
    icon: Gift,
    color: "bg-pink-500",
    type: "gift-card" as BillService,
    available: true,
  },
  {
    title: "Internet eSIM",
    description:
      "Buy available Smile or Alpha eSIM numbers",
    icon: Radio,
    color: "bg-indigo-500",
    type: "esim" as BillService,
    available: true,
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
  {
    title: "Internet Service",
    description:
      "Pay internet service bills",
    icon: Wifi,
    color: "bg-indigo-500",
    type: "internet" as BillService,
    available: true,
  },
];

const handleServiceClick = (
  service: (typeof services)[number]
) => {
  if (!allowBillPayments) {
    toast({
      title:
        "Bill payments temporarily unavailable",
      description:
        "Airtime, data and other service payments have been disabled by IyanjuPay administration.",
    });

    return;
  }

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
    service.type === "airtime-cash" ||
      service.type === "gift-card" ||
      service.type === "esim"
      ? "bilalsadasub-extra"
      : "service-payment"
  );
};

const handlePurchase = async (
  amount: number,
  details: Record<string, any>
): Promise<any> => {
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
        "bilalsadasub-services",
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
        getSafeErrorMessage(data) ||
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
      normalizedStatus === "300" ||
      normalizedStatus === "399" ||
      normalizedStatus === "201";

    toast({
      title: isPending
        ? "Payment Processing"
        : "Payment Successful",
      description:
        getSafeErrorMessage(data) ||
        (isPending
          ? `${selectedService.title} payment is being processed.`
          : `${selectedService.title} payment was completed successfully.`),
    });

    return data;
  } catch (error: any) {
    console.error(
      "Service payment failed:",
      error
    );

    throw new Error(
      getSafeErrorMessage(error) ||
        "Unable to complete this service payment."
    );
  }
};

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
    !details?.accountNumber ||
    !details?.bankCode ||
    !details?.recipient
  ) {
    toast({
      title:
        "Invalid recipient",
      description:
        "Required recipient account parameters are missing.",
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
        getSafeErrorMessage(data) ||
          "Bank transfer failed."
      );
    }

    await refreshWallet();
    await loadDashboardStats();

    toast({
      title:
        "Transfer Processing",
      description:
        getSafeErrorMessage(data) ||
        "Transaction completed successfully.",
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
        getSafeErrorMessage(error) ||
        "Unable to complete the bank transfer.",
      variant:
        "destructive",
    });
  }
};

if (authLoading) {
  return (
    <div>
      Loading Account
    </div>
  );
}

if (!user) {
  return (
    <div>
      Please sign in to continue.
    </div>
  );
}

const renderBottomNav = (
  page: CurrentPage
) => (
  <div>
    <Button
      variant="ghost"
      size="sm"
      onClick={() =>
        setCurrentPage("home")
      }
      className={`h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 ${
        page === "home"
          ? "bg-primary/10 text-primary font-bold"
          : "text-muted-foreground hover:bg-muted"
      }`}
    >
      Home
    </Button>

    <Button
      variant="ghost"
      size="sm"
      onClick={() =>
        setCurrentPage("rewards")
      }
      className={`h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 ${
        page === "rewards"
          ? "bg-primary/10 text-primary font-bold"
          : "text-muted-foreground hover:bg-muted"
      }`}
    >
      Rewards
    </Button>

    <Button
      variant="ghost"
      size="sm"
      onClick={() =>
        setCurrentPage("cards")
      }
      className={`h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 ${
        page === "cards"
          ? "bg-primary/10 text-primary font-bold"
          : "text-muted-foreground hover:bg-muted"
      }`}
    >
      Cards
    </Button>

    <Button
      variant="ghost"
      size="sm"
      onClick={() =>
        setCurrentPage("me")
      }
      className={`h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 ${
        page === "me"
          ? "bg-primary/10 text-primary font-bold"
          : "text-muted-foreground hover:bg-muted"
      }`}
    >
      Me
    </Button>
  </div>
);

if (
  currentPage ===
    "bilalsadasub-extra" &&
  selectedService
) {
  return (
    <BilalsadasubExtras
      type={
        selectedService.type as
          | "airtime-cash"
          | "gift-card"
          | "esim"
      }
      onBack={() => {
        setSelectedService(null);
        setCurrentPage("home");
      }}
    />
  );
}

if (
  currentPage ===
  "service-payment"
) {
  return (
    <ServicePayment
      service={selectedService}
      onBack={() => {
        setSelectedService(null);
        setCurrentPage("home");
      }}
      onPurchase={handlePurchase}
      onHistory={() => {
        setSelectedService(null);
        setCurrentPage("history");
      }}
    />
  );
}

if (
  currentPage ===
  "send-money"
) {
  return (
    <SendMoneyPage
      onBack={() =>
        setCurrentPage("home")
      }
      walletBalance={Number(
        wallet?.balance ?? 0
      )}
      onTransfer={handleTransfer}
    />
  );
}

if (
  currentPage ===
  "profile"
) {
  return (
    <ProfilePage
      onBack={() =>
        setCurrentPage("me")
      }
    />
  );
}

if (
  currentPage ===
  "history"
) {
  return (
    <TransactionHistory
      onBack={() =>
        setCurrentPage("me")
      }
    />
  );
}

if (
  currentPage ===
  "rewards"
) {
  return (
    <>
      <RewardsPage
        onBack={() =>
          setCurrentPage("home")
        }
      />
      {renderBottomNav(
        "rewards"
      )}
    </>
  );
}

if (
  currentPage ===
  "cards"
) {
  return (
    <>
      <CardsPage
        onBack={() =>
          setCurrentPage("home")
        }
      />
      {renderBottomNav(
        "cards"
      )}
    </>
  );
}

if (
  currentPage ===
  "customer-service"
) {
  return (
    <CustomerServicePage
      onBack={() =>
        setCurrentPage("me")
      }
    />
  );
}

if (
  currentPage ===
  "support"
) {
  return (
    <SupportPage
      onBack={() =>
        setCurrentPage("me")
      }
    />
  );
}

if (
  currentPage ===
  "transaction-limit"
) {
  return (
    <TransactionLimitPage
      onBack={() =>
        setCurrentPage("me")
      }
    />
  );
}

if (
  currentPage ===
  "payment-pin"
) {
  return (
    <PaymentPinPage
      onBack={() =>
        setCurrentPage("me")
      }
    />
  );
}

if (
  currentPage ===
  "disputes"
) {
  return (
    <DisputesPage
      onBack={() =>
        setCurrentPage("me")
      }
    />
  );
}

if (
  currentPage ===
  "security"
) {
  return (
    <SecuritySettingsPage
      onBack={() =>
        setCurrentPage("me")
      }
    />
  );
}

if (
  currentPage ===
  "me"
) {
  return (
    <>
      <MePage
        onBack={() =>
          setCurrentPage("home")
        }
        onProfileClick={() =>
          setCurrentPage("profile")
        }
        onHistoryClick={() =>
          setCurrentPage("history")
        }
        onCustomerServiceClick={() =>
          setCurrentPage(
            "customer-service"
          )
        }
        onSupportClick={() =>
          setCurrentPage("support")
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
          setCurrentPage("disputes")
        }
        onSecurityClick={() =>
          setCurrentPage("security")
        }
      />

      {renderBottomNav("me")}
    </>
  );
}

if (walletLoading) {
  return (
    <div>
      Loading Wallet
    </div>
  );
}

const balance =
  Number(wallet?.balance ?? 0);

const formattedBalance =
  balance.toLocaleString(
    "en-NG",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }
  );

const displayName =
  user?.user_metadata
    ?.full_name ||
  user?.user_metadata?.name ||
  user?.email?.split("@")[0] ||
  "User";

const firstName =
  String(displayName)
    .trim()
    .split(/\s+/)[0] ||
  "User";

return (
  <>
    <button
      type="button"
      onClick={() =>
        setCurrentPage("home")
      }
      className="flex items-center gap-2.5 text-left focus:outline-none"
    >
      IyanjuPay
      <span>
        Secure Finance Portal
      </span>
    </button>

    <Button
      variant="ghost"
      size="icon"
      onClick={() =>
        setQrModalOpen(true)
      }
      className="h-9 w-9 rounded-xl text-foreground hover:bg-muted"
      aria-label="Show QR code"
    >
      QR
    </Button>

    <Button
      variant="ghost"
      size="icon"
      onClick={() =>
        setAppearanceOpen(
          (open) => !open
        )
      }
      className="h-9 w-9 rounded-xl text-foreground hover:bg-muted"
      aria-label="Appearance options"
    >
      Appearance
    </Button>

    {appearanceOpen && (
      <div>
        <div>
          Appearance
        </div>

        {THEME_OPTIONS.map(
          (option) => {
            const theme =
              option.value;

            const ThemeIcon =
              option.icon;

            return (
              <button
                key={theme}
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
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold transition text-foreground hover:bg-muted ${
                  dashboardTheme ===
                  theme
                    ? "bg-muted text-primary"
                    : ""
                }`}
              >
                <ThemeIcon />
                {option.label}

                {dashboardTheme ===
                  theme && (
                  <span>
                    ✓
                  </span>
                )}
              </button>
            );
          }
        )}
      </div>
    )}

    <Button
      variant="ghost"
      size="icon"
      onClick={() =>
        setCurrentPage("me")
      }
      className="h-9 w-9 rounded-xl text-foreground hover:bg-muted"
      aria-label="Profile navigation"
    >
      Profile
    </Button>

    {showMaintenanceBanner && (
      <div
        className={`rounded-xl border p-3.5 text-xs ${
          maintenanceMode
            ? "border-amber-200 bg-amber-500/10 text-amber-600"
            : "border-blue-200 bg-blue-500/10 text-blue-600"
        }`}
      >
        <div>
          {maintenanceMode
            ? "System Maintenance"
            : "System Update"}
        </div>

        <div>
          {maintenanceReason}
        </div>
      </div>
    )}

    <section>
      <h1>
        Account Dashboard
      </h1>

      <p>
        Welcome, {firstName}
      </p>

      <p>
        Select a service parameter
        below to begin.
      </p>
    </section>

    <section>
      <h2>
        Quick Actions
      </h2>

      <div>
        <button
          type="button"
          onClick={() =>
            handleServiceClick(
              services[0]
            )
          }
          className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-border bg-background hover:bg-muted transition"
        >
          <Smartphone />
          Airtime
        </button>

        <button
          type="button"
          onClick={() =>
            handleServiceClick(
              services[1]
            )
          }
          className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-border bg-background hover:bg-muted transition"
        >
          <Wifi />
          Data
        </button>

        <button
          type="button"
          onClick={() =>
            setCurrentPage(
              "send-money"
            )
          }
          className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-border bg-background hover:bg-muted transition"
        >
          Transfer
        </button>

        <button
          type="button"
          onClick={() =>
            setCurrentPage("history")
          }
          className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-border bg-background hover:bg-muted transition"
        >
          History
        </button>
      </div>
    </section>

    <section>
      <h2>
        Payment Services
      </h2>

      <p>
        Automated utilities and
        subscription routing
      </p>

      <span>
        12 Active
      </span>

      <div>
        {services.map(
          (service, idx) => (
            <div
              key={`${service.type}-${idx}`}
              className={
                service.available
                  ? "h-full"
                  : "opacity-60"
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

    <section>
      <h2>
        Account Overview
      </h2>

      <p>
        Monthly metrics analytics
        window
      </p>
    </section>

    {renderBottomNav(
      currentPage
    )}

    <FundWalletModal
      isOpen={fundModalOpen}
      onClose={() =>
        setFundModalOpen(false)
      }
      onFunded={async () => {
        await refreshWallet();
        await loadDashboardStats();
      }}
    />

    <QRCodeModal
      isOpen={qrModalOpen}
      onClose={() =>
        setQrModalOpen(false)
      }
      virtualAccountNumber={
        wallet?.virtual_account_number ||
        ""
      }
      userName={
        user?.email || "User"
      }
    />

    <Button
      type="button"
      onClick={() =>
        setSupportChatOpen(true)
      }
      className="fixed bottom-20 right-4 z-50 h-11 w-11 rounded-full bg-primary p-0 shadow-lg text-primary-foreground hover:bg-primary/90"
      aria-label="Support workspace link"
    >
      Support
    </Button>

    <SupportChat
      open={supportChatOpen}
      onClose={() =>
        setSupportChatOpen(false)
      }
    />
  </>
);
};

export default Dashboard;
