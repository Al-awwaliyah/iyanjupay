import React, { useEffect, useState } from 'react';
import {
  Button,
} from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { LogOut, User, History, Send, QrCode, Shield, Gift, Banknote, Car, Gamepad2, Plane, Home, Plus, Eye, EyeOff, Smartphone, Wifi, Zap, CreditCard, } from 'lucide-react';

import ServiceCard from './services/ServiceCard';
import FundWalletModal from './modals/FundWalletModal';
import ServiceModal from './modals/ServiceModal';
import TransferModal from './modals/TransferModal';
import QRCodeModal from './modals/QRCodeModal';
import WhatsAppFloat from './WhatsAppFloat';
import ProfilePage from './profile/ProfilePage';
import TransactionHistory from './transactions/TransactionHistory';
import RewardsPage from './rewards/RewardsPage';
import CardsPage from './cards/CardsPage';
import MePage from './me/MePage';

import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type CurrentPage =
  | 'home'
  | 'rewards'
  | 'cards'
  | 'me'
  | 'profile'
  | 'history';

const Dashboard = () => {
  const { user, signOut } = useAuth();

  const {
    wallet,
    loading,
  } = useWallet(user?.id);

  const [fundModalOpen, setFundModalOpen] =
    useState(false);

  const [serviceModalOpen, setServiceModalOpen] =
    useState(false);

  const [transferModalOpen, setTransferModalOpen] =
    useState(false);

  const [qrModalOpen, setQrModalOpen] =
    useState(false);

  const [
    selectedService,
    setSelectedService,
  ] = useState<{
    title: string;
    type: string;
  } | null>(null);

  const [showBalance, setShowBalance] =
    useState(true);

  const [currentPage, setCurrentPage] =
    useState<CurrentPage>('home');

  const { toast } = useToast();

  // ------------------------------------------------------------
  // Wallet bootstrap
  // ------------------------------------------------------------

  useEffect(() => {
    if (!user) return;

    const bootstrapWallet = async () => {
      const { data, error } =
        await supabase.functions.invoke(
          "wallet-bootstrap"
        );

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
    };

    bootstrapWallet();
  }, [user]);

  // ------------------------------------------------------------
  // Services
  // ------------------------------------------------------------

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

  // ------------------------------------------------------------
  // Service click
  // ------------------------------------------------------------

  const handleServiceClick = (
    service: typeof services[0]
  ) => {
    if (service.type === 'transfer') {
      setTransferModalOpen(true);
    } else {
      setSelectedService({
        title: service.title,
        type: service.type,
      });

      setServiceModalOpen(true);
    }
  };

  // ------------------------------------------------------------
  // SERVICE PAYMENTS
  // ------------------------------------------------------------

  const handlePurchase = async (
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

    if (!selectedService) {
      toast({
        title: "Service error",
        description:
          "Please select a service.",
        variant: "destructive",
      });

      return;
    }

    if (!amount || amount <= 0) {
      toast({
        title: "Invalid amount",
        description:
          "Please enter a valid amount.",
        variant: "destructive",
      });

      return;
    }

    if (
      wallet &&
      amount > Number(wallet.balance)
    ) {
      toast({
        title: "Insufficient Balance",
        description:
          "Please fund your wallet to continue.",
        variant: "destructive",
      });

      return;
    }

    try {
      const {
        data,
        error,
      } =
        await supabase.functions.invoke(
          "flutterwave-service-payment",
          {
            body: {
              service:
                selectedService.type,
              amount,
              details,
            },
          }
        );

      if (error) {
        console.error(
          "Service payment error:",
          error
        );

        throw new Error(
          error.message ||
            "Unable to process service payment."
        );
      }

      console.log(
        "Flutterwave service response:",
        data
      );

      if (!data?.success) {
        throw new Error(
          data?.error ||
            "Service payment failed."
        );
      }

      // --------------------------------------------------------
      // IMPORTANT
      //
      // Do NOT update the wallets table from the browser.
      //
      // The Edge Function is responsible for the wallet debit.
      // Direct UPDATE requests from the browser were causing:
      //
      // 403 Forbidden
      // permission denied for table wallets
      //
      // The wallet hook remains responsible for displaying the
      // current wallet state.
      // --------------------------------------------------------

      setServiceModalOpen(false);

      toast({
        title: "Payment Successful",
        description:
          data?.message ||
          `${selectedService.title} payment completed successfully.`,
      });
    } catch (error: any) {
      console.error(
        "Service payment failed:",
        error
      );

      toast({
        title: "Payment Failed",
        description:
          error?.message ||
          "Unable to complete this payment. Your wallet was not charged.",
        variant: "destructive",
      });
    }
  };

  // ------------------------------------------------------------
  // BANK TRANSFER
  // ------------------------------------------------------------

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

    if (!amount || amount <= 0) {
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
      amount > Number(wallet.balance)
    ) {
      toast({
        title: "Insufficient Balance",
        description:
          "Please fund your wallet to continue.",
        variant: "destructive",
      });

      return;
    }

    if (!details?.accountNumber) {
      toast({
        title: "Invalid recipient",
        description:
          "Recipient bank account is missing.",
        variant: "destructive",
      });

      return;
    }

    if (!details?.bankCode) {
      toast({
        title: "Invalid bank",
        description:
          "Recipient bank code is missing.",
        variant: "destructive",
      });

      return;
    }

    if (!details?.recipient) {
      toast({
        title: "Invalid recipient",
        description:
          "Verified recipient name is missing.",
        variant: "destructive",
      });

      return;
    }

    try {
      // --------------------------------------------------------
      // CREATE IDEMPOTENCY KEY
      //
      // Prevents accidental duplicate transfers if the request
      // is retried by the frontend.
      // --------------------------------------------------------

      const idempotencyKey =
        `transfer_${user.id}_${Date.now()}_${crypto.randomUUID()}`;

      toast({
        title: "Processing transfer",
        description:
          "Please wait while we send your money.",
      });

      // --------------------------------------------------------
      // CALL SECURE EDGE FUNCTION
      //
      // Dashboard NEVER calls Flutterwave directly.
      //
      // Dashboard
      //    ↓
      // flutterwave-transfer
      //    ↓
      // wallet_operation(DEBIT)
      //    ↓
      // SmarterASP proxy
      //    ↓
      // Flutterwave
      // --------------------------------------------------------

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

      // --------------------------------------------------------
      // EDGE FUNCTION ERROR
      // --------------------------------------------------------

      if (!data?.success) {
        throw new Error(
          data?.error ||
            "Bank transfer failed."
        );
      }

      // --------------------------------------------------------
      // IMPORTANT:
      //
      // DO NOT call:
      //
      // supabase.from("wallets").update(...)
      //
      // DO NOT call:
      //
      // updateBalance(...)
      //
      // The Edge Function has already performed the wallet
      // debit using wallet_operation().
      //
      // The previous Dashboard code attempted to PATCH the
      // wallets table directly and produced:
      //
      // 403 Forbidden
      // permission denied for table wallets
      //
      // Worse, that error entered this try/catch and made a
      // successfully queued Flutterwave transfer appear to the
      // user as FAILED.
      // --------------------------------------------------------

      // --------------------------------------------------------
      // CLOSE TRANSFER MODAL
      // --------------------------------------------------------

      setTransferModalOpen(false);

      // --------------------------------------------------------
      // SUCCESS MESSAGE
      // --------------------------------------------------------

      toast({
        title: "Transfer Processing",
        description:
          data?.message ||
          `₦${amount.toLocaleString()} sent to ${details.recipient}.`,
      });

      // --------------------------------------------------------
      // LOG SUCCESS INFORMATION
      // --------------------------------------------------------

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

  // ------------------------------------------------------------
  // Page routing
  // ------------------------------------------------------------

  if (currentPage === 'profile') {
    return (
      <ProfilePage
        onBack={() =>
          setCurrentPage('me')
        }
      />
    );
  }

  if (currentPage === 'history') {
    return (
      <TransactionHistory
        onBack={() =>
          setCurrentPage('me')
        }
      />
    );
  }

  if (currentPage === 'rewards') {
    return (
      <RewardsPage
        onBack={() =>
          setCurrentPage('home')
        }
      />
    );
  }

  if (currentPage === 'cards') {
    return (
      <CardsPage
        onBack={() =>
          setCurrentPage('home')
        }
      />
    );
  }

  if (currentPage === 'me') {
    return (
      <MePage
        onBack={() =>
          setCurrentPage('home')
        }
        onProfileClick={() =>
          setCurrentPage('profile')
        }
        onHistoryClick={() =>
          setCurrentPage('history')
        }
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-purple-600 mx-auto"></div>

          <p className="mt-4 text-gray-600">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------
  // Bottom navigation
  // ------------------------------------------------------------

  const renderBottomNav = (
    page: CurrentPage
  ) => (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-around">

          <Button
            variant={
              page === 'home'
                ? 'default'
                : 'ghost'
            }
            size="sm"
            onClick={() =>
              setCurrentPage('home')
            }
            className={`flex flex-col items-center gap-1 px-6 py-3 ${
              page === 'home'
                ? 'bg-purple-600 text-white'
                : 'text-gray-600'
            }`}
          >
            <Home className="h-4 w-4" />

            <span className="text-xs">
              Home
            </span>
          </Button>

          <Button
            variant={
              page === 'rewards'
                ? 'default'
                : 'ghost'
            }
            size="sm"
            onClick={() =>
              setCurrentPage('rewards')
            }
            className={`flex flex-col items-center gap-1 px-6 py-3 ${
              page === 'rewards'
                ? 'bg-purple-600 text-white'
                : 'text-gray-600'
            }`}
          >
            <Gift className="h-4 w-4" />

            <span className="text-xs">
              Reward
            </span>
          </Button>

          <Button
            variant={
              page === 'cards'
                ? 'default'
                : 'ghost'
            }
            size="sm"
            onClick={() =>
              setCurrentPage('cards')
            }
            className={`flex flex-col items-center gap-1 px-6 py-3 ${
              page === 'cards'
                ? 'bg-purple-600 text-white'
                : 'text-gray-600'
            }`}
          >
            <CreditCard className="h-4 w-4" />

            <span className="text-xs">
              Card
            </span>
          </Button>

          <Button
            variant={
              page === 'me'
                ? 'default'
                : 'ghost'
            }
            size="sm"
            onClick={() =>
              setCurrentPage('me')
            }
            className={`flex flex-col items-center gap-1 px-6 py-3 ${
              page === 'me'
                ? 'bg-purple-600 text-white'
                : 'text-gray-600'
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

  // ------------------------------------------------------------
  // DASHBOARD
  // ------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">

      {/* Header */}

      <header className="bg-gradient-to-r from-purple-600 to-blue-600 text-white">

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="flex justify-between items-center h-16">

            <div className="flex items-center">

              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center mr-3">

                <span className="text-purple-600 font-bold text-sm">
                  AL
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
                  setCurrentPage('me')
                }
                className="text-white hover:bg-white/20"
              >
                <User className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setCurrentPage('history')
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

      {/* Main Content */}

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

        {/* Wallet */}

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
                        ? wallet?.balance?.toLocaleString() ||
                          '0'
                        : "****"}

                    </span>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setShowBalance(
                          !showBalance
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
                    {wallet?.id?.slice(0, 8)}
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
                  className="flex-1 border-white text-white hover:bg-white/20"
                >
                  <Send className="h-4 w-4 mr-2" />

                  Send Money
                </Button>

              </div>

            </CardContent>

          </Card>

        </div>

        {/* Services */}

        <div className="mb-6">

          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Services
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">

            {services.map(
              (service, index) => (

                <ServiceCard
                  key={index}
                  title={service.title}
                  description={
                    service.description
                  }
                  icon={service.icon}
                  color={service.color}
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

        {/* Stats */}

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

      {/* Bottom Navigation */}

      {renderBottomNav(
        currentPage
      )}

      {/* Modals */}

      <FundWalletModal
        isOpen={fundModalOpen}
        onClose={() =>
          setFundModalOpen(false)
        }
        virtualAccountNumber=""
      />

      <ServiceModal
        isOpen={serviceModalOpen}
        onClose={() =>
          setServiceModalOpen(false)
        }
        service={selectedService}
        walletBalance={
          wallet?.balance || 0
        }
        onPurchase={
          handlePurchase
        }
      />

      <TransferModal
        isOpen={transferModalOpen}
        onClose={() =>
          setTransferModalOpen(false)
        }
        walletBalance={
          wallet?.balance || 0
        }
        onTransfer={
          handleTransfer
        }
      />

      <QRCodeModal
        isOpen={qrModalOpen}
        onClose={() =>
          setQrModalOpen(false)
        }
        virtualAccountNumber=""
        userName={
          user?.email || 'User'
        }
      />

      {/* WhatsApp Float */}

      <WhatsAppFloat />

    </div>
  );
};

export default Dashboard;
