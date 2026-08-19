import React, { useCallback, useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Shield, CheckCircle, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ProfileData {
  full_name: string;
  phone_number: string;
  nickname: string;
  gender: string;
  date_of_birth: string;
  email: string;
  address: string;
  nin: string;
}

interface KycState {
  verified: boolean;
  kyc_level: number;
  kyc_status: string;
  bvn_masked: string | null;
  fee: number;
}

interface ProfilePageProps {
  onBack: () => void;
}

const ProfilePage = ({ onBack }: ProfilePageProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [kyc, setKyc] = useState<KycState | null>(null);
  const [kycLoading, setKycLoading] = useState(true);
  const [bvn, setBvn] = useState('');
  const [verifying, setVerifying] = useState(false);

  const form = useForm<ProfileData>({
    defaultValues: {
      full_name: '',
      phone_number: '+234',
      nickname: '',
      gender: '',
      date_of_birth: '',
      email: user?.email || '',
      address: '',
      nin: '',
    }
  });

  const invokeBvn = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('flutterwave-bvn', {
      body: payload,
    });

    if (error) {
      let message = error.message ?? 'BVN request failed';
      const context = (error as any)?.context;
      if (context && typeof context.json === 'function') {
        try {
          const body = await context.json();
          if (body?.error) message = body.error;
        } catch {
          // keep original message
        }
      }
      throw new Error(message);
    }

    if (data && data.success === false) {
      throw new Error(data.error ?? 'BVN verification failed');
    }

    return data;
  }, []);

  const fetchKyc = useCallback(async () => {
    setKycLoading(true);
    try {
      const data = await invokeBvn({ action: 'status' });
      setKyc({
        verified: Boolean(data?.verified),
        kyc_level: Number(data?.kyc_level ?? 1),
        kyc_status: String(data?.kyc_status ?? 'unverified'),
        bvn_masked: data?.bvn_masked ?? null,
        fee: Number(data?.fee ?? 0),
      });
    } catch (error: any) {
      console.error('Unable to load KYC status:', error);
    } finally {
      setKycLoading(false);
    }
  }, [invokeBvn]);

  const fetchProfile = useCallback(async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
      return;
    }

    if (data) {
      form.reset({
        full_name: data.full_name || '',
        phone_number: data.phone_number || '+234',
        nickname: data.nickname || '',
        gender: data.gender || '',
        date_of_birth: data.date_of_birth || '',
        email: user.email || '',
        address: data.address || '',
        nin: data.nin || '',
      });
    }
  }, [form, user?.id, user?.email]);

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchKyc();
    }
  }, [user, fetchProfile, fetchKyc]);

  const onSubmit = async (data: ProfileData) => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          full_name: data.full_name,
          phone_number: data.phone_number,
          nickname: data.nickname,
          gender: data.gender || null,
          date_of_birth: data.date_of_birth || null,
          email: user.email,
          address: data.address,
          nin: data.nin || null,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated.",
      });
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error",
        description: error.message ?? "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyBvn = async () => {
    const digits = bvn.replace(/\D/g, '');

    if (digits.length !== 11) {
      toast({
        title: 'Invalid BVN',
        description: 'Your BVN must be exactly 11 digits.',
        variant: 'destructive',
      });
      return;
    }

    const fullName = form.getValues('full_name').trim();
    if (!fullName || fullName.split(/\s+/).length < 2) {
      toast({
        title: 'Full name required',
        description: 'Enter your first and last name (as on your BVN) and save your profile first.',
        variant: 'destructive',
      });
      return;
    }

    setVerifying(true);
    try {
      await invokeBvn({ action: 'verify', bvn: digits, full_name: fullName });
      toast({
        title: 'BVN verified',
        description: 'Your account has been upgraded to KYC Tier 2.',
      });
      setBvn('');
      await fetchKyc();
    } catch (error: any) {
      toast({
        title: 'Verification failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setVerifying(false);
    }
  };

  const getKYCLevelInfo = (level: number) => {
    switch (level) {
      case 2:
        return { text: "Verified (₦200,000 limit)", color: "text-blue-100" };
      case 3:
        return { text: "Premium (₦1,000,000 limit)", color: "text-blue-100" };
      default:
        return { text: "Basic (₦50,000 limit)", color: "text-blue-100" };
    }
  };

  const kycInfo = getKYCLevelInfo(kyc?.kyc_level ?? 1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-blue-600"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">Personal Information</h1>
        </div>

        {/* KYC Level Card */}
        <Card className="mb-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-primary-foreground">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold mb-1">Account Level</h3>
                <p className={`text-sm ${kycInfo.color}`}>{kycInfo.text}</p>
                <p className="text-xs mt-1 opacity-90">
                  {kycLoading
                    ? 'Checking verification status...'
                    : kyc?.verified
                      ? `BVN verified ${kyc.bvn_masked ? `(${kyc.bvn_masked})` : ''}`
                      : `BVN status: ${kyc?.kyc_status ?? 'unverified'}`}
                </p>
              </div>
              {kyc?.verified ? (
                <CheckCircle className="h-8 w-8" />
              ) : (
                <Shield className="h-8 w-8" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* BVN Verification */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>BVN Verification (KYC Tier 1)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {kyc?.verified ? (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                Your BVN is verified. You can issue cards and transact at higher limits.
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500">
                  Verify your BVN to unlock transfers at higher limits and virtual cards.
                  {kyc?.fee ? ` A ₦${kyc.fee} verification fee applies.` : ''}
                </p>
                <div className="space-y-2">
                  <Label htmlFor="bvnInput">BVN</Label>
                  <Input
                    id="bvnInput"
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="Enter your 11-digit BVN"
                    value={bvn}
                    onChange={(e) => setBvn(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={handleVerifyBvn}
                  disabled={verifying || kycLoading}
                >
                  {verifying ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify BVN'
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="full_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your full name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="nickname"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nickname</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your nickname" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gender</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select gender" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="date_of_birth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date of Birth</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Contact Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="phone_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mobile Number</FormLabel>
                        <FormControl>
                          <Input placeholder="+234XXXXXXXXXX" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input type="email" disabled {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your address" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="nin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>NIN (National Identification Number)</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your NIN" maxLength={11} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Update Profile'}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
};

export default ProfilePage;
