
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Plus } from "lucide-react";
import { useState } from 'react';

interface WalletCardProps {
  balance: number;
  virtualAccountNumber: string;
  onFundWallet: () => void;
}

const WalletCard = ({ balance, virtualAccountNumber, onFundWallet }: WalletCardProps) => {
  const [showBalance, setShowBalance] = useState(true);

  return (
    <Card className="bg-gradient-to-r from-green-600 to-green-700 text-white">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Wallet Balance</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowBalance(!showBalance)}
          className="text-white hover:bg-green-500"
        >
          {showBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold mb-2">
          ₦{showBalance ? balance.toLocaleString() : "****"}
        </div>
        <p className="text-green-100 text-sm mb-4">
          Virtual Account: {virtualAccountNumber}
        </p>
        <Button
          onClick={onFundWallet}
          className="w-full bg-white text-green-600 hover:bg-gray-100"
        >
          <Plus className="h-4 w-4 mr-2" />
          Fund Wallet
        </Button>
      </CardContent>
    </Card>
  );
};

export default WalletCard;
