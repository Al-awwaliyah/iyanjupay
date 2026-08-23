import React from "react";
import {
  ArrowLeft,
  CreditCard,
  ArrowUpRight,
  Wallet,
  ShieldCheck,
  Info,
  LockKeyhole,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface TransactionLimitPageProps {
  onBack: () => void;
}

type LimitItemProps = {
  title: string;
  description: string;
  icon: React.ElementType;
};

const LimitItem = ({
  title,
  description,
  icon: Icon,
}: LimitItemProps) => {
  return (
    <Card className="bg-white">
      <CardContent className="p-5">
        <div className="flex items-center gap-4">

          <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
            <Icon className="h-6 w-6 text-purple-600" />
          </div>

          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">
              {title}
            </h3>

            <p className="text-sm text-gray-600 mt-1">
              {description}
            </p>
          </div>

          <span className="text-sm font-medium text-gray-400">
            Not configured
          </span>

        </div>
      </CardContent>
    </Card>
  );
};

const TransactionLimitPage = ({
  onBack,
}: TransactionLimitPageProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 pb-8">
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-purple-600"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <h1 className="text-2xl font-bold text-gray-900">
            Transaction Limit
          </h1>
        </div>

        {/* Current Level */}
        <Card className="mb-6 overflow-hidden border-0 shadow-lg">
          <CardContent className="p-0">

            <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6">
              <div className="flex items-center gap-4">

                <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
                  <ShieldCheck className="h-7 w-7" />
                </div>

                <div>
                  <p className="text-purple-100 text-sm">
                    Current KYC Level
                  </p>

                  <h2 className="text-xl font-bold">
                    Account limits
                  </h2>

                  <p className="text-purple-100 text-sm mt-1">
                    Your applicable limits will be displayed here.
                  </p>
                </div>

              </div>
            </div>

            <div className="p-5 bg-white">

              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />

                <p className="text-sm text-gray-600 leading-6">
                  Transaction limits should be determined by your account
                  verification level and the limits configured by IyanjuPay.
                  We will connect this section to your backend limits system
                  so the values shown here always reflect your actual account.
                </p>
              </div>

            </div>

          </CardContent>
        </Card>

        {/* Limits */}
        <div className="space-y-3">

          <LimitItem
            title="Single Transfer Limit"
            description="Maximum amount allowed for one transfer."
            icon={ArrowUpRight}
          />

          <LimitItem
            title="Daily Transfer Limit"
            description="Maximum amount that can be transferred in a day."
            icon={ArrowUpRight}
          />

          <LimitItem
            title="Daily Wallet Funding Limit"
            description="Maximum amount that can be added to your wallet per day."
            icon={Wallet}
          />

          <LimitItem
            title="Single Wallet Funding Limit"
            description="Maximum amount allowed for one wallet funding transaction."
            icon={Wallet}
          />

        </div>

        {/* Remaining Limit */}
        <Card className="mt-6">
          <CardContent className="p-5">

            <div className="flex items-start gap-3">
              <CreditCard className="h-5 w-5 text-purple-600 mt-1" />

              <div>
                <h3 className="font-semibold text-gray-900">
                  Available / Remaining Limits
                </h3>

                <p className="text-sm text-gray-600 mt-1">
                  Your used and remaining daily limits will appear here once
                  the backend transaction-limit system is connected.
                </p>
              </div>

            </div>

          </CardContent>
        </Card>

        {/* Increase Limits */}
        <Card className="mt-4 border-purple-100">
          <CardContent className="p-5">

            <div className="flex items-start gap-3">
              <LockKeyhole className="h-5 w-5 text-purple-600 mt-1" />

              <div>
                <h3 className="font-semibold text-gray-900">
                  Need higher limits?
                </h3>

                <p className="text-sm text-gray-600 mt-1 leading-6">
                  Higher transaction limits may require additional identity
                  verification or other account requirements. Contact
                  Customer Service if you need assistance with your limits.
                </p>
              </div>

            </div>

          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default TransactionLimitPage;
