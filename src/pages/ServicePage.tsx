import React, { useEffect, useState } from "react";
import { ArrowLeft, Loader2, CheckCircle2, Shield, Zap, Wifi, Smartphone, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import PaymentPinModal from "@/components/security/PaymentPinModal";
import TransactionProcessingPage from "@/pages/TransactionProcessing";

export type BillService = "airtime" | "data" | "electricity" | "cable" | "internet";

interface ServicePageProps {
  onBack: () => void;
  walletBalance: number;
  initialService: BillService;
  onPurchaseSuccess?: () => Promise<void> | void;
}

interface BillerCategory {
  id: number;
  code: string;
  name: string;
}

interface BillerItem {
  id: number;
  biller_code: string;
  name: string;
  default_commission: number;
  date_added: string;
  country: string;
  is_airtime: boolean;
  biller_name: string;
  item_code: string;
  short_name: string;
  fee: number;
  commission_on_fee: boolean;
  label_name: string;
  amount: number;
}

interface ProcessingService {
  service: BillService;
  amount: number;
  details: any;
  idempotencyKey: string;
}

const SERVICE_TITLES: Record<BillService, string> = {
  airtime: "Buy Airtime",
  data: "Buy Data",
  electricity: "Electricity Bill",
  cable: "Cable TV",
  internet: "Internet Services",
};

const ServicePage = ({ onBack, walletBalance, initialService, onPurchaseSuccess }: ServicePageProps) => {
  const { toast } = useToast();

  const [activeService, setActiveService] = useState<BillService>(initialService);
  const [categories, setCategories] = useState<BillerCategory[]>([]);
  const [items, setItems] = useState<BillerItem[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);

  const [selectedBillerCode, setSelectedBillerCode] = useState("");
  const [selectedItemCode, setSelectedItemCode] = useState("");
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");

  const [paymentPinOpen, setPaymentPinOpen] = useState(false);
  const [processingService, setProcessingService] = useState<ProcessingService | null>(null);

  // Switch Bill Service Tab
  const handleServiceChange = (service: BillService) => {
    setActiveService(service);
    setSelectedBillerCode("");
    setSelectedItemCode("");
    setCustomer("");
    setAmount("");
    setItems([]);
  };

  // Fetch Categories for Active Service
  useEffect(() => {
    let isCancelled = false;

    const loadCategories = async () => {
      setLoadingCategories(true);
      try {
        const { data, error } = await supabase.functions.invoke("flutterwave-bills", {
          body: { action: "categories" },
        });

        if (isCancelled) return;
        if (error) throw error;

        if (data?.success && Array.isArray(data?.data)) {
          setCategories(data.data);
        }
      } catch (err: any) {
        if (!isCancelled) {
          toast({
            title: "Unable to load services",
            description: err?.message || "Could not load bill providers.",
            variant: "destructive",
          });
        }
      } finally {
        if (!isCancelled) setLoadingCategories(false);
      }
    };

    loadCategories();
    return () => { isCancelled = true; };
  }, [activeService, toast]);

  // Fetch Items when Provider changes
  useEffect(() => {
    if (!selectedBillerCode) {
      setItems([]);
      return;
    }

    let isCancelled = false;

    const loadItems = async () => {
      setLoadingItems(true);
      try {
        const { data, error } = await supabase.functions.invoke("flutterwave-bills", {
          body: { action: "items", biller_code: selectedBillerCode },
        });

        if (isCancelled) return;
        if (error) throw error;

        if (data?.success && Array.isArray(data?.data)) {
          setItems(data.data);
        }
      } catch (err: any) {
        if (!isCancelled) {
          toast({
            title: "Error",
            description: "Failed to load packages for selected provider.",
            variant: "destructive",
          });
        }
      } finally {
        if (!isCancelled) setLoadingItems(false);
      }
    };

    loadItems();
    return () => { isCancelled = true; };
  }, [selectedBillerCode, toast]);

  // Auto set amount when item changes
  const handleItemChange = (itemCode: string) => {
    setSelectedItemCode(itemCode);
    const selected = items.find((i) => i.item_code === itemCode);
    if (selected && selected.amount > 0) {
      setAmount(String(selected.amount));
    }
  };

  // Review / Continue Button Pressed
  const handleReview = () => {
    const payAmount = Number(amount);

    if (!payAmount || payAmount <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid amount.", variant: "destructive" });
      return;
    }

    if (payAmount > walletBalance) {
      toast({ title: "Insufficient Balance", description: "Wallet balance is too low.", variant: "destructive" });
      return;
    }

    if (!selectedBillerCode) {
      toast({ title: "Missing Information", description: "Please select a provider.", variant: "destructive" });
      return;
    }

    if (!customer.trim()) {
      toast({ title: "Missing Information", description: "Please enter the required customer identifier.", variant: "destructive" });
      return;
    }

    setPaymentPinOpen(true);
  };

  // PIN Verified -> Move to Processing Page
  const handlePaymentPinVerified = () => {
    setPaymentPinOpen(false);

    const selectedItem = items.find((i) => i.item_code === selectedItemCode);
    const payAmount = Number(amount);

    const details = {
      biller_code: selectedBillerCode,
      item_code: selectedItemCode || selectedBillerCode,
      customer: customer.trim(),
      country: "NG",
      packageName: selectedItem?.name || SERVICE_TITLES[activeService],
    };

    setProcessingService({
      service: activeService,
      amount: payAmount,
      details,
      idempotencyKey: `bill_${crypto.randomUUID()}`,
    });
  };

  const handleProcessingDone = async () => {
    setProcessingService(null);
    if (onPurchaseSuccess) {
      await onPurchaseSuccess();
    }
    onBack();
  };

  if (processingService) {
    return (
      <TransactionProcessingPage
        transferType="bill"
        amount={processingService.amount}
        details={{
          ...processingService.details,
          service: processingService.service,
        }}
        idempotencyKey={processingService.idempotencyKey}
        onDone={handleProcessingDone}
        onBack={() => setProcessingService(null)}
      />
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
        <header className="bg-gradient-to-r from-purple-600 to-blue-600 text-white sticky top-0 z-30 shadow-md">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="flex items-center h-16">
              <Button type="button" variant="ghost" onClick={onBack} className="text-white hover:bg-white/20 mr-2">
                <ArrowLeft className="h-5 w-5 mr-2" /> Back
              </Button>
              <h1 className="text-lg sm:text-xl font-bold">{SERVICE_TITLES[activeService]}</h1>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-12">
          {/* Navigation Tabs */}
          <div className="grid grid-cols-5 gap-1 p-1 bg-white rounded-xl shadow-sm mb-6">
            {(["airtime", "data", "electricity", "cable", "internet"] as BillService[]).map((type) => (
              <Button
                key={type}
                type="button"
                variant={activeService === type ? "default" : "ghost"}
                onClick={() => handleServiceChange(type)}
                className={`text-xs capitalize py-2 h-auto ${activeService === type ? "bg-purple-600 text-white" : "text-gray-600"}`}
              >
                {type}
              </Button>
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border p-5 sm:p-6 space-y-6">
            <div className="bg-purple-50 border border-purple-100 p-4 rounded-xl">
              <p className="text-sm text-purple-700">Available Balance</p>
              <p className="text-2xl font-bold text-purple-900 mt-1">₦{walletBalance.toLocaleString()}</p>
            </div>

            {/* Provider Select */}
            <div className="space-y-2">
              <Label>Select Provider</Label>
              <Select value={selectedBillerCode} onValueChange={setSelectedBillerCode} disabled={loadingCategories}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingCategories ? "Loading..." : "Choose Provider"} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.code} value={cat.code}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Package Select */}
            {items.length > 0 && (
              <div className="space-y-2">
                <Label>Select Package</Label>
                <Select value={selectedItemCode} onValueChange={handleItemChange} disabled={loadingItems}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingItems ? "Loading packages..." : "Choose Package"} />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((item) => (
                      <SelectItem key={item.item_code} value={item.item_code}>
                        {item.name} - ₦{item.amount.toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Customer ID / Phone / Smartcard / Meter */}
            <div className="space-y-2">
              <Label>
                {activeService === "airtime" || activeService === "data"
                  ? "Phone Number"
                  : activeService === "electricity"
                  ? "Meter Number"
                  : "Smartcard / Account Number"}
              </Label>
              <Input
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Enter details"
              />
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label>Amount (₦)</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
              />
            </div>

            <Button onClick={handleReview} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3">
              Continue
            </Button>
          </div>
        </main>
      </div>

      <PaymentPinModal
        open={paymentPinOpen}
        onCancel={() => setPaymentPinOpen(false)}
        onVerified={handlePaymentPinVerified}
        title="Confirm Payment"
        description={`Enter PIN to pay ₦${Number(amount).toLocaleString()} for ${SERVICE_TITLES[activeService]}.`}
      />
    </>
  );
};

export default ServicePage;
