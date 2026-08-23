import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  Search,
  ChevronDown,
  HelpCircle,
  Wallet,
  Send,
  ShieldCheck,
  Building2,
  AlertCircle,
  CreditCard,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface SupportPageProps {
  onBack: () => void;
}

type FAQItem = {
  question: string;
  answer: string;
  category: string;
  icon: React.ElementType;
};

const FAQ_ITEMS: FAQItem[] = [
  {
    question: "How do I fund my wallet?",
    answer:
      "Open Add Money from your wallet dashboard. Your dedicated bank account details can be used to transfer money into your IyanjuPay wallet. Once the deposit is confirmed, your wallet balance will be updated.",
    category: "Wallet",
    icon: Wallet,
  },
  {
    question: "How do I transfer money?",
    answer:
      "Select Send Money from your dashboard and choose the appropriate transfer option. For IyanjuPay wallet transfers, enter the recipient's wallet details. For bank transfers, enter the recipient's bank account information and verify the recipient before confirming.",
    category: "Transfers",
    icon: Send,
  },
  {
    question: "How do I receive money?",
    answer:
      "You can receive money through your IyanjuPay wallet details or your dedicated bank account, depending on the type of payment you are receiving.",
    category: "Wallet",
    icon: Building2,
  },
  {
    question: "How does KYC verification work?",
    answer:
      "KYC verification helps confirm your identity and allows your account to access services and limits that require verification. Your verification requirements depend on the information and verification level associated with your account.",
    category: "KYC",
    icon: ShieldCheck,
  },
  {
    question: "Where can I find my dedicated bank account?",
    answer:
      "Open Add Money from your dashboard. Your dedicated bank account information is displayed there when an account has been successfully created for your wallet.",
    category: "Wallet",
    icon: Building2,
  },
  {
    question: "What are my transaction limits?",
    answer:
      "Your available transaction limits depend on your account and verification level. Open Transaction Limit under Me to view the limits currently configured for your account.",
    category: "Limits",
    icon: CreditCard,
  },
  {
    question: "What happens if a transaction fails?",
    answer:
      "A failed transaction should not permanently reduce your available wallet balance. Depending on the transaction type and provider response, the transaction may be reversed or refunded automatically. If your balance does not return as expected, contact customer service with the transaction reference.",
    category: "Transactions",
    icon: AlertCircle,
  },
  {
    question: "How do I report a problem?",
    answer:
      "Open Customer Service from the Me section and contact support through one of the available channels. Include the transaction reference, amount, date, and a short description of the problem where applicable.",
    category: "Support",
    icon: HelpCircle,
  },
  {
    question: "Can I hide my wallet balance?",
    answer:
      "Yes. Use the eye button on the wallet balance card on your dashboard to hide or reveal the displayed balance.",
    category: "Wallet",
    icon: Wallet,
  },
  {
    question: "How can I view my transaction history?",
    answer:
      "Open Me and select Transaction History. You can use this section to review transactions associated with your account.",
    category: "Transactions",
    icon: CreditCard,
  },
];

const SupportPage = ({
  onBack,
}: SupportPageProps) => {
  const [search, setSearch] = useState("");
  const [openIndex, setOpenIndex] =
    useState<number | null>(null);

  const filteredFAQs = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    if (!query) {
      return FAQ_ITEMS;
    }

    return FAQ_ITEMS.filter((item) => {
      return (
        item.question
          .toLowerCase()
          .includes(query) ||
        item.answer
          .toLowerCase()
          .includes(query) ||
        item.category
          .toLowerCase()
          .includes(query)
      );
    });
  }, [search]);

  const toggleFAQ = (index: number) => {
    setOpenIndex((previous) =>
      previous === index
        ? null
        : index
    );
  };

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
            Support
          </h1>
        </div>

        {/* Search Header */}
        <Card className="mb-6 overflow-hidden border-0 shadow-lg">
          <CardContent className="p-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white">
            <div className="flex items-center gap-3 mb-2">
              <HelpCircle className="h-7 w-7" />

              <h2 className="text-xl font-bold">
                How can we help?
              </h2>
            </div>

            <p className="text-purple-100 text-sm mb-5">
              Search our frequently asked questions.
            </p>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />

              <Input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search FAQs..."
                className="pl-10 bg-white text-gray-900 border-0"
              />
            </div>
          </CardContent>
        </Card>

        {/* FAQ */}
        <div className="space-y-3">

          {filteredFAQs.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <HelpCircle className="h-10 w-10 text-gray-400 mx-auto mb-3" />

                <h3 className="font-semibold text-gray-900">
                  No results found
                </h3>

                <p className="text-sm text-gray-600 mt-1">
                  Try another search term.
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredFAQs.map(
              (item, index) => {
                const Icon = item.icon;
                const isOpen =
                  openIndex === index;

                return (
                  <Card
                    key={`${item.question}-${index}`}
                    className="overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        toggleFAQ(index)
                      }
                      className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-4">

                        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                          <Icon className="h-5 w-5 text-purple-600" />
                        </div>

                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">
                            {item.question}
                          </p>

                          <p className="text-xs text-purple-600 mt-1">
                            {item.category}
                          </p>
                        </div>

                        <ChevronDown
                          className={`h-5 w-5 text-gray-400 transition-transform ${
                            isOpen
                              ? "rotate-180"
                              : ""
                          }`}
                        />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-5 pl-[4.5rem]">
                        <p className="text-sm leading-6 text-gray-600">
                          {item.answer}
                        </p>
                      </div>
                    )}
                  </Card>
                );
              }
            )
          )}

        </div>

        {/* Contact Support */}
        <Card className="mt-6">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <HelpCircle className="h-5 w-5 text-purple-600 mt-1" />

              <div>
                <h3 className="font-semibold text-gray-900">
                  Still need help?
                </h3>

                <p className="text-sm text-gray-600 mt-1">
                  If you cannot find an answer here, open Customer Service
                  from the Me section to contact support.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default SupportPage;
