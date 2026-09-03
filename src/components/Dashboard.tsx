import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

import {
  LogOut,
  User,
  History,
  Send,
  QrCode,
  Shield,
  Gift,
  Banknote,
  Home,
  Plus,
  Eye,
  EyeOff,
  Smartphone,
  Wifi,
  Zap,
  CreditCard,
  Loader2,
  Headphones,
  GraduationCap,
  Receipt,
  Radio,
} from "lucide-react";

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
 *
 * These are customer-facing services.
 *
 * The customer must never need to know which backend provider
 * is being used.
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
  | "insurance";

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
 * AVAILABLE CUSTOMER SERVICES
 * ============================================================
 *
 * These are the services that can actually be opened.
 *
 * Internet and Insurance are deliberately excluded because
 * they are Coming Soon.
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

/*
 * ============================================================
 * TRANSACTION STATUS HELPERS
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

  /*
   * Explicit incoming transactions.
   */
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

  /*
   * Explicit outgoing transactions.
   */
  if (
    type === "debit" ||
    metadataDirection === "debit" ||
    metadataDirection === "out" ||
    metadataDirection === "outgoing"
  ) {
    return true;
  }

  /*
   * Known outgoing types.
   */
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
          const response = error.context;

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
        return String(error.message);
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

    loadDashboardStats();
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
          loadDashboardStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(
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

    bootstrapWallet();

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
   *
   * Only actual customer services are displayed here.
   *
   * Internet and Insurance remain visible as Coming Soon.
   *
   * Betting, Gift Cards, Flight Booking, Hotel Booking and
   * Transport have been removed completely.
   */

  const services = [
    {
      title: "Buy Airtime",
      description:
        "Recharge your phone",
      icon: Smartphone,
      color: "bg-blue-500",
      type: "airtime" as BillService,
      available: true,
    },
    {
      title: "Buy Data",
      description:
        "Internet data bundles",
      icon: Wifi,
      color: "bg-purple-500",
      type: "data" as BillService,
      available: true,
    },
    {
      title: "Electricity",
      description:
        "Pay electricity bills",
      icon: Zap,
      color: "bg-yellow-500",
      type: "electricity" as BillService,
      available: true,
    },
    {
      title: "Cable TV",
      description:
        "DSTV, GOTV, Startimes",
      icon: CreditCard,
      color: "bg-red-500",
      type: "cable" as BillService,
      available: true,
    },
    {
      title: "Airtime E-Pin",
      description:
        "Buy airtime recharge PINs",
      icon: Receipt,
      color: "bg-green-500",
      type: "airtime-card" as BillService,
      available: true,
    },
    {
      title: "Data E-Pin",
      description:
        "Buy data recharge PINs",
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
        "Purchase WAEC services",
      icon: GraduationCap,
      color: "bg-orange-500",
      type: "waec" as BillService,
      available: true,
    },
    {
      title: "JAMB",
      description:
        "Purchase JAMB services",
      icon: GraduationCap,
      color: "bg-emerald-500",
      type: "jamb" as BillService,
      available: true,
    },

    /*
     * Coming Soon services.
     */

    {
      title: "Internet Bills",
      description:
        "Internet bill payments",
      icon: Wifi,
      color: "bg-gray-500",
      type: "internet" as BillService,
      available: false,
    },
    {
      title: "Insurance",
      description:
        "Insurance services",
      icon: Shield,
      color: "bg-teal-500",
      type: "insurance" as BillService,
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
    /*
     * Transfer is intentionally handled by the dedicated
     * SendMoney page and is not part of the service-payment
     * flow.
     */
    if (
      service.type === "internet" ||
      service.type === "insurance"
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
        title: "Service unavailable",
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
   * BILL / SERVICE PAYMENT
   * ============================================================
   *
   * All customer services now go through the unified
   * ClubKonnect service Edge Function.
   *
   * The provider is deliberately NOT sent from the customer UI.
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
     * The frontend performs a friendly balance check.
     *
     * The Edge Function remains responsible for the actual
     * atomic wallet debit.
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

    /*
     * Customer details are passed through without exposing
     * the underlying service provider.
     */
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
      /*
       * IMPORTANT:
       *
       * This is now the standard ClubKonnect service
       * Edge Function.
       *
       * No Flutterwave bill-payment call is made here.
       */
      const {
        data,
        error,
      } =
        await supabase.functions.invoke(
          "clubkonnect-service",
          {
            body: {
              action: "purchase",
              service,
              amount,
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

      /*
       * Refresh the wallet after the debit.
       */
      await refreshWallet();

      /*
       * Refresh dashboard statistics so the new transaction
       * appears immediately.
       */
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
          "on_hold";

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
   * This remains completely separate from the service system.
   *
   * IyanjuPay transfers must continue using SendMoney.tsx.
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

    /*
     * IyanjuPay transfers must not reach this handler.
     */
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-purple-600 mx-auto" />

          <p className="mt-4 text-gray-600">
            Loading your account...
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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  /*
   * ============================================================
   * INTERNAL PAGE ROUTING
   * ============================================================
   */

  /*
   * SERVICE PAYMENT PAGE
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
      />
    );
  }

  /*
   * SEND MONEY PAGE
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
   * PROFILE
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
   * TRANSACTION HISTORY
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
   * REWARDS
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
   * CARDS
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
   * CUSTOMER SERVICE
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
   * SUPPORT
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
   * TRANSACTION LIMIT
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
   * PAYMENT PIN
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
   * DISPUTES
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
   * ME PAGE
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-purple-600 mx-auto" />

          <p className="mt-4 text-gray-600">
            Loading your wallet...
          </p>
        </div>
      </div>
    );
  }

  /*
   * ============================================================
   * BOTTOM NAVIGATION
   * ============================================================
   */

  const renderBottomNav = (
    page: CurrentPage
  ) => (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-2">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-around">

          {/* HOME */}

          <Button
            variant={
              page === "home"
                ? "default"
                : "ghost"
            }
            size="sm"
            onClick={() =>
              setCurrentPage(
                "home"
              )
            }
            className={`flex flex-col items-center gap-1 px-6 py-3 ${
              page === "home"
                ? "bg-purple-600 text-white"
                : "text-gray-600"
            }`}
          >
            <Home className="h-4 w-4" />

            <span className="text-xs">
              Home
            </span>
          </Button>

          {/* REWARDS */}

          <Button
            variant={
              page === "rewards"
                ? "default"
                : "ghost"
            }
            size="sm"
            onClick={() =>
              setCurrentPage(
                "rewards"
              )
            }
            className={`flex flex-col items-center gap-1 px-6 py-3 ${
              page === "rewards"
                ? "bg-purple-600 text-white"
                : "text-gray-600"
            }`}
          >
            <Gift className="h-4 w-4" />

            <span className="text-xs">
              Reward
            </span>
          </Button>

          {/* CARDS */}

          <Button
            variant={
              page === "cards"
                ? "default"
                : "ghost"
            }
            size="sm"
            onClick={() =>
              setCurrentPage(
                "cards"
              )
            }
            className={`flex flex-col items-center gap-1 px-6 py-3 ${
              page === "cards"
                ? "bg-purple-600 text-white"
                : "text-gray-600"
            }`}
          >
            <CreditCard className="h-4 w-4" />

            <span className="text-xs">
              Card
            </span>
          </Button>

          {/* ME */}

          <Button
            variant={
              page === "me"
                ? "default"
                : "ghost"
            }
            size="sm"
            onClick={() =>
              setCurrentPage(
                "me"
              )
            }
            className={`flex flex-col items-center gap-1 px-6 py-3 ${
              page === "me"
                ? "bg-purple-600 text-white"
                : "text-gray-600"
            }`}
          >
            <User className="h-4 w-4" />

            <span className="text-xs">
              Me
            </span>
          </Button>

        </div>
      </div>
    </div>
  );

  /*
   * ============================================================
   * DASHBOARD
   * ============================================================
   */

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 pb-20">

      {/* ====================================================== */}
      {/* HEADER */}
      {/* ====================================================== */}

      <header className="bg-gradient-to-r from-purple-600 to-blue-600 text-white">

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="flex justify-between items-center h-16">

            {/* LOGO */}

            <div className="flex items-center">

              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center mr-3">

                <span className="text-purple-600 font-bold text-sm">
                  IP
                </span>

              </div>

              <h1 className="text-xl font-bold">
                IyanjuPay
              </h1>

            </div>

            {/* HEADER ACTIONS */}

            <div className="flex items-center gap-2">

              {/* QR */}

              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setQrModalOpen(
                    true
                  )
                }
                className="text-white hover:bg-white/20"
                aria-label="Show QR code"
              >
                <QrCode className="h-4 w-4" />
              </Button>

              {/* PROFILE */}

              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setCurrentPage(
                    "me"
                  )
                }
                className="text-white hover:bg-white/20"
                aria-label="Open profile"
              >
                <User className="h-4 w-4" />
              </Button>

              {/* HISTORY */}

              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setCurrentPage(
                    "history"
                  )
                }
                className="text-white hover:bg-white/20"
                aria-label="Transaction history"
              >
                <History className="h-4 w-4" />
              </Button>

              {/* SIGN OUT */}

              <Button
                variant="ghost"
                size="sm"
                onClick={
                  signOut
                }
                className="text-white hover:bg-white/20"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>

            </div>

          </div>

        </div>

      </header>

      {/* ====================================================== */}
      {/* MAIN */}
      {/* ====================================================== */}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* GREETING */}

        <div className="mb-6">

          <h2 className="text-2xl font-bold text-gray-900 mb-1">
            Hello! 👋
          </h2>

          <p className="text-gray-600">
            What would you like to do today?
          </p>

        </div>

        {/* ==================================================== */}
        {/* WALLET */}
        {/* ==================================================== */}

        <div className="mb-6">

          <Card className="bg-gradient-to-r from-purple-600 to-blue-600 text-white border-0 shadow-lg">

            <CardContent className="p-6">

              <div className="flex justify-between items-start mb-4">

                {/* BALANCE */}

                <div>

                  <p className="text-purple-100 text-sm mb-1">
                    Total Balance
                  </p>

                  <div className="flex items-center gap-2">

                    <span className="text-3xl font-bold">

                      ₦
                      {showBalance
                        ? Number(
                            wallet?.balance ??
                              0
                          ).toLocaleString(
                            "en-NG",
                            {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            }
                          )
                        : "****"}

                    </span>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setShowBalance(
                          (previous) =>
                            !previous
                        )
                      }
                      className="text-white hover:bg-white/20 p-1"
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

                </div>

                {/* WALLET ID */}

                <div className="text-right">

                  <p className="text-purple-100 text-sm">
                    Wallet ID
                  </p>

                  <p className="font-mono text-sm font-semibold tracking-wider">
                    {wallet?.wallet_id ||
                      "—"}
                  </p>

                </div>

              </div>

              {/* WALLET ACTIONS */}

              <div className="flex gap-3">

                <Button
                  onClick={() =>
                    setFundModalOpen(
                      true
                    )
                  }
                  className="flex-1 bg-white text-purple-600 hover:bg-gray-100 font-semibold"
                >
                  <Plus className="h-4 w-4 mr-2" />

                  Add Money
                </Button>

                <Button
                  onClick={() =>
                    setCurrentPage(
                      "send-money"
                    )
                  }
                  variant="outline"
                  className="flex-1 bg-white text-purple-600 hover:bg-gray-100 font-semibold"
                >
                  <Send className="h-4 w-4 mr-2" />

                  Send Money
                </Button>

              </div>

            </CardContent>

          </Card>

        </div>

        {/* ==================================================== */}
        {/* SERVICES */}
        {/* ==================================================== */}

        <div className="mb-6">

          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Services
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">

            {services.map(
              (
                service,
                index
              ) => (
                <ServiceCard
                  key={`${service.type}-${index}`}
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
              )
            )}

          </div>

        </div>

        {/* ==================================================== */}
        {/* STATS */}
        {/* ==================================================== */}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* MONTHLY SPENDING */}

          <Card className="bg-white shadow-sm">

            <CardContent className="p-4">

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm text-gray-600">
                    This Month
                  </p>

                  <p className="text-2xl font-bold text-gray-900">

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

                  <p className="text-xs text-gray-500">
                    Total Spent
                  </p>

                </div>

                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">

                  <Banknote className="h-6 w-6 text-red-600" />

                </div>

              </div>

            </CardContent>

          </Card>

          {/* TRANSACTIONS */}

          <Card className="bg-white shadow-sm">

            <CardContent className="p-4">

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm text-gray-600">
                    Transactions
                  </p>

                  <p className="text-2xl font-bold text-gray-900">

                    {statsLoading
                      ? "..."
                      : stats.monthlyTransactions.toLocaleString()}

                  </p>

                  <p className="text-xs text-gray-500">
                    This Month
                  </p>

                </div>

                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">

                  <History className="h-6 w-6 text-blue-600" />

                </div>

              </div>

            </CardContent>

          </Card>

          {/* SUCCESS RATE */}

          <Card className="bg-white shadow-sm">

            <CardContent className="p-4">

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm text-gray-600">
                    Success Rate
                  </p>

                  <p className="text-2xl font-bold text-gray-900">

                    {statsLoading
                      ? "..."
                      : `${stats.successRate}%`}

                  </p>

                  <p className="text-xs text-gray-500">
                    All Time
                  </p>

                </div>

                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">

                  <Shield className="h-6 w-6 text-green-600" />

                </div>

              </div>

            </CardContent>

          </Card>

        </div>

      </main>

      {/* ====================================================== */}
      {/* BOTTOM NAVIGATION */}
      {/* ====================================================== */}

      {renderBottomNav(
        currentPage
      )}

      {/* ====================================================== */}
      {/* FUND WALLET */}
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
      {/* QR CODE */}
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
      {/* LIVE SUPPORT CHAT */}
      {/* ====================================================== */}

      <Button
        type="button"
        onClick={() =>
          setSupportChatOpen(
            true
          )
        }
        className="fixed bottom-24 right-5 z-50 h-14 w-14 rounded-full bg-purple-600 hover:bg-purple-700 shadow-xl p-0"
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
      {/* WHATSAPP */}
      {/* ====================================================== */}

      <WhatsAppFloat />

    </div>
  );
};

export default Dashboard;
