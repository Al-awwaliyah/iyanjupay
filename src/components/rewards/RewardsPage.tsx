
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Gift, Users, Copy, Share } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface RewardsPageProps {
  onBack: () => void;
}

const RewardsPage = ({ onBack }: RewardsPageProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [referralCode, setReferralCode] = useState('');
  const [referralStats, setReferralStats] = useState({
    totalReferrals: 0,
    totalEarned: 0,
    pendingRewards: 0
  });

  useEffect(() => {
    if (user) {
      generateReferralCode();
      // In a real app, you'd fetch referral stats from the database
    }
  }, [user]);

  const generateReferralCode = () => {
    // Generate a unique referral code based on user ID
    const code = `AL${user?.id?.slice(0, 8).toUpperCase()}`;
    setReferralCode(code);
  };

  const copyReferralCode = () => {
    navigator.clipboard.writeText(referralCode);
    toast({
      title: "Copied!",
      description: "Referral code copied to clipboard",
    });
  };

  const shareReferral = () => {
    const referralLink = `https://iyanjupay.app/signup?ref=${referralCode}`;
    const shareText = `Join IyanjuPay with my referral code ${referralCode} and get ₦500 bonus! ${referralLink}`;
    
    if (navigator.share) {
      navigator.share({
        title: 'Join IyanjuPay',
        text: shareText,
      });
    } else {
      navigator.clipboard.writeText(shareText);
      toast({
        title: "Copied!",
        description: "Referral link copied to clipboard",
      });
    }
  };

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
          <h1 className="text-2xl font-bold text-gray-900">Rewards</h1>
        </div>

        {/* Rewards Overview */}
        <Card className="mb-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold mb-2">Total Rewards Earned</h3>
                <p className="text-3xl font-bold">₦{referralStats.totalEarned.toLocaleString()}</p>
              </div>
              <Gift className="h-12 w-12" />
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <p className="text-purple-100 text-sm">Total Referrals</p>
                <p className="text-xl font-bold">{referralStats.totalReferrals}</p>
              </div>
              <div>
                <p className="text-purple-100 text-sm">Pending Rewards</p>
                <p className="text-xl font-bold">₦{referralStats.pendingRewards.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Invite Friends Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Invite Friends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">How it works:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Share your referral code with friends</li>
                  <li>• They sign up and make their first transaction</li>
                  <li>• You both get ₦500 bonus</li>
                  <li>• Earn up to ₦50,000 monthly from referrals</li>
                </ul>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Your Referral Code</label>
                <div className="flex gap-2">
                  <Input
                    value={referralCode}
                    readOnly
                    className="font-mono text-lg font-bold text-center"
                  />
                  <Button onClick={copyReferralCode} variant="outline">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Button onClick={shareReferral} className="w-full bg-purple-600 hover:bg-purple-700">
                <Share className="h-4 w-4 mr-2" />
                Share Referral Link
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Referral History */}
        <Card>
          <CardHeader>
            <CardTitle>Referral History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">No referrals yet</p>
              <p className="text-sm text-gray-400">Start inviting friends to earn rewards!</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RewardsPage;
