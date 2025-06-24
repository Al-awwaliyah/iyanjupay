
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FundWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  virtualAccountNumber: string;
}

const FundWalletModal = ({ isOpen, onClose, virtualAccountNumber }: FundWalletModalProps) => {
  const { toast } = useToast();
  const [selectedBank, setSelectedBank] = useState('opay');

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

          <p className="text-xs text-center text-gray-500">
            Transfers are usually processed within 5-10 minutes. Choose any bank that's convenient for you.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FundWalletModal;
