
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, User, History, Send, QrCode, Shield, Gift, Banknote, Car, Gamepad2, Plane, Home, Plus, Eye, EyeOff, Smartphone, Wifi, Zap, CreditCard } from 'lucide-react';
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
  const [showBalance, setShowBalance] = useState(true);
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
      {/* Header - Opay Style */}
      <header className="bg-gradient-to-r from-purple-600 to-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold">
                Al-Awwaliyah Enterprise
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setQrModalOpen(true)} className="text-white hover:bg-white/20">
                <QrCode className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/20">
                <User className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/20">
                <History className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={signOut} className="text-white hover:bg-white/20">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Greeting Section */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">
            Good Morning! 👋
          </h2>
          <p className="text-gray-600">
            What would you like to do today?
          </p>
        </div>

        {/* Wallet Card - Opay Style */}
        <div className="mb-6">
          <Card className="bg-gradient-to-r from-purple-600 to-blue-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-purple-100 text-sm mb-1">Total Balance</p>
                  <div className="flex items-center gap-2">
                    <span className="text-3xl font-bold">
                      ₦{showBalance ? wallet?.balance?.toLocaleString() || '0' : "****"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowBalance(!showBalance)}
                      className="text-white hover:bg-white/20 p-1"
                    >
                      {showBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-purple-100 text-sm">Virtual Account</p>
                  <p className="font-mono text-sm">{wallet?.virtual_account_number}</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Button
                  onClick={() => setFundModalOpen(true)}
                  className="flex-1 bg-white text-purple-600 hover:bg-gray-100 font-semibold"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Money
                </Button>
                <Button
                  onClick={() => setTransferModalOpen(true)}
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

        {/* Quick Actions */}
        <div className="mb-6">
          <div className="grid grid-cols-4 gap-4">
            <Card className="bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setFundModalOpen(true)}>
              <CardContent className="p-4 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Plus className="h-6 w-6 text-green-600" />
                </div>
                <p className="text-sm font-medium">Add Money</p>
              </CardContent>
            </Card>
            
            <Card className="bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setTransferModalOpen(true)}>
              <CardContent className="p-4 text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Send className="h-6 w-6 text-blue-600" />
                </div>
                <p className="text-sm font-medium">Transfer</p>
              </CardContent>
            </Card>
            
            <Card className="bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setQrModalOpen(true)}>
              <CardContent className="p-4 text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <QrCode className="h-6 w-6 text-purple-600" />
                </div>
                <p className="text-sm font-medium">QR Code</p>
              </CardContent>
            </Card>
            
            <Card className="bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <History className="h-6 w-6 text-orange-600" />
                </div>
                <p className="text-sm font-medium">History</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Services Grid */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Services
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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-white shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">This Month</p>
                  <p className="text-2xl font-bold text-gray-900">₦0</p>
                  <p className="text-xs text-gray-500">Total Spent</p>
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
                  <p className="text-sm text-gray-600">Transactions</p>
                  <p className="text-2xl font-bold text-gray-900">0</p>
                  <p className="text-xs text-gray-500">This Month</p>
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
                  <p className="text-sm text-gray-600">Success Rate</p>
                  <p className="text-2xl font-bold text-gray-900">100%</p>
                  <p className="text-xs text-gray-500">All Time</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <Shield className="h-6 w-6 text-green-600" />
                </div>
              </div>
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
