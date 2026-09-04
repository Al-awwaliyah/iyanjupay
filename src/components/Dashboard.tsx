import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Banknote,
  ChevronRight,
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
 * Resolves a transaction into what the Recent Activity feed
 * shows: an icon, a human title, direction (money in/out) and
 * a status label. Built entirely from data already fetched by
 * loadDashboardStats — no extra network calls.
 */
const describeTransaction = (
  transaction: DashboardTransaction
) => {
  const type = normalizeText(
    transaction.transaction_type
  );

  const category = normalizeText(
    transaction.category
  );

  const isOut =
    isMoneyOutTransaction(
      transaction
    );

  const status = isFailedTransaction(
    transaction
  )
    ? "failed"
    : isSuccessfulTransaction(
        transaction
      )
    ? "successful"
    : "pending";

  let Icon = Receipt;

  if (
    type.includes("airtime") ||
    category.includes("airtime")
  ) {
    Icon = Smartphone;
  } else if (
    type.includes("data") ||
    category.includes("data")
  ) {
    Icon = Wifi;
  } else if (
    type.includes("electric") ||
    category.includes("electric")
  ) {
    Icon = Zap;
  } else if (
    type.includes("cable") ||
    category.includes("cable")
  ) {
    Icon = CreditCard;
  } else if (
    type.includes("transfer") ||
    type.includes("bank")
  ) {
    Icon = Send;
  } else if (
    type === "credit" ||
    type === "funding" ||
    type === "deposit" ||
    category === "funding"
  ) {
    Icon = Plus;
  }

  const rawTitle =
    transaction.description?.trim() ||
    (transaction.category ||
      transaction.transaction_type ||
      "Transaction")
      .replace(/[_-]+/g, " ");

  const title =
    rawTitle.charAt(0).toUpperCase() +
    rawTitle.slice(1);

  return {
    Icon,
    title,
    isOut,
    status,
  };
};

const formatTransactionDate = (
  iso: string
): string => {
  try {
    return new Intl.DateTimeFormat(
      "en-NG",
      {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }
    ).format(new Date(iso));
  } catch {
    return "";
  }
};

const getGreeting = (): string => {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 17) {
    return "Good afternoon";
  }

  return "Good evening";
};

/*
 * ============================================================
 * SERVICE CATALOG
 * ============================================================
 *
 * Icon backgrounds are deliberately drawn from one disciplined
 * tint system (a light "-50" fill with a matching "-600" icon)
 * rather than a grab-bag of saturated flat colors — this is
 * what keeps a 9-tile grid feeling designed instead of random.
 */

