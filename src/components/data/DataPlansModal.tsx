
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface DataPlan {
  id: string;
  name: string;
  price: number;
  data: string;
  validity: string;
  category: string;
}

interface DataPlansModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletBalance: number;
  onPurchase: (amount: number, details: any) => void;
}

const DataPlansModal = ({ isOpen, onClose, walletBalance, onPurchase }: DataPlansModalProps) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [provider, setProvider] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<DataPlan | null>(null);
  const [showPlans, setShowPlans] = useState(false);
  const { toast } = useToast();

  const dataPlans: Record<string, DataPlan[]> = {
    mtn: [
      // Daily Plans
      { id: 'mtn_d1', name: '75 MB', price: 75, data: '75 MB', validity: '1 day', category: 'Daily' },
      { id: 'mtn_d2', name: '110 MB', price: 100, data: '110 MB', validity: '1 day', category: 'Daily' },
      { id: 'mtn_d3', name: '230 MB', price: 200, data: '230 MB', validity: '1 day', category: 'Daily' },
      { id: 'mtn_d4', name: '500 MB', price: 350, data: '500 MB', validity: '1 day', category: 'Daily' },
      { id: 'mtn_d5', name: '1 GB', price: 500, data: '1 GB', validity: '1 day', category: 'Daily' },
      
      // Weekly Plans
      { id: 'mtn_w1', name: '1 GB (Social)', price: 300, data: '1 GB', validity: '7 days', category: 'Weekly' },
      { id: 'mtn_w2', name: '500 MB', price: 500, data: '500 MB', validity: '7 days', category: 'Weekly' },
      { id: 'mtn_w3', name: '1.2 GB + 1hr Streaming', price: 750, data: '1.2 GB', validity: '7 days', category: 'Weekly' },
      { id: 'mtn_w4', name: '1 GB', price: 800, data: '1 GB', validity: '7 days', category: 'Weekly' },
      { id: 'mtn_w5', name: '1.5 GB', price: 1000, data: '1.5 GB', validity: '7 days', category: 'Weekly' },
      { id: 'mtn_w6', name: '3.5 GB', price: 1500, data: '3.5 GB', validity: '7 days', category: 'Weekly' },
      { id: 'mtn_w7', name: '6 GB', price: 2500, data: '6 GB', validity: '7 days', category: 'Weekly' },
      { id: 'mtn_w8', name: '11 GB', price: 3500, data: '11 GB', validity: '7 days', category: 'Weekly' },
      { id: 'mtn_w9', name: '35 GB', price: 7000, data: '35 GB', validity: '14 days', category: 'Weekly' },
      { id: 'mtn_w10', name: '70 GB', price: 14000, data: '70 GB', validity: '30 days', category: 'Weekly' },
      { id: 'mtn_w11', name: '110 GB', price: 16000, data: '110 GB', validity: '30 days', category: 'Weekly' },
      
      // Monthly Plans
      { id: 'mtn_m1', name: '2 GB', price: 1500, data: '2 GB', validity: '30 days', category: 'Monthly' },
      { id: 'mtn_m2', name: '2.7 GB', price: 2000, data: '2.7 GB', validity: '30 days', category: 'Monthly' },
      { id: 'mtn_m3', name: '3.5 GB', price: 2500, data: '3.5 GB', validity: '30 days', category: 'Monthly' },
      { id: 'mtn_m4', name: '7 GB', price: 3500, data: '7 GB', validity: '30 days', category: 'Monthly' },
      { id: 'mtn_m5', name: '10 GB', price: 4500, data: '10 GB', validity: '30 days', category: 'Monthly' },
      { id: 'mtn_m6', name: '12.5 GB', price: 5500, data: '12.5 GB', validity: '30 days', category: 'Monthly' },
      { id: 'mtn_m7', name: '16.6 GB', price: 6500, data: '16.6 GB', validity: '30 days', category: 'Monthly' },
      { id: 'mtn_m8', name: '20 GB', price: 7500, data: '20 GB', validity: '30 days', category: 'Monthly' },
      { id: 'mtn_m9', name: '25 GB', price: 9000, data: '25 GB', validity: '30 days', category: 'Monthly' },
      { id: 'mtn_m10', name: '36 GB', price: 11000, data: '36 GB', validity: '30 days', category: 'Monthly' },
      { id: 'mtn_m11', name: '65 GB', price: 16000, data: '65 GB', validity: '30 days', category: 'Monthly' },
      { id: 'mtn_m12', name: '75 GB', price: 18000, data: '75 GB', validity: '30 days', category: 'Monthly' },
      { id: 'mtn_m13', name: '165 GB', price: 35000, data: '165 GB', validity: '30 days', category: 'Monthly' },
      { id: 'mtn_m14', name: '250 GB', price: 55000, data: '250 GB', validity: '30 days', category: 'Monthly' },
      
      // Long-Term Plans
      { id: 'mtn_l1', name: '90 GB', price: 25000, data: '90 GB', validity: '90 days', category: 'Long-Term' },
      { id: 'mtn_l2', name: '150 GB', price: 40000, data: '150 GB', validity: '90 days', category: 'Long-Term' },
      { id: 'mtn_l3', name: '200 GB', price: 50000, data: '200 GB', validity: '90 days', category: 'Long-Term' },
      { id: 'mtn_l4', name: '480 GB', price: 90000, data: '480 GB', validity: '180 days', category: 'Long-Term' },
      { id: 'mtn_l5', name: '800 GB', price: 125000, data: '800 GB', validity: '365 days', category: 'Long-Term' },
    ],
    
    airtel: [
      { id: 'airtel_1', name: '500 MB', price: 495, data: '500 MB', validity: '30 days', category: 'Monthly' },
      { id: 'airtel_2', name: '1 GB', price: 980, data: '1 GB', validity: '30 days', category: 'Monthly' },
      { id: 'airtel_3', name: '1.5 GB', price: 990, data: '1.5 GB', validity: '30 days', category: 'Monthly' },
      { id: 'airtel_4', name: '2 GB', price: 1485, data: '2 GB', validity: '30 days', category: 'Monthly' },
      { id: 'airtel_5', name: '4 GB', price: 2475, data: '4 GB', validity: '30 days', category: 'Monthly' },
      { id: 'airtel_6', name: '5 GB', price: 4900, data: '5 GB', validity: '30 days', category: 'Monthly' },
      { id: 'airtel_7', name: '7 GB Awoof', price: 2500, data: '7 GB', validity: '30 days', category: 'Monthly' },
      { id: 'airtel_8', name: '10 GB', price: 3960, data: '10 GB', validity: '30 days', category: 'Monthly' },
      { id: 'airtel_9', name: '10 GB Awoof', price: 3650, data: '10 GB', validity: '30 days', category: 'Monthly' },
      { id: 'airtel_10', name: '18 GB', price: 5940, data: '18 GB', validity: '30 days', category: 'Monthly' },
      { id: 'airtel_11', name: '23 GB', price: 7920, data: '23 GB', validity: '30 days', category: 'Monthly' },
      { id: 'airtel_12', name: '35 GB', price: 9900, data: '35 GB', validity: '30 days', category: 'Monthly' },
      { id: 'airtel_13', name: '1 GB Social', price: 297, data: '1 GB', validity: '30 days', category: 'Special' },
      { id: 'airtel_14', name: '200 MB', price: 198, data: '200 MB', validity: '2 days', category: 'Special' },
    ],
    
    glo: [
      { id: 'glo_1', name: '500 MB', price: 198, data: '500 MB', validity: '30 days', category: 'Monthly' },
      { id: 'glo_2', name: '1.5 GB', price: 297, data: '1.5 GB', validity: '30 days', category: 'Monthly' },
      { id: 'glo_3', name: '2 GB', price: 900, data: '2 GB', validity: '30 days', category: 'Monthly' },
      { id: 'glo_4', name: '2.6 GB', price: 960, data: '2.6 GB', validity: '30 days', category: 'Monthly' },
      { id: 'glo_5', name: '3 GB', price: 1350, data: '3 GB', validity: '30 days', category: 'Monthly' },
      { id: 'glo_6', name: '5 GB', price: 2250, data: '5 GB', validity: '30 days', category: 'Monthly' },
      { id: 'glo_7', name: '6.15 GB', price: 1920, data: '6.15 GB', validity: '30 days', category: 'Monthly' },
      { id: 'glo_8', name: '10 GB', price: 2880, data: '10 GB', validity: '30 days', category: 'Monthly' },
      { id: 'glo_9', name: '16 GB', price: 4800, data: '16 GB', validity: '30 days', category: 'Monthly' },
      { id: 'glo_10', name: '28 GB', price: 7680, data: '28 GB', validity: '30 days', category: 'Monthly' },
      { id: 'glo_11', name: '38 GB (Night)', price: 9600, data: '38 GB', validity: '30 days', category: 'Monthly' },
      { id: 'glo_12', name: '2.5 GB Awoof', price: 490, data: '2.5 GB', validity: '2 days', category: 'Special' },
    ],
    
    '9mobile': [
      { id: '9mobile_1', name: '1 GB', price: 390, data: '1 GB', validity: '30 days', category: 'Monthly' },
      { id: '9mobile_2', name: '2 GB', price: 780, data: '2 GB', validity: '30 days', category: 'Monthly' },
      { id: '9mobile_3', name: '3 GB', price: 1170, data: '3 GB', validity: '30 days', category: 'Monthly' },
      { id: '9mobile_4', name: '5 GB', price: 1950, data: '5 GB', validity: '30 days', category: 'Monthly' },
      { id: '9mobile_5', name: '11 GB', price: 4200, data: '11 GB', validity: '30 days', category: 'Monthly' },
      { id: '9mobile_6', name: '20 GB Always-On', price: 4000, data: '20 GB', validity: '30 days', category: 'Always-On' },
      { id: '9mobile_7', name: '30 GB Always-On', price: 6000, data: '30 GB', validity: '30 days', category: 'Always-On' },
      { id: '9mobile_8', name: '50 GB Always-On', price: 10000, data: '50 GB', validity: '30 days', category: 'Always-On' },
      { id: '9mobile_9', name: '1 GB Night', price: 200, data: '1 GB', validity: '1 night', category: 'Night' },
      { id: '9mobile_10', name: '250 MB Night', price: 50, data: '250 MB', validity: '1 night', category: 'Night' },
      { id: '9mobile_11', name: '2 GB Weekend', price: 1000, data: '2 GB', validity: 'Weekend', category: 'Weekend' },
      { id: '9mobile_12', name: '5 GB Weekend', price: 2000, data: '5 GB', validity: 'Weekend', category: 'Weekend' },
    ]
  };

  const handleProviderChange = (value: string) => {
    setProvider(value);
    setSelectedPlan(null);
    setShowPlans(true);
  };

  const handlePlanSelect = (plan: DataPlan) => {
    setSelectedPlan(plan);
  };

  const handlePurchase = () => {
    if (!selectedPlan) {
      toast({
        title: "Error",
        description: "Please select a data plan",
        variant: "destructive",
      });
      return;
    }

    if (!phoneNumber) {
      toast({
        title: "Error",
        description: "Please enter a phone number",
        variant: "destructive",
      });
      return;
    }

    if (selectedPlan.price > walletBalance) {
      toast({
        title: "Insufficient Balance",
        description: "Please fund your wallet to continue",
        variant: "destructive",
      });
      return;
    }

    const details = {
      phoneNumber,
      provider,
      planName: selectedPlan.name,
      data: selectedPlan.data,
      validity: selectedPlan.validity,
      type: 'data',
    };

    onPurchase(selectedPlan.price, details);
    onClose();
    
    // Reset form
    setPhoneNumber('');
    setProvider('');
    setSelectedPlan(null);
    setShowPlans(false);
  };

  const groupedPlans = provider && dataPlans[provider] 
    ? dataPlans[provider].reduce((acc, plan) => {
        if (!acc[plan.category]) {
          acc[plan.category] = [];
        }
        acc[plan.category].push(plan);
        return acc;
      }, {} as Record<string, DataPlan[]>)
    : {};

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center text-green-700">Buy Data Bundle</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-green-50 p-3 rounded-lg">
            <p className="text-sm text-green-700">
              Wallet Balance: ₦{walletBalance.toLocaleString()}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phoneNumber">Phone Number</Label>
            <Input
              id="phoneNumber"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="e.g., 08012345678"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="provider">Network Provider</Label>
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mtn">MTN</SelectItem>
                <SelectItem value="airtel">Airtel</SelectItem>
                <SelectItem value="glo">Glo</SelectItem>
                <SelectItem value="9mobile">9mobile</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showPlans && Object.keys(groupedPlans).length > 0 && (
            <div className="space-y-4">
              <Label>Select Data Plan</Label>
              {Object.entries(groupedPlans).map(([category, plans]) => (
                <div key={category} className="space-y-2">
                  <h4 className="font-semibold text-lg text-gray-800">{category} Plans</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {plans.map((plan) => (
                      <Card
                        key={plan.id}
                        className={`cursor-pointer transition-all ${
                          selectedPlan?.id === plan.id 
                            ? 'border-green-500 bg-green-50' 
                            : 'hover:border-gray-300'
                        }`}
                        onClick={() => handlePlanSelect(plan)}
                      >
                        <CardContent className="p-4">
                          <div className="text-center">
                            <p className="font-semibold text-lg">₦{plan.price.toLocaleString()}</p>
                            <p className="text-green-600 font-medium">{plan.data}</p>
                            <p className="text-sm text-gray-600">{plan.validity}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedPlan && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Selected Plan</h4>
              <p><strong>Data:</strong> {selectedPlan.data}</p>
              <p><strong>Price:</strong> ₦{selectedPlan.price.toLocaleString()}</p>
              <p><strong>Validity:</strong> {selectedPlan.validity}</p>
            </div>
          )}

          <Button
            onClick={handlePurchase}
            className="w-full bg-green-600 hover:bg-green-700"
            disabled={!selectedPlan}
          >
            Purchase Data Plan
            {selectedPlan && ` - ₦${selectedPlan.price.toLocaleString()}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DataPlansModal;
