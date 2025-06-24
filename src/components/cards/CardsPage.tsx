
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ArrowLeft, CreditCard, Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useToast } from '@/hooks/use-toast';

interface CardsPageProps {
  onBack: () => void;
}

interface CardData {
  cardNumber: string;
  expiryDate: string;
  cvv: string;
  cardName: string;
  amount: string;
}

const CardsPage = ({ onBack }: CardsPageProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const form = useForm<CardData>({
    defaultValues: {
      cardNumber: '',
      expiryDate: '',
      cvv: '',
      cardName: '',
      amount: ''
    }
  });

  const onSubmit = async (data: CardData) => {
    setLoading(true);
    try {
      // Simulate card funding process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast({
        title: "Card Added Successfully!",
        description: `₦${Number(data.amount).toLocaleString()} has been added to your wallet`,
      });
      
      form.reset();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process card funding",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = matches && matches[0] || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    if (parts.length) {
      return parts.join(' ');
    } else {
      return v;
    }
  };

  const formatExpiry = (value: string) => {
    const v = value.replace(/\D/g, '');
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4);
    }
    return v;
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
          <h1 className="text-2xl font-bold text-gray-900">Cards</h1>
        </div>

        {/* Add Card Form */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Fund with Bank Card
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <FormField
                      control={form.control}
                      name="cardNumber"
                      rules={{
                        required: "Card number is required",
                        minLength: { value: 19, message: "Invalid card number" }
                      }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Card Number</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="1234 5678 9012 3456"
                              maxLength={19}
                              {...field}
                              onChange={(e) => {
                                const formatted = formatCardNumber(e.target.value);
                                field.onChange(formatted);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="expiryDate"
                    rules={{
                      required: "Expiry date is required",
                      pattern: { value: /^\d{2}\/\d{2}$/, message: "Invalid expiry date" }
                    }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expiry Date</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="MM/YY"
                            maxLength={5}
                            {...field}
                            onChange={(e) => {
                              const formatted = formatExpiry(e.target.value);
                              field.onChange(formatted);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cvv"
                    rules={{
                      required: "CVV is required",
                      minLength: { value: 3, message: "CVV must be 3 digits" }
                    }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CVV</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="123"
                            maxLength={3}
                            type="password"
                            {...field}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '');
                              field.onChange(value);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cardName"
                    rules={{ required: "Cardholder name is required" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cardholder Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="amount"
                    rules={{
                      required: "Amount is required",
                      min: { value: 100, message: "Minimum amount is ₦100" }
                    }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter amount"
                            type="number"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  disabled={loading}
                >
                  {loading ? 'Processing...' : 'Fund Wallet'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Saved Cards */}
        <Card>
          <CardHeader>
            <CardTitle>Saved Cards</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <CreditCard className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">No saved cards</p>
              <p className="text-sm text-gray-400">Add a card to get started</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CardsPage;
