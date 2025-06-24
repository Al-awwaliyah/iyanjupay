
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Send } from "lucide-react";

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletBalance: number;
  onTransfer: (amount: number, details: any) => void;
}

const TransferModal = ({ isOpen, onClose, walletBalance, onTransfer }: TransferModalProps) => {
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [bank, setBank] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [narration, setNarration] = useState('');
  const { toast } = useToast();

  const banks = [
    'Access Bank', 'GTBank', 'First Bank', 'UBA', 'Zenith Bank',
    'Fidelity Bank', 'Union Bank', 'Sterling Bank', 'Stanbic IBTC',
    'Wema Bank', 'Polaris Bank', 'Keystone Bank', 'FCMB', 'Opay',
    'Kuda Bank', 'Moniepoint', 'PalmPay', 'VBank'
  ];

  const handleTransfer = () => {
    const transferAmount = parseFloat(amount);
    
    if (!transferAmount || transferAmount <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (transferAmount > walletBalance) {
      toast({
        title: "Insufficient Balance",
        description: "Please fund your wallet to continue",
        variant: "destructive",
      });
      return;
    }

    if (!recipient || !bank || !accountNumber) {
      toast({
        title: "Error",
        description: "Please fill all required fields",
        variant: "destructive",
      });
      return;
    }

    const details = {
      recipient,
      bank,
      accountNumber,
      narration,
      type: 'transfer',
    };

    onTransfer(transferAmount, details);
    onClose();
    
    // Reset form
    setAmount('');
    setRecipient('');
    setBank('');
    setAccountNumber('');
    setNarration('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-green-700 flex items-center justify-center gap-2">
            <Send className="h-5 w-5" />
            Transfer Money
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-green-50 p-3 rounded-lg">
            <p className="text-sm text-green-700">
              Wallet Balance: ₦{walletBalance.toLocaleString()}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipient">Recipient Name</Label>
            <Input
              id="recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Enter recipient's full name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bank">Bank</Label>
            <Select value={bank} onValueChange={setBank}>
              <SelectTrigger>
                <SelectValue placeholder="Select bank" />
              </SelectTrigger>
              <SelectContent>
                {banks.map((bankName) => (
                  <SelectItem key={bankName} value={bankName}>
                    {bankName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="accountNumber">Account Number</Label>
            <Input
              id="accountNumber"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Enter 10-digit account number"
              maxLength={10}
            />
          </div>

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

          <div className="space-y-2">
            <Label htmlFor="narration">Narration (Optional)</Label>
            <Input
              id="narration"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="Enter transaction description"
            />
          </div>

          <Button
            onClick={handleTransfer}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            <Send className="h-4 w-4 mr-2" />
            Send Money
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransferModal;
