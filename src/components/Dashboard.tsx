
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Smartphone, Wifi, Zap, CreditCard, User, History, Send, QrCode, Shield, Gift, Banknote, Car, Gamepad2, Plane, Home } from 'lucide-react';
import WalletCard from './wallet/WalletCard';
import ServiceCard from './services/ServiceCard';
import FundWalletModal from './modals/FundWalletModal';
import ServiceModal from './modals/ServiceModal';
import TransferModal from './modals/TransferModal';
import QRCodeModal from './modals/QRCodeModal';
import WhatsAppFloat from './WhatsAppFloat';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const { wallet, loading, updateBalance } = useWallet(user?.id);
  const [fundModalOpen, setFundModalOpen] = useState(false);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<{ title: string; type: string } | null>(null);
  const { toast } = useToast();

  const services = [
    {
      title: "Buy Airtime",
      description: "Recharge your phone",
      icon: Smartphone,
      color: "bg-blue-500",
      type: "airtime"
    },
    {
      title: "Buy Data",
      description: "Internet data bundles",
      icon: Wifi,
      color: "bg-purple-500",
      type: "data"
    },
    {
      title: "Electricity",
      description: "Pay electricity bills",
      icon: Zap,
      color: "bg-yellow-500",
      type: "electricity"
    },
    {
      title: "Cable TV",
      description: "DSTV, GOTV, Startimes",
      icon: CreditCard,
      color: "bg-red-500",
      type: "cable"
    },
    {
      title: "Transfer Money",
      description: "Send money to others",
      icon: Send,
      color: "bg-green-500",
      type: "transfer"
    },
    {
      title: "Internet Bills",
      description: "Pay internet bills",
      icon: Wifi,
      color: "bg-indigo-500",
      type: "internet"
    },
    {
      title: "Insurance",
      description: "Pay insurance premiums",
      icon: Shield,
      color: "bg-teal-500",
      type: "insurance"
    },
    {
      title: "Gift Cards",
      description: "Buy digital gift cards",
      icon: Gift,
      color: "bg-pink-500",
      type: "giftcards"
    },
    {
      title: "Betting",
      description: "Fund betting accounts",
      icon: Gamepad2,
      color: "bg-orange-500",
      type: "betting"
    },
    {
      title: "Flight Booking",
      description: "Book domestic flights",
      icon: Plane,
      color: "bg-sky-500",
      type: "flight"
    },
    {
      title: "Hotel Booking",
      description: "Book hotel rooms",
      icon: Home,
      color: "bg-emerald-500",
      type: "hotel"
    },
    {
      title: "Transport",
      description: "Book bus tickets",
      icon: Car,
      color: "bg-gray-500",
      type: "transport"
    }
  ];

  const handleServiceClick = (service: typeof services[0]) => {
    if (service.type === 'transfer') {
      setTransferModalOpen(true);
    } else {
      setSelectedService({ title: service.title, type: service.type });
      setServiceModalOpen(true);
    }
  };

  const handlePurchase = async (amount: number, details: any) => {
    if (!wallet || !user) return;

    try {
      // Create transaction record
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          wallet_id: wallet.id,
          transaction_type: details.type,
          amount: amount,
          description: `${selectedService?.title} - ${details.phoneNumber || details.meterNumber || details.recipient || 'N/A'}`,
          status: 'completed',
          reference_number: `TXN${Date.now()}`
        });

      if (transactionError) throw transactionError;

      // Update wallet balance
      const newBalance = wallet.balance - amount;
      await updateBalance(newBalance);

      toast({
        title: "Purchase Successful!",
        description: `${selectedService?.title} of ₦${amount.toLocaleString()} completed successfully`,
      });
    } catch (error: any) {
      console.error('Error processing purchase:', error);
      toast({
        title: "Error",
        description: "Failed to process purchase",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-green-700">
                Al-Awwaliyah Enterprise
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => setQrModalOpen(true)}>
                <QrCode className="h-4 w-4 mr-2" />
                QR Code
              </Button>
              <Button variant="outline" size="sm">
                <User className="h-4 w-4 mr-2" />
                Profile
              </Button>
              <Button variant="outline" size="sm">
                <History className="h-4 w-4 mr-2" />
                History
              </Button>
              <Button variant="outline" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Message */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome back!
          </h2>
          <p className="text-gray-600">
            Your one-stop platform for all digital payments and services
          </p>
        </div>

        {/* Wallet Card */}
        <div className="mb-8">
          <WalletCard
            balance={wallet?.balance || 0}
            virtualAccountNumber={wallet?.virtual_account_number || 'Loading...'}
            onFundWallet={() => setFundModalOpen(true)}
          />
        </div>

        {/* Services Grid */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Our Services
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {services.map((service, index) => (
              <ServiceCard
                key={index}
                title={service.title}
                description={service.description}
                icon={service.icon}
                color={service.color}
                onClick={() => handleServiceClick(service)}
              />
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₦0</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Transactions</CardTitle>
              <History className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">100%</div>
              <p className="text-xs text-muted-foreground">All transactions</p>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Modals */}
      <FundWalletModal
        isOpen={fundModalOpen}
        onClose={() => setFundModalOpen(false)}
        virtualAccountNumber={wallet?.virtual_account_number || ''}
      />

      <ServiceModal
        isOpen={serviceModalOpen}
        onClose={() => setServiceModalOpen(false)}
        service={selectedService}
        walletBalance={wallet?.balance || 0}
        onPurchase={handlePurchase}
      />

      <TransferModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        walletBalance={wallet?.balance || 0}
        onTransfer={handlePurchase}
      />

      <QRCodeModal
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        virtualAccountNumber={wallet?.virtual_account_number || ''}
        userName={user?.email || 'User'}
      />

      {/* WhatsApp Float */}
      <WhatsAppFloat />
    </div>
  );
};

export default Dashboard;
