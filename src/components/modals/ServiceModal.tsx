
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import DataPlansModal from '../data/DataPlansModal';

interface ServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: {
    title: string;
    type: string;
  } | null;
  walletBalance: number;
  onPurchase: (amount: number, details: any) => void;
}

const ServiceModal = ({ isOpen, onClose, service, walletBalance, onPurchase }: ServiceModalProps) => {
  const [amount, setAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [provider, setProvider] = useState('');
  const [meterNumber, setMeterNumber] = useState('');
  const [smartCardNumber, setSmartCardNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [showDataPlans, setShowDataPlans] = useState(false);
  const { toast } = useToast();

  const networkProviders = ['MTN', 'Glo', 'Airtel', '9mobile'];
  const cableProviders = ['DSTV', 'GOTV', 'Startimes'];
  const internetProviders = ['Spectranet', 'Smile', 'Swift', 'Coollink'];
  const insuranceProviders = ['AXA Mansard', 'Leadway', 'AIICO', 'Cornerstone'];
  const giftCardTypes = ['iTunes', 'Google Play', 'Amazon', 'Steam', 'Netflix'];
  const bettingPlatforms = ['Bet9ja', 'SportyBet', 'NairaBet', '1xBet', 'BetKing'];

  const handlePurchase = () => {
    const purchaseAmount = parseFloat(amount);
    
    if (!purchaseAmount || purchaseAmount <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (purchaseAmount > walletBalance) {
      toast({
        title: "Insufficient Balance",
        description: "Please fund your wallet to continue",
        variant: "destructive",
      });
      return;
    }

    const details = {
      phoneNumber,
      provider,
      meterNumber,
      smartCardNumber,
      accountNumber,
      customerName,
      type: service?.type,
    };

    onPurchase(purchaseAmount, details);
    onClose();
    
    // Reset form
    setAmount('');
    setPhoneNumber('');
    setProvider('');
    setMeterNumber('');
    setSmartCardNumber('');
    setAccountNumber('');
    setCustomerName('');
  };

  // Handle data service click
  if (service?.type === 'data') {
    return (
      <DataPlansModal
        isOpen={isOpen}
        onClose={onClose}
        walletBalance={walletBalance}
        onPurchase={onPurchase}
      />
    );
  }

  const renderServiceFields = () => {
    switch (service?.type) {
      case 'airtime':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g., 08012345678"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="provider">Network Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {networkProviders.map((net) => (
                    <SelectItem key={net} value={net.toLowerCase()}>{net}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        );

      case 'electricity':
      case 'betting':
      case 'internet':
      case 'insurance':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="provider">Select Provider</Label>
              <Input
                id="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="Search provider"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountNumber">User ID / Account Number</Label>
              <Input
                id="accountNumber"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="Enter user ID or account number"
              />
            </div>
          </>
        );

      case 'cable':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="provider">Cable Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {cableProviders.map((cable) => (
                    <SelectItem key={cable} value={cable.toLowerCase()}>{cable}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="smartCardNumber">Smart Card Number</Label>
              <Input
                id="smartCardNumber"
                value={smartCardNumber}
                onChange={(e) => setSmartCardNumber(e.target.value)}
                placeholder="Enter smart card number"
              />
            </div>
          </>
        );

      case 'giftcards':
        return (
          <div className="space-y-2">
            <Label htmlFor="provider">Gift Card Type</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Select gift card" />
              </SelectTrigger>
              <SelectContent>
                {giftCardTypes.map((card) => (
                  <SelectItem key={card} value={card.toLowerCase()}>{card}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case 'flight':
      case 'hotel':
      case 'transport':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Enter phone number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerName">Full Name</Label>
              <Input
                id="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter full name"
              />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  if (!service) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-green-700">{service.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-green-50 p-3 rounded-lg">
            <p className="text-sm text-green-700">
              Wallet Balance: ₦{walletBalance.toLocaleString()}
            </p>
          </div>

          {renderServiceFields()}

          <div className="space-y-2">
            <Label htmlFor="amount">Amount (₦)</Label>
            <Input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
            />
          </div>

          <Button
            onClick={handlePurchase}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            Purchase {service.title}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ServiceModal;
