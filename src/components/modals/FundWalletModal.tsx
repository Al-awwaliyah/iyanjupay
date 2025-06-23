
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FundWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  virtualAccountNumber: string;
}

const FundWalletModal = ({ isOpen, onClose, virtualAccountNumber }: FundWalletModalProps) => {
  const { toast } = useToast();

  const accountDetails = {
    accountName: "Lawal Aremu",
    accountNumber: "7016799143",
    bankName: "Opay"
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  const openOpay = () => {
    // This would typically open the Opay app or redirect to their payment page
    window.open("https://opay.ng", "_blank");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-green-700">Fund Your Wallet</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="font-semibold text-green-700 mb-3">Transfer to this account:</h3>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Account Name:</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{accountDetails.accountName}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(accountDetails.accountName, "Account name")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Account Number:</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{accountDetails.accountNumber}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(accountDetails.accountNumber, "Account number")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Bank:</span>
                <span className="font-medium">{accountDetails.bankName}</span>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-700 mb-2">Your Virtual Account:</h4>
            <div className="flex justify-between items-center">
              <span className="font-mono text-lg">{virtualAccountNumber}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(virtualAccountNumber, "Virtual account")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-blue-600 mt-2">
              Use this as reference when making the transfer
            </p>
          </div>

          <Button
            onClick={openOpay}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Open Opay App
          </Button>

          <p className="text-xs text-center text-gray-500">
            Transfers are usually processed within 5-10 minutes
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FundWalletModal;
