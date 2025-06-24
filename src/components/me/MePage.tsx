
import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, User, History, MessageCircle, HelpCircle, CreditCard, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface MePageProps {
  onBack: () => void;
  onProfileClick: () => void;
  onHistoryClick: () => void;
}

const MePage = ({ onBack, onProfileClick, onHistoryClick }: MePageProps) => {
  const { user, signOut } = useAuth();

  const menuItems = [
    {
      icon: User,
      title: "Profile",
      description: "Manage your personal information",
      onClick: onProfileClick
    },
    {
      icon: History,
      title: "Transaction History",
      description: "View all your transactions",
      onClick: onHistoryClick
    },
    {
      icon: MessageCircle,
      title: "Customer Service",
      description: "Get help and support",
      onClick: () => {}
    },
    {
      icon: HelpCircle,
      title: "Support",
      description: "FAQs and help center",
      onClick: () => {}
    },
    {
      icon: CreditCard,
      title: "Transaction Limit",
      description: "View and manage limits",
      onClick: () => {}
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
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
          <h1 className="text-2xl font-bold text-gray-900">Me</h1>
        </div>

        {/* User Info Card */}
        <Card className="mb-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <User className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold">{user?.email}</h3>
                <p className="text-purple-100">Member since {new Date(user?.created_at || '').getFullYear()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Menu Items */}
        <div className="space-y-3">
          {menuItems.map((item, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow cursor-pointer" onClick={item.onClick}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                    <item.icon className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{item.title}</h4>
                    <p className="text-sm text-gray-600">{item.description}</p>
                  </div>
                  <div className="text-gray-400">
                    →
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Logout Button */}
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