const services = [
  {
    title: "Buy Airtime",
    description:
      "Recharge your phone instantly",
    icon: Smartphone,
    tint: "bg-blue-50 text-blue-600",
    type: "airtime" as BillService,
    available: true,
  },
  {
    title: "Buy Data",
    description: "Fast data bundles",
    icon: Wifi,
    tint: "bg-violet-50 text-violet-600",
    type: "data" as BillService,
    available: true,
  },
  {
    title: "Electricity",
    description: "Pay your power bill",
    icon: Zap,
    tint: "bg-amber-50 text-amber-600",
    type: "electricity" as BillService,
    available: true,
  },
  {
    title: "Cable TV",
    description: "DSTV, GOtv & Startimes",
    icon: CreditCard,
    tint: "bg-rose-50 text-rose-600",
    type: "cable" as BillService,
    available: true,
  },
  {
    title: "Airtime E-Pin",
    description: "Buy recharge PINs",
    icon: Receipt,
    tint: "bg-sky-50 text-sky-600",
    type: "airtime-card" as BillService,
    available: true,
  },
  {
    title: "Data E-Pin",
    description: "Buy data PINs",
    icon: Radio,
    tint: "bg-indigo-50 text-indigo-600",
    type: "data-card" as BillService,
    available: true,
  },
  {
    title: "Smile",
    description: "Smile data bundles",
    icon: Wifi,
    tint: "bg-cyan-50 text-cyan-600",
    type: "smile" as BillService,
    available: true,
  },
  {
    title: "WAEC",
    description: "Result checker PINs",
    icon: GraduationCap,
    tint: "bg-emerald-50 text-emerald-600",
    type: "waec" as BillService,
    available: true,
  },
  {
    title: "JAMB",
    description: "UTME & DE PINs",
    icon: GraduationCap,
    tint: "bg-teal-50 text-teal-600",
    type: "jamb" as BillService,
    available: true,
  },
  {
    title: "Internet Bills",
    description: "Coming soon",
    icon: Wifi,
    tint: "bg-slate-100 text-slate-400",
    type: "internet" as BillService,
    available: false,
  },
  {
    title: "Insurance",
    description: "Coming soon",
    icon: Shield,
    tint: "bg-slate-100 text-slate-400",
    type: "insurance" as BillService,
    available: false,
  },
  {
    title: "Savings",
    description: "Coming soon",
    icon: PiggyBank,
    tint: "bg-slate-100 text-slate-400",
    type: "savings" as BillService,
    available: false,
  },
];

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
   * STATS + RECENT ACTIVITY
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

  const [
    recentTransactions,
    setRecentTransactions,
  ] = useState<DashboardTransaction[]>(
    []
  );

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
  }, [authLoading, user]);

  /*
   * ============================================================
   * EDGE FUNCTION ERROR
   * ============================================================
   */

  const extractFunctionError =
    async (
      error: any,
      fallback = "Unable to process your request."
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

        setRecentTransactions([]);

        setStatsLoading(false);

        return;
      }

      try {
        setStatsLoading(true);

        const {
          data,
          error,
        } = await supabase
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
          .eq("user_id", user.id)
          .order("created_at", {
            ascending: false,
          });

        if (error) {
          throw error;
        }

        const transactions =
          (data ??
            []) as DashboardTransaction[];

        setRecentTransactions(
          transactions.slice(0, 4)
        );

        const now = new Date();

        const monthStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          1,
          0,
          0,
          0,
          0
        );

        const monthEnd = new Date(
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
    if (authLoading || !user) {
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

    const channel = supabase
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
   *
   * IMPORTANT:
   * The live Edge Function is:
   *
   * clubkonnect-services
   *
   * NOT:
   *
   * clubkonnect-service
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

    /*
     * Frontend balance check.
     *
     * The Edge Function remains responsible for the
     * authoritative atomic wallet debit.
     */
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
   *
   * SendMoney.tsx remains completely separate from the
   * service-payment system.
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
    );
  }

  /*
   * ============================================================
   * NO USER
   * ============================================================
   */

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

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
      <ProfilePage
        onBack={() =>
          setCurrentPage(
            "me"
          )
        }
      />
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
      <TransactionHistory
        onBack={() =>
          setCurrentPage(
            "me"
          )
        }
      />
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
      <RewardsPage
        onBack={() =>
          setCurrentPage(
            "home"
          )
        }
      />
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
      <CardsPage
        onBack={() =>
          setCurrentPage(
            "home"
          )
        }
      />
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
      <CustomerServicePage
        onBack={() =>
          setCurrentPage(
            "me"
          )
        }
      />
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
      <SupportPage
        onBack={() =>
          setCurrentPage(
            "me"
          )
        }
      />
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
      <TransactionLimitPage
        onBack={() =>
          setCurrentPage(
            "me"
          )
        }
      />
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
      <PaymentPinPage
        onBack={() =>
          setCurrentPage(
            "me"
          )
        }
      />
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
      <DisputesPage
        onBack={() =>
          setCurrentPage(
            "me"
          )
        }
      />
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
    );
  }

  /*
   * ============================================================
   * WALLET LOADING
   * ============================================================
   */

  if (walletLoading) {
    return (
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
   * BOTTOM NAVIGATION — floating pill island
   * ============================================================
   */

  const NAV_ITEMS: Array<{
    key: CurrentPage;
    label: string;
    icon: typeof Home;
  }> = [
    { key: "home", label: "Home", icon: Home },
    { key: "rewards", label: "Rewards", icon: Gift },
    { key: "cards", label: "Cards", icon: CreditCard },
    { key: "me", label: "Me", icon: User },
  ];

  const renderBottomNav = (
    page: CurrentPage
  ) => (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
      <div className="mx-auto flex max-w-sm items-center gap-1 rounded-[28px] border border-slate-200/70 bg-white/95 p-2 shadow-[0_16px_40px_rgba(15,23,42,0.14)] backdrop-blur-xl">
        {NAV_ITEMS.map((item) => {
          const active = page === item.key;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() =>
                setCurrentPage(item.key)
              }
              className={[
                "flex flex-1 flex-col items-center gap-1 rounded-3xl py-2.5 transition",
                active
                  ? "bg-gradient-to-br from-[#4C1D95] to-[#2563EB] text-white shadow-md"
                  : "text-slate-500 hover:bg-slate-50",
              ].join(" ")}
            >
              <item.icon className="h-5 w-5" />

              <span className="text-[10px] font-semibold">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  /*
   * ============================================================
   * MAIN DASHBOARD
   * ============================================================
   */

  return (
    <div className="min-h-screen bg-[#f7f8fc] pb-28">

      {/*
        Distinct type system for this brand: Space Grotesk for
        balance figures and headings (a geometric display face
        with real character on currency numerals), Inter for
        everything read at length. One orchestrated reveal
        animation on the wallet card only — respects
        prefers-reduced-motion.
      */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');

        .font-display {
          font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
        }

        @keyframes iyanjuHeroReveal {
          from {
            opacity: 0;
            transform: translateY(14px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .iyanju-hero-reveal {
          animation: iyanjuHeroReveal 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @media (prefers-reduced-motion: reduce) {
          .iyanju-hero-reveal {
            animation: none;
          }
        }
      `}</style>

      {/* ====================================================== */}
      {/* TOP HEADER                                             */}
      {/* ====================================================== */}

      <header className="sticky top-0 z-30 border-b border-white/10 bg-gradient-to-r from-[#5b21b6] via-[#6d28d9] to-[#2563eb] text-white shadow-lg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-[72px] items-center justify-between">

            {/* BRAND */}

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
                <span className="font-display text-sm font-bold text-purple-700">
                  IP
                </span>
              </div>

              <div className="hidden sm:block">
                <p className="font-display text-lg font-bold tracking-tight">
                  IyanjuPay
                </p>

                <p className="text-[10px] font-medium text-purple-100">
                  Your money. Your control.
                </p>
              </div>
            </button>

            {/* HEADER ACTIONS */}

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

        {/* ==================================================== */}
        {/* GREETING                                             */}
        {/* ==================================================== */}

        <section className="mb-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                {getGreeting()}, {firstName}
              </h1>

              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                What would you like to do today?
              </p>
            </div>

            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Account active
            </div>
          </div>
        </section>

        {/* ==================================================== */}
        {/* WALLET HERO                                          */}
        {/* ==================================================== */}

        <section className="mb-7">
          <Card className="iyanju-hero-reveal relative overflow-hidden rounded-[28px] border-0 bg-gradient-to-br from-[#4c1d95] via-[#6d28d9] to-[#2563eb] text-white shadow-[0_20px_60px_rgba(79,70,229,0.22)]">

            {/*
              A quiet adire-inspired watermark — the tie-dye
              resist patterns (dots, cowries, small diamonds)
              common in Yoruba textiles — standing in for the
              generic blurred-circle decoration. This is the one
              bold, brand-specific move on the page; everything
              else stays disciplined.
            */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.08]"
              aria-hidden="true"
            >
              <defs>
                <pattern
                  id="iyanjuAdireMotif"
                  width="48"
                  height="48"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(6)"
                >
                  <circle cx="8" cy="10" r="2.4" fill="white" />
                  <circle cx="32" cy="6" r="1.4" fill="white" />
                  <path
                    d="M22 30 L26.5 37 L17.5 37 Z"
                    fill="white"
                  />
                  <circle cx="40" cy="34" r="2" fill="white" />
                  <circle cx="14" cy="40" r="1.2" fill="white" />
                </pattern>
              </defs>
              <rect
                width="100%"
                height="100%"
                fill="url(#iyanjuAdireMotif)"
              />
            </svg>

            <div className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-white/5 blur-2xl" />

            <CardContent className="relative p-5 sm:p-7">

              <div className="flex flex-col gap-7">

                {/* BALANCE AREA */}

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-purple-100">
                        Available balance
                      </p>

                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-purple-100">
                        NGN
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-3">
                      <span className="font-display text-3xl font-bold tracking-tight sm:text-[42px]">
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

                  {/* WALLET ID */}

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

                {/* ACTIONS */}

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

                {/* MOBILE WALLET ID */}

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

        {/* ==================================================== */}
        {/* QUICK ACTIONS                                        */}
        {/* ==================================================== */}

        <section className="mb-8">
          <div className="mb-3">
            <h2 className="font-display text-lg font-bold text-slate-950">
              Quick actions
            </h2>

            <p className="text-xs text-slate-500">
              Get things done faster
            </p>
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
              className="group rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md sm:p-4"
            >
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 transition group-hover:scale-105">
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

        {/* ==================================================== */}
        {/* SERVICES                                             */}
        {/* ==================================================== */}

        <section className="mb-8">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight text-slate-950">
                Services
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Everything you need, in one place
              </p>
            </div>

            <span className="hidden rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700 sm:block">
              9 available
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {services.map(
              (service, index) => (
                <button
                  key={`${service.type}-${index}`}
                  type="button"
                  onClick={() =>
                    handleServiceClick(
                      service
                    )
                  }
                  className={[
                    "group flex flex-col items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left transition",
                    service.available
                      ? "hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_10px_30px_rgba(109,40,217,0.08)]"
                      : "opacity-70",
                  ].join(" ")}
                >
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl transition group-hover:scale-105 ${service.tint}`}
                  >
                    <service.icon className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {service.title}
                    </p>

                    <p className="mt-0.5 text-xs text-slate-500">
                      {service.description}
                    </p>
                  </div>
                </button>
              )
            )}
          </div>
        </section>

        {/* ==================================================== */}
        {/* RECENT ACTIVITY                                      */}
        {/* ==================================================== */}

        <section className="mb-8">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight text-slate-950">
                Recent activity
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Your latest transactions
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setCurrentPage(
                  "history"
                )
              }
              className="flex items-center gap-1 text-sm font-semibold text-violet-700 hover:text-violet-800"
            >
              View all
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <Card className="rounded-3xl border-slate-200/80 bg-white shadow-sm">
            <CardContent className="p-0">
              {statsLoading ? (
                <div className="divide-y divide-slate-100">
                  {[1, 2, 3].map(
                    (row) => (
                      <div
                        key={row}
                        className="flex items-center gap-3 px-5 py-4"
                      >
                        <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />

                        <div className="flex-1">
                          <div className="h-3.5 w-32 animate-pulse rounded bg-slate-100" />

                          <div className="mt-2 h-3 w-20 animate-pulse rounded bg-slate-100" />
                        </div>

                        <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
                      </div>
                    )
                  )}
                </div>
              ) : recentTransactions.length ===
                0 ? (
                <div className="p-8 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                    <Receipt className="h-5 w-5" />
                  </div>

                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    No transactions yet
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Your activity will show up here once you make your first payment.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentTransactions.map(
                    (transaction) => {
                      const {
                        Icon,
                        title,
                        isOut,
                        status,
                      } =
                        describeTransaction(
                          transaction
                        );

                      const amount =
                        Number(
                          transaction.amount
                        );

                      return (
                        <div
                          key={
                            transaction.id
                          }
                          className="flex items-center gap-3 px-5 py-4"
                        >
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                              isOut
                                ? "bg-slate-100 text-slate-600"
                                : "bg-emerald-50 text-emerald-600"
                            }`}
                          >
                            <Icon className="h-5 w-5" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {title}
                            </p>

                            <p className="mt-0.5 text-xs text-slate-500">
                              {formatTransactionDate(
                                transaction.created_at
                              )}
                              {status ===
                                "pending" &&
                                " · Pending"}
                              {status ===
                                "failed" &&
                                " · Failed"}
                            </p>
                          </div>

                          <p
                            className={`shrink-0 text-sm font-bold ${
                              isOut
                                ? "text-slate-900"
                                : "text-emerald-600"
                            }`}
                          >
                            {isOut
                              ? "−"
                              : "+"}
                            ₦
                            {Number.isFinite(
                              amount
                            )
                              ? amount.toLocaleString(
                                  "en-NG",
                                  {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 2,
                                  }
                                )
                              : "0"}
                          </p>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ==================================================== */}
        {/* ACCOUNT OVERVIEW                                     */}
        {/* ==================================================== */}

        <section className="mb-8">
          <div className="mb-4">
            <h2 className="font-display text-xl font-bold tracking-tight text-slate-950">
              Account overview
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              A quick view of your activity
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

            {/* SPENDING */}

            <Card className="rounded-3xl border-slate-200/80 bg-white shadow-sm transition hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Spent this month
                    </p>

                    {statsLoading ? (
                      <div className="mt-2 h-7 w-28 animate-pulse rounded-md bg-slate-100" />
                    ) : (
                      <p className="font-display mt-2 text-2xl font-bold tracking-tight text-slate-950">
                        ₦
                        {stats.monthlySpent.toLocaleString(
                          "en-NG",
                          {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          }
                        )}
                      </p>
                    )}
                  </div>

                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                    <Banknote className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* TRANSACTIONS */}

            <Card className="rounded-3xl border-slate-200/80 bg-white shadow-sm transition hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Transactions this month
                    </p>

                    {statsLoading ? (
                      <div className="mt-2 h-7 w-16 animate-pulse rounded-md bg-slate-100" />
                    ) : (
                      <p className="font-display mt-2 text-2xl font-bold tracking-tight text-slate-950">
                        {stats.monthlyTransactions.toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                    <History className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SUCCESS RATE */}

            <Card className="rounded-3xl border-slate-200/80 bg-white shadow-sm transition hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Successful transactions
                    </p>

                    {statsLoading ? (
                      <div className="mt-2 h-7 w-14 animate-pulse rounded-md bg-slate-100" />
                    ) : (
                      <p className="font-display mt-2 text-2xl font-bold tracking-tight text-slate-950">
                        {stats.successRate}%
                      </p>
                    )}
                  </div>

                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <Shield className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
        </section>

        {/* ==================================================== */}
        {/* SECURITY / TRUST                                    */}
        {/* ==================================================== */}

        <section className="mb-4">
          <Card className="overflow-hidden rounded-3xl border-slate-200/80 bg-white shadow-sm">
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                    <Shield className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      Your account is protected
                    </p>

                    <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">
                      Every payment is authorized with your PIN, and your funds stay secured behind bank-grade authentication.
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
                  Security settings
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
  );
};

export default Dashboard;
