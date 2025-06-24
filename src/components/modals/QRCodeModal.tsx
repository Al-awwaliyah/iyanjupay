
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Share2, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  virtualAccountNumber: string;
  userName: string;
}

const QRCodeModal = ({ isOpen, onClose, virtualAccountNumber, userName }: QRCodeModalProps) => {
  const { toast } = useToast();

  const qrData = `Al-Awwaliyah Enterprise
Account: ${virtualAccountNumber}
Name: ${userName}
Bank: Virtual Account`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(qrData);
    toast({
      title: "Copied!",
      description: "Account details copied to clipboard",
    });
  };

  const shareAccount = () => {
    if (navigator.share) {
      navigator.share({
        title: 'My Al-Awwaliyah Account',
        text: qrData,
      });
    } else {
      copyToClipboard();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-green-700 flex items-center justify-center gap-2">
            <QrCode className="h-5 w-5" />
            My Account QR Code
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* QR Code Display Area */}
          <div className="bg-white border-2 border-green-200 rounded-lg p-8 text-center">
            <div className="bg-gray-100 h-48 flex items-center justify-center rounded-lg mb-4">
              <div className="text-center">
                <QrCode className="h-16 w-16 mx-auto text-green-600 mb-2" />
                <p className="text-sm text-gray-600">QR Code for</p>
                <p className="font-semibold text-green-700">{virtualAccountNumber}</p>
              </div>
            </div>
            <div className="text-sm text-gray-600">
              <p className="font-semibold">{userName}</p>
              <p>Al-Awwaliyah Enterprise</p>
              <p className="font-mono text-lg text-green-700 mt-2">{virtualAccountNumber}</p>
            </div>
          </div>

          <div className="bg-green-50 p-4 rounded-lg">
            <h4 className="font-medium text-green-700 mb-2">Account Details:</h4>
            <div className="space-y-1 text-sm">
              <p><span className="font-medium">Name:</span> {userName}</p>
              <p><span className="font-medium">Account:</span> {virtualAccountNumber}</p>
              <p><span className="font-medium">Bank:</span> Al-Awwaliyah Virtual Account</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={copyToClipboard}
              variant="outline"
              className="flex-1"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Details
            </Button>
            <Button
              onClick={shareAccount}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
          </div>

          <p className="text-xs text-center text-gray-500">
            Share this QR code for others to send money to your account
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QRCodeModal;
