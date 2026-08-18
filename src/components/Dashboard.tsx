import React, { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
} from "@/components/ui/card";

import { LogOut, User, History, Send, QrCode, Shield, Gift, Banknote, Car, Gamepad2, Plane, Home, Plus, Eye, EyeOff, Smartphone, Wifi, Zap, CreditCard, Loader2,
} from "lucide-react";

import ServiceCard from "./services/ServiceCard";
import FundWalletModal from "./modals/FundWalletModal";
import ServiceModal from "./modals/ServiceModal";
import TransferModal from "./modals/TransferModal";
import QRCodeModal from "./modals/QRCodeModal";
import WhatsAppFloat from "./WhatsAppFloat";
import ProfilePage from "./profile/ProfilePage";
import TransactionHistory from "./transactions/TransactionHistory";
import RewardsPage from "./rewards/RewardsPage";
import CardsPage from "./cards/CardsPage";
import MePage from "./me/MePage";

import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type BillService =
  | "airtime"
  | "data"
  | "electricity"
  | "cable"
  | "internet";

type CurrentPage =
  | "home"
  | "rewards"
  | "cards"
  | "me"
  | "profile"
  | "history";

type SelectedService = {
  title: string;
  type: BillService;
};

const SUPPORTED_BILL_SERVICES: BillService[] = [
  "airtime",
  "data",
  "electricity",
  "cable",
  "internet",
];

/* ================================================================
   SPLASH SCREEN
   ================================================================ */

