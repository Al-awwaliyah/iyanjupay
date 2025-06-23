
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();

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
      type: service?.type,
    };

    onPurchase(purchaseAmount, details);
    onClose();
    
    // Reset form
    setAmount('');
    setPhoneNumber('');
    setProvider('');
    setMeterNumber('');
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

          {(service.type === 'airtime' || service.type === 'data') && (
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
                    <SelectItem value="mtn">MTN</SelectItem>
                    <SelectItem value="glo">Glo</SelectItem>
                    <SelectItem value="airtel">Airtel</SelectItem>
                    <SelectItem value="9mobile">9mobile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {service.type === 'electricity' && (
            <div className="space-y-2">
              <Label htmlFor="meterNumber">Meter Number</Label>
              <Input
                id="meterNumber"
                value={meterNumber}
                onChange={(e) => setMeterNumber(e.target.value)}
                placeholder="Enter meter number"
              />
            </div>
          )}

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
