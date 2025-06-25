
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, ExternalLink, Smartphone, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface FundWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  virtualAccountNumber: string;
}

const FundWalletModal = ({ isOpen, onClose, virtualAccountNumber }: FundWalletModalProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedBank, setSelectedBank] = useState('opay');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [fundingMethod, setFundingMethod] = useState<'bank_transfer' | 'card_payment'>('bank_transfer');

  const bankOptions = [
    {
      id: 'opay',
      name: 'Opay',
      accountName: 'Lawal Aremu',
      accountNumber: '7016799143',
      color: 'bg-green-600',
      logo: '🟢'
    },
    {
      id: 'palmpay',
      name: 'PalmPay',
      accountName: 'Al-Awwaliyah Enterprise',
      accountNumber: '8012345678',
      color: 'bg-blue-600',
      logo: '🌴'
    },
    {
      id: 'wema',
      name: 'Wema Bank',
      accountName: 'Al-Awwaliyah Enterprise',
      accountNumber: '0123456789',
      color: 'bg-purple-600',
      logo: '🏦'
    },
    {
      id: 'moniepoint',
      name: 'Moniepoint',
      accountName: 'Al-Awwaliyah Enterprise',
      accountNumber: '6012345678',
      color: 'bg-orange-600',
      logo: '💰'
    }
  ];

  const selectedBankData = bankOptions.find(bank => bank.id === selectedBank);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  const handleCardPayment = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Error",
        description: "Please login to continue",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const paymentReference = `PAY_${Date.now()}_${user.id.slice(0, 8)}`;
      
      const { data, error } = await supabase.functions.invoke('monnify-payment', {
        body: {
          amount: parseFloat(amount),
          customerName: user.email || 'Customer',
          customerEmail: user.email || 'customer@example.com',
          paymentReference,
          paymentDescription: `Wallet funding - ₦${amount}`,
          redirectUrl: `${window.location.origin}/dashboard`
        }
      });

      if (error) throw error;

      if (data.success && data.checkoutUrl) {
        // Open Monnify checkout in new window
        window.open(data.checkoutUrl, '_blank');
        
        toast({
          title: "Payment Initiated",
          description: "Complete payment in the new window",
        });
        
        onClose();
      } else {
        throw new Error('Failed to initialize payment');
      }

    } catch (error: any) {
      console.error('Payment error:', error);
      toast({
        title: "Payment Error",
        description: error.message || "Failed to initialize payment",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openBankApp = () => {
    const appUrls = {
      opay: "https://opay.ng",
      palmpay: "https://www.palmpay.com",
      wema: "https://wemabank.com",
      moniepoint: "https://moniepoint.com"
    };
    
    window.open(appUrls[selectedBank as keyof typeof appUrls], "_blank");
  };

  const generateVirtualAccount = (bankId: string) => {
    // Generate a random virtual account number based on bank
    const prefixes = {
      opay: '70',
      palmpay: '80',
      wema: '01',
      moniepoint: '60'
    };
    
    const prefix = prefixes[bankId as keyof typeof prefixes];
    const randomNumber = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
    return `${prefix}${randomNumber}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-purple-700">Fund Your Wallet</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          
          {/* Funding Method Selection */}
          <div>
            <h4 className="font-medium text-gray-700 mb-3">Choose funding method:</h4>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={fundingMethod === 'bank_transfer' ? "default" : "outline"}
                onClick={() => setFundingMethod('bank_transfer')}
                className={`p-3 h-auto flex flex-col items-center gap-1 ${
                  fundingMethod === 'bank_transfer' 
                    ? 'bg-purple-600 text-white' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-lg">🏦</span>
                <span className="text-xs font-medium">Bank Transfer</span>
              </Button>
              <Button
                variant={fundingMethod === 'card_payment' ? "default" : "outline"}
                onClick={() => setFundingMethod('card_payment')}
                className={`p-3 h-auto flex flex-col items-center gap-1 ${
                  fundingMethod === 'card_payment' 
                    ? 'bg-purple-600 text-white' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <CreditCard className="h-5 w-5" />
                <span className="text-xs font-medium">Card Payment</span>
              </Button>
            </div>
          </div>

          {fundingMethod === 'card_payment' ? (
            /* Card Payment Section */
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-700 mb-2">Pay with Card</h4>
                <p className="text-sm text-blue-600">
                  Secure payment powered by Monnify. Supports all major cards.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Amount (₦)</Label>
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount to fund"
                  min="100"
                />
              </div>

              <Button
                onClick={handleCardPayment}
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                <CreditCard className="h-4 w-4 mr-2" />
                {loading ? 'Processing...' : `Pay ₦${amount || '0'}`}
              </Button>
            </div>
          ) : (
            /* Bank Transfer Section */
            <>
              {/* Bank Selection */}
              <div>
                <h4 className="font-medium text-gray-700 mb-3">Choose your preferred bank:</h4>
                <div className="grid grid-cols-2 gap-2">
                  {bankOptions.map((bank) => (
                    <Button
                      key={bank.id}
                      variant={selectedBank === bank.id ? "default" : "outline"}
                      onClick={() => setSelectedBank(bank.id)}
                      className={`p-3 h-auto flex flex-col items-center gap-1 ${
                        selectedBank === bank.id 
                          ? `${bank.color} text-white` 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-lg">{bank.logo}</span>
                      <span className="text-xs font-medium">{bank.name}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Selected Bank Details */}
              {selectedBankData && (
                <div className={`${selectedBankData.color} bg-opacity-10 p-4 rounded-lg border`}>
                  <h3 className={`font-semibold ${selectedBankData.color.replace('bg-', 'text-')} mb-3`}>
                    Transfer to {selectedBankData.name}:
                  </h3>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Account Name:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{selectedBankData.accountName}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(selectedBankData.accountName, "Account name")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Account Number:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium font-mono">{selectedBankData.accountNumber}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(selectedBankData.accountNumber, "Account number")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Bank:</span>
                      <span className="font-medium">{selectedBankData.name}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Virtual Account Reference */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-700 mb-2">Your Reference Number:</h4>
                <div className="flex justify-between items-center">
                  <span className="font-mono text-lg">{virtualAccountNumber}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(virtualAccountNumber, "Reference number")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-blue-600 mt-2">
                  Use this as reference when making the transfer
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <Button
                  onClick={openBankApp}
                  className={`w-full ${selectedBankData?.color} hover:opacity-90`}
                >
                  <Smartphone className="h-4 w-4 mr-2" />
                  Open {selectedBankData?.name} App
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => {
                    const newAccount = generateVirtualAccount(selectedBank);
                    copyToClipboard(newAccount, "New virtual account");
                    toast({
                      title: "Virtual Account Generated!",
                      description: `New ${selectedBankData?.name} virtual account: ${newAccount}`,
                    });
                  }}
                  className="w-full"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Generate New Virtual Account
                </Button>
              </div>
            </>
          )}

          <p className="text-xs text-center text-gray-500">
            {fundingMethod === 'card_payment' 
              ? 'Card payments are processed instantly and securely.'
              : 'Transfers are usually processed within 5-10 minutes. Choose any bank that\'s convenient for you.'
            }
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FundWalletModal;