const DashboardSplashScreen = () => {
  return (
    <div className="fixed inset-0 z-[9999] flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-purple-700 via-purple-600 to-blue-600">
      {/* Background decoration */}
      <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />

      <div className="absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-blue-300/10 blur-3xl" />

      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        {/* Logo */}
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-[28px] bg-white shadow-2xl">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-blue-600">
            <span className="text-2xl font-extrabold tracking-tight text-white">
              IP
            </span>
          </div>
        </div>

        {/* Brand */}
        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          IyanjuPay
        </h1>

        <p className="mt-2 text-sm font-medium text-purple-100 sm:text-base">
          Simple. Secure. Seamless.
        </p>

        {/* Loading */}
        <div className="mt-10 flex flex-col items-center">
          <Loader2 className="h-7 w-7 animate-spin text-white" />

          <p className="mt-3 text-sm text-white/80">
            Loading your wallet...
          </p>
        </div>

        {/* Bottom text */}
        <p className="mt-12 text-xs text-white/50">
          Secure payments powered by IyanjuPay
        </p>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { user, signOut } = useAuth();

  const {
    wallet,
    loading,
    refreshWallet,
  } = useWallet(user?.id);

  const [showSplash, setShowSplash] =
    useState(true);

  const [fundModalOpen, setFundModalOpen] =
    useState(false);

  const [serviceModalOpen, setServiceModalOpen] =
    useState(false);

  const [transferModalOpen, setTransferModalOpen] =
    useState(false);

  const [qrModalOpen, setQrModalOpen] =
    useState(false);

  const [selectedService, setSelectedService] =
    useState<SelectedService | null>(null);

  const [showBalance, setShowBalance] =
    useState(true);

  const [currentPage, setCurrentPage] =
    useState<CurrentPage>("home");

  const { toast } = useToast();

  /* ================================================================
     SPLASH SCREEN TIMER
     ================================================================ */

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowSplash(false);
    }, 1800);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  /* ================================================================
     WALLET BOOTSTRAP
     ================================================================ */

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const bootstrapWallet = async () => {
      try {
        const {
          data,
          error,
        } = await supabase.functions.invoke(
          "wallet-bootstrap",
          {
            body: {},
          }
        );

        if (cancelled) return;

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
      } catch (error) {
        if (cancelled) return;

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
  }, [user, refreshWallet]);

  /* ================================================================
     OPTIONAL MANUAL DEPOSIT SYNC
     ================================================================ */

  const syncDeposits = async () => {
    if (!user) return;

    try {
      console.log(
        "Starting Flutterwave deposit sync..."
      );

      const {
        data,
        error,
      } = await supabase.functions.invoke(
        "flutterwave-sync-deposits",
        {
          body: {},
        }
      );

      console.log(
        "SYNC DATA:",
        data
      );

      console.log(
        "SYNC ERROR:",
        error
      );

      if (error) {
        console.error(
          "Deposit sync failed:",
          error
        );

        return;
      }

      await refreshWallet();
    } catch (error) {
      console.error(
        "Deposit sync error:",
        error
      );
    }
  };

  /* ================================================================
     SERVICES
     ================================================================ */

  const services = [
    {
      title: "Buy Airtime",
      description: "Recharge your phone",
      icon: Smartphone,
      color: "bg-blue-500",
      type: "airtime",
    },
    {
      title: "Buy Data",
      description: "Internet data bundles",
      icon: Wifi,
      color: "bg-purple-500",
      type: "data",
    },
    {
      title: "Electricity",
      description: "Pay electricity bills",
      icon: Zap,
      color: "bg-yellow-500",
      type: "electricity",
    },
    {
      title: "Cable TV",
      description: "DSTV, GOTV, Startimes",
      icon: CreditCard,
      color: "bg-red-500",
      type: "cable",
    },
    {
      title: "Transfer Money",
      description: "Send money to others",
      icon: Send,
      color: "bg-green-500",
      type: "transfer",
    },
    {
      title: "Internet Bills",
      description: "Pay internet bills",
      icon: Wifi,
      color: "bg-indigo-500",
      type: "internet",
    },
    {
      title: "Insurance",
      description: "Pay insurance premiums",
      icon: Shield,
      color: "bg-teal-500",
      type: "insurance",
    },
    {
      title: "Gift Cards",
      description: "Buy digital gift cards",
      icon: Gift,
      color: "bg-pink-500",
      type: "giftcards",
    },
    {
      title: "Betting",
      description: "Fund betting accounts",
      icon: Gamepad2,
      color: "bg-orange-500",
      type: "betting",
    },
    {
      title: "Flight Booking",
      description: "Book domestic flights",
      icon: Plane,
      color: "bg-sky-500",
      type: "flight",
    },
    {
      title: "Hotel Booking",
      description: "Book hotel rooms",
      icon: Home,
      color: "bg-emerald-500",
      type: "hotel",
    },
    {
      title: "Transport",
      description: "Book bus tickets",
      icon: Car,
      color: "bg-gray-500",
      type: "transport",
    },
  ];

  /* ================================================================
     SERVICE CLICK
     ================================================================ */

  const handleServiceClick = (
    service: typeof services[number]
  ) => {
    if (service.type === "transfer") {
      setTransferModalOpen(true);
      return;
    }

    if (
      !SUPPORTED_BILL_SERVICES.includes(
        service.type as BillService
      )
    ) {
      toast({
        title: "Service coming soon",
        description:
          `${service.title} is not yet available.`,
      });

      return;
    }

    setSelectedService({
      title: service.title,
      type: service.type as BillService,
    });

    setServiceModalOpen(true);
  };

  /* ================================================================
     BILL PAYMENT
     ================================================================ */

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
        `${selectedService.title} is not currently supported.`
      );
    }

    /* Amount validation */
    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw new Error(
        "Please enter a valid payment amount."
      );
    }

    /* Wallet validation */
    const currentBalance =
      Number(wallet?.balance ?? 0);

    if (
      amount > currentBalance
    ) {
      throw new Error(
        "Insufficient wallet balance. Please fund your wallet."
      );
    }

    /* Biller */
    const billerCode =
      String(
        details?.biller_code ??
          details?.billerCode ??
          ""
      ).trim();

    if (!billerCode) {
      throw new Error(
        "Please select a valid bill provider."
      );
    }

    /* Item */
    const itemCode =
      String(
        details?.item_code ??
          details?.itemCode ??
          ""
      ).trim();

    if (!itemCode) {
      throw new Error(
        "Please select a valid bill package."
      );
    }

    /* Country */
    const country =
      String(
        details?.country ?? "NG"
      )
        .trim()
        .toUpperCase();

    /* Customer */
    let customer =
      String(
        details?.customer ??
          details?.phoneNumber ??
          details?.phone ??
          details?.meterNumber ??
          details?.meter_number ??
          details?.smartCardNumber ??
          details?.smartcardNumber ??
          details?.smartcard_number ??
          details?.accountNumber ??
          details?.account_number ??
          ""
      ).trim();

    if (
      service === "airtime" ||
      service === "data"
    ) {
      customer =
        customer.replace(
          /\s+/g,
          ""
        );
    }

    if (!customer) {
      throw new Error(
        "Customer information is required."
      );
    }

    /* Service-specific validation */
    if (
      service === "airtime" ||
      service === "data"
    ) {
      if (!details?.provider) {
        throw new Error(
          "Please select a network provider."
        );
      }
    }

    if (service === "electricity") {
      if (!details?.provider) {
        throw new Error(
          "Please select an electricity provider."
        );
      }
    }

    if (service === "cable") {
      if (!details?.provider) {
        throw new Error(
          "Please select a cable provider."
        );
      }
    }

    if (service === "internet") {
      if (!details?.provider) {
        throw new Error(
          "Please select an internet provider."
        );
      }
    }

    /* Final details */
    const paymentDetails = {
      ...details,
      service,
      amount,
      country,
      customer,
      biller_code: billerCode,
      item_code: itemCode,
    };

    console.log(
      "Sending bill payment request:",
      {
        action: "pay",
        service,
        amount,
        country,
        biller_code: billerCode,
        item_code: itemCode,
        customer,
      }
    );

    toast({
      title: "Processing payment",
      description:
        `Processing ${selectedService.title.toLowerCase()}...`,
    });

    /* Process payment */
    const {
      data,
      error,
    } =
      await supabase.functions.invoke(
        "flutterwave-bills",
        {
          body: {
            action: "pay",
            service,
            amount,
            biller_code: billerCode,
            item_code: itemCode,
            customer,
            country,
            details: paymentDetails,
          },
        }
      );

    if (error) {
      console.error(
        "flutterwave-bills invocation error:",
        error
      );

      throw new Error(
        error.message ||
          "Unable to process bill payment."
      );
    }

    console.log(
      "flutterwave-bills response:",
      data
    );

    if (
      !data ||
      data.success !== true
    ) {
      throw new Error(
        data?.error ||
          data?.message ||
          "Bill payment failed."
      );
    }

    await refreshWallet();

    setServiceModalOpen(false);
    setSelectedService(null);

    const reference =
      data?.reference ??
      data?.transaction_reference ??
      data?.transaction_id ??
      null;

    const isPending =
      data?.status === "pending";

    toast({
      title: isPending
        ? "Payment Processing"
        : "Payment Successful",
      description:
        data?.message ||
        (isPending
          ? `${selectedService.title} payment is being verified.`
          : `${selectedService.title} payment was completed successfully.`),
    });

    console.log(
      "Bill payment processed:",
      {
        service,
        amount,
        reference,
        transaction_id:
          data?.transaction_id,
        provider_reference:
          data?.provider_reference,
        biller_code: billerCode,
        item_code: itemCode,
        customer,
        status: data?.status,
      }
    );
  };

  /* ================================================================
     BANK TRANSFER
     ================================================================ */

  const handleTransfer = async (
    amount: number,
    details: any
  ) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description:
          "Please log in again.",
        variant: "destructive",
      });

      return;
    }

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      toast({
        title: "Invalid amount",
        description:
          "Please enter a valid transfer amount.",
        variant: "destructive",
      });

      return;
    }

    if (
      wallet &&
      amount >
        Number(wallet.balance)
    ) {
      toast({
        title: "Insufficient Balance",
        description:
          "Please fund your wallet to continue.",
        variant: "destructive",
      });

      return;
    }

    if (
      !details?.accountNumber
    ) {
      toast({
        title: "Invalid recipient",
        description:
          "Recipient bank account is missing.",
        variant: "destructive",
      });

      return;
    }

    if (
      !details?.bankCode
    ) {
      toast({
        title: "Invalid bank",
        description:
          "Recipient bank code is missing.",
        variant: "destructive",
      });

      return;
    }

    if (
      !details?.recipient
    ) {
      toast({
        title: "Invalid recipient",
        description:
          "Verified recipient name is missing.",
        variant: "destructive",
      });

      return;
    }

    try {
      const idempotencyKey =
        `transfer_${user.id}_${Date.now()}_${crypto.randomUUID()}`;

      toast({
        title: "Processing transfer",
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
        console.error(
          "Flutterwave transfer function error:",
          error
        );

        throw new Error(
          error.message ||
            "Unable to process bank transfer."
        );
      }

      console.log(
        "Flutterwave transfer response:",
        data
      );

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

      setTransferModalOpen(false);

      await refreshWallet();

      toast({
        title: "Transfer Processing",
        description:
          data?.message ||
          `₦${amount.toLocaleString()} sent to ${details.recipient}.`,
      });

      console.log(
        "Bank transfer successfully initiated:",
        {
          transaction_id:
            data?.transaction_id,
          flutterwave_transfer_id:
            data?.flutterwave_transfer_id,
          reference:
            data?.reference,
          amount,
          beneficiary:
            details.recipient,
        }
      );
    } catch (error: any) {
      console.error(
        "Bank transfer failed:",
        error
      );

      toast({
        title: "Transfer Failed",
        description:
          error?.message ||
          "Unable to complete the bank transfer.",
        variant: "destructive",
      });
    }
  };

  /* ================================================================
     SPLASH
     ================================================================ */

  if (showSplash) {
    return <DashboardSplashScreen />;
  }

  /* ================================================================
     PAGE ROUTING
     ================================================================ */

  if (
    currentPage === "profile"
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
    currentPage === "history"
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
    currentPage === "rewards"
  ) {
    return (
      <RewardsPage
        onBack={() =>
          setCurrentPage("home")
        }
      />
    );
  }

  if (
    currentPage === "cards"
  ) {
    return (
      <CardsPage
        onBack={() =>
          setCurrentPage("home")
        }
      />
    );
  }

  if (
    currentPage === "me"
  ) {
    return (
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
      />
    );
  }

  /* ================================================================
     WALLET LOADING
     ================================================================ */

  if (loading) {
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

  /* ================================================================
     BOTTOM NAVIGATION
     ================================================================ */

  const renderBottomNav = (
    page: CurrentPage
  ) => (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-2">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-around">

          <Button
            variant={
              page === "home"
                ? "default"
                : "ghost"
            }
            size="sm"
            onClick={() =>
              setCurrentPage("home")
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

          <Button
            variant={
              page === "rewards"
                ? "default"
                : "ghost"
            }
            size="sm"
            onClick={() =>
              setCurrentPage("rewards")
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

          <Button
            variant={
              page === "cards"
                ? "default"
                : "ghost"
            }
            size="sm"
            onClick={() =>
              setCurrentPage("cards")
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

          <Button
            variant={
              page === "me"
                ? "default"
                : "ghost"
            }
            size="sm"
            onClick={() =>
              setCurrentPage("me")
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

  /* ================================================================
     DASHBOARD
     ================================================================ */

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 pb-20">

      {/* ============================================================
          HEADER
      ============================================================ */}

      <header className="bg-gradient-to-r from-purple-600 to-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="flex justify-between items-center h-16">

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

            <div className="flex items-center gap-2">

              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setQrModalOpen(true)
                }
                className="text-white hover:bg-white/20"
              >
                <QrCode className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setCurrentPage("me")
                }
                className="text-white hover:bg-white/20"
              >
                <User className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setCurrentPage("history")
                }
                className="text-white hover:bg-white/20"
              >
                <History className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className="text-white hover:bg-white/20"
              >
                <LogOut className="h-4 w-4" />
              </Button>

            </div>

          </div>
        </div>
      </header>

      {/* ============================================================
          MAIN
      ============================================================ */}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Greeting */}

        <div className="mb-6">

          <h2 className="text-2xl font-bold text-gray-900 mb-1">
            Good Morning! 👋
          </h2>

          <p className="text-gray-600">
            What would you like to do today?
          </p>

        </div>

        {/* ==========================================================
            WALLET
        ========================================================== */}

        <div className="mb-6">

          <Card className="bg-gradient-to-r from-purple-600 to-blue-600 text-white border-0 shadow-lg">

            <CardContent className="p-6">

              <div className="flex justify-between items-start mb-4">

                <div>

                  <p className="text-purple-100 text-sm mb-1">
                    Total Balance
                  </p>

                  <div className="flex items-center gap-2">

                    <span className="text-3xl font-bold">

                      ₦
                      {showBalance
                        ? Number(
                            wallet?.balance ?? 0
                          ).toLocaleString()
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
                    >
                      {showBalance ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>

                  </div>

                </div>

                <div className="text-right">

                  <p className="text-purple-100 text-sm">
                    Wallet ID
                  </p>

                  <p className="font-mono text-sm">
                    {wallet?.id?.slice(
                      0,
                      8
                    ) || "—"}
                  </p>

                </div>

              </div>

              <div className="flex gap-3">

                <Button
                  onClick={() =>
                    setFundModalOpen(true)
                  }
                  className="flex-1 bg-white text-purple-600 hover:bg-gray-100 font-semibold"
                >
                  <Plus className="h-4 w-4 mr-2" />

                  Add Money
                </Button>

                <Button
                  onClick={() =>
                    setTransferModalOpen(true)
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

        {/* ==========================================================
            SERVICES
        ========================================================== */}

        <div className="mb-6">

          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Services
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">

            {services.map(
              (service, index) => (
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

        {/* ==========================================================
            STATS
        ========================================================== */}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <Card className="bg-white shadow-sm">

            <CardContent className="p-4">

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm text-gray-600">
                    This Month
                  </p>

                  <p className="text-2xl font-bold text-gray-900">
                    ₦0
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

          <Card className="bg-white shadow-sm">

            <CardContent className="p-4">

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm text-gray-600">
                    Transactions
                  </p>

                  <p className="text-2xl font-bold text-gray-900">
                    0
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

          <Card className="bg-white shadow-sm">

            <CardContent className="p-4">

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm text-gray-600">
                    Success Rate
                  </p>

                  <p className="text-2xl font-bold text-gray-900">
                    100%
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

      {/* ============================================================
          BOTTOM NAVIGATION
      ============================================================ */}

      {renderBottomNav(
        currentPage
      )}

      {/* ============================================================
          MODALS
      ============================================================ */}

      <FundWalletModal
        isOpen={fundModalOpen}
        onClose={() =>
          setFundModalOpen(false)
        }
        onFunded={
          refreshWallet
        }
      />

      <ServiceModal
        isOpen={
          serviceModalOpen
        }
        onClose={() => {
          setServiceModalOpen(
            false
          );

          setSelectedService(
            null
          );
        }}
        service={
          selectedService
        }
        walletBalance={Number(
          wallet?.balance ?? 0
        )}
        onPurchase={
          handlePurchase
        }
      />

      <TransferModal
        isOpen={
          transferModalOpen
        }
        onClose={() =>
          setTransferModalOpen(
            false
          )
        }
        walletBalance={Number(
          wallet?.balance ?? 0
        )}
        onTransfer={
          handleTransfer
        }
      />

      <QRCodeModal
        isOpen={
          qrModalOpen
        }
        onClose={() =>
          setQrModalOpen(false)
        }
        virtualAccountNumber=""
        userName={
          user?.email || "User"
        }
      />

      <WhatsAppFloat />

    </div>
  );
};

export default Dashboard;
