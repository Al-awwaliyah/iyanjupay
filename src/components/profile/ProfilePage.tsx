
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Shield, CheckCircle } from 'lucide-react';
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
  bvn: string;
  nin: string;
  kyc_level: number;
}

interface ProfilePageProps {
  onBack: () => void;
}

const ProfilePage = ({ onBack }: ProfilePageProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const form = useForm<ProfileData>({
    defaultValues: {
      full_name: '',
      phone_number: '+234',
      nickname: '',
      gender: '',
      date_of_birth: '',
      email: user?.email || '',
      address: '',
      bvn: '',
      nin: '',
      kyc_level: 1
    }
  });

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        form.reset({
          full_name: data.full_name || '',
          phone_number: data.phone_number || '+234',
          nickname: data.nickname || '',
          gender: data.gender || '',
          date_of_birth: data.date_of_birth || '',
          email: user?.email || '',
          address: data.address || '',
          bvn: data.bvn || '',
          nin: data.nin || '',
          kyc_level: data.kyc_level || 1
        });
      }
    } catch (error: any) {
      console.error('Error fetching profile:', error);
    }
  };

  const onSubmit = async (data: ProfileData) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user?.id,
          ...data,
          updated_at: new Date().toISOString()
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
        description: "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getKYCLevelInfo = (level: number) => {
    switch (level) {
      case 1:
        return { text: "Basic (₦50,000 limit)", color: "text-yellow-600" };
      case 2:
        return { text: "Verified (₦200,000 limit)", color: "text-blue-600" };
      case 3:
        return { text: "Premium (₦1,000,000 limit)", color: "text-green-600" };
      default:
        return { text: "Basic", color: "text-gray-600" };
    }
  };

  const kycInfo = getKYCLevelInfo(form.watch('kyc_level'));

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
          <h1 className="text-2xl font-bold text-gray-900">Personal Information</h1>
        </div>

        {/* KYC Level Card */}
        <Card className="mb-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold mb-1">Account Level</h3>
                <p className={`text-sm ${kycInfo.color}`}>{kycInfo.text}</p>
              </div>
              <Shield className="h-8 w-8" />
            </div>
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                </CardContent>
              </Card>

              {/* Verification Information */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Verification Information</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="bvn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>BVN (Bank Verification Number)</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your BVN" maxLength={11} {...field} />
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
              className="w-full bg-purple-600 hover:bg-purple-700"
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
