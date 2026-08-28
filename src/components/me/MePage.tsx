import React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import {  ArrowLeft, User,  History, MessageCircle, HelpCircle, CreditCard, LockKeyhole, LogOut, FileWarning, } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface MePageProps {
  onBack: () => void;
  onProfileClick: () => void;
  onHistoryClick: () => void;
  onCustomerServiceClick: () => void;
  onSupportClick: () => void;
  onTransactionLimitClick: () => void;
  onPaymentPinClick: () => void;
  onDisputesClick: () => void;
}

const MePage = ({
  onBack,
  onProfileClick,
  onHistoryClick,
  onCustomerServiceClick,
  onSupportClick,
  onTransactionLimitClick,
  onPaymentPinClick,
  onDisputesClick,
}: MePageProps) => {
  const { user, signOut } = useAuth();

  const menuItems = [
    {
      icon: User,
      title: "Profile",
      description:
        "Manage your personal information",
      onClick: onProfileClick,
    },
    {
      icon: History,
      title: "Transaction History",
      description:
        "View all your transactions",
      onClick: onHistoryClick,
    },
    {
      icon: FileWarning,
      title: "Disputes",
      description:
        "Report and track transaction disputes",
      onClick: onDisputesClick,
    },
    {
      icon: MessageCircle,
      title: "Customer Service",
      description:
        "Get help and support",
      onClick: onCustomerServiceClick,
    },
    {
      icon: HelpCircle,
      title: "Support",
      description:
        "FAQs and help center",
      onClick: onSupportClick,
    },
    {
      icon: CreditCard,
      title: "Transaction Limit",
      description:
        "View and manage limits",
      onClick: onTransactionLimitClick,
    },
    {
      icon: LockKeyhole,
      title: "Payment PIN",
      description:
        "Change or reset your payment PIN",
      onClick: onPaymentPinClick,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* =====================================================
            HEADER
            ===================================================== */}

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
            Me
          </h1>

        </div>

        {/* =====================================================
            USER INFO CARD
            ===================================================== */}

        <Card className="mb-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white border-0 shadow-lg">
          <CardContent className="p-6">

            <div className="flex items-center gap-4">

              {/* Avatar */}

              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                <User className="h-8 w-8" />
              </div>

              {/* User information */}

              <div className="min-w-0">

                <h3 className="text-xl font-bold truncate">
                  {user?.email || "User"}
                </h3>

                <p className="text-purple-100">
                  Member since{" "}
                  {user?.created_at
                    ? new Date(
                        user.created_at
                      ).getFullYear()
                    : "—"}
                </p>

              </div>

            </div>

          </CardContent>
        </Card>

        {/* =====================================================
            MENU ITEMS
            ===================================================== */}

        <div className="space-y-3">

          {menuItems.map(
            (item, index) => {
              const Icon = item.icon;

              return (
                <Card
                  key={index}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={item.onClick}
                >
                  <CardContent className="p-4">

                    <div className="flex items-center gap-4">

                      {/* Icon */}

                      <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center shrink-0">
                        <Icon className="h-6 w-6 text-purple-600" />
                      </div>

                      {/* Text */}

                      <div className="flex-1 min-w-0">

                        <h4 className="font-semibold text-gray-900">
                          {item.title}
                        </h4>

                        <p className="text-sm text-gray-600">
                          {item.description}
                        </p>

                      </div>

                      {/* Arrow */}

                      <div className="text-gray-400 text-xl">
                        →
                      </div>

                    </div>

                  </CardContent>
                </Card>
              );
            }
          )}

        </div>

        {/* =====================================================
            LOGOUT
            ===================================================== */}

        <Card className="mt-6 border-red-200">
          <CardContent className="p-4">

            <Button
              variant="ghost"
              className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={signOut}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>

          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default MePage;
