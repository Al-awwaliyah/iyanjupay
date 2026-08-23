import React from "react";
import {
  ArrowLeft,
  MessageCircle,
  Mail,
  Phone,
  Clock,
  Headphones,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface CustomerServicePageProps {
  onBack: () => void;
}

const CustomerServicePage = ({
  onBack,
}: CustomerServicePageProps) => {
  const whatsappNumber = "+2347016799143";
  const emailAddress = "lawalaremu53@gmail.com";
  const phoneNumber = "+2347079706286";

  const openWhatsApp = () => {
    window.open(
      `https://wa.me/${whatsappNumber.replace("+", "")}`,
      "_blank"
    );
  };

  const sendEmail = () => {
    window.location.href = `mailto:${emailAddress}`;
  };

  const makeCall = () => {
    window.location.href = `tel:${phoneNumber}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 pb-20">
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
            Customer Service
          </h1>
        </div>

        {/* Hero */}
        <Card className="mb-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
                <Headphones className="h-7 w-7" />
              </div>

              <div>
                <h2 className="text-xl font-bold">
                  How can we help?
                </h2>

                <p className="text-purple-100 text-sm mt-1">
                  Our customer service team is here to assist you.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Support availability */}
        <Card className="mb-6">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <Clock className="h-5 w-5 text-green-600" />
              </div>

              <div>
                <p className="font-semibold text-gray-900">
                  Customer Service
                </p>

                <p className="text-sm text-green-600">
                  Available for assistance
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact options */}
        <div className="space-y-4">

          {/* WhatsApp */}
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={openWhatsApp}
          >
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <MessageCircle className="h-6 w-6 text-green-600" />
                </div>

                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">
                    WhatsApp Support
                  </h3>

                  <p className="text-sm text-gray-600">
                    Chat with our support team on WhatsApp
                  </p>
                </div>

                <span className="text-gray-400">
                  →
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Email */}
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={sendEmail}
          >
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <Mail className="h-6 w-6 text-blue-600" />
                </div>

                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">
                    Email Support
                  </h3>

                  <p className="text-sm text-gray-600">
                    {emailAddress}
                  </p>
                </div>

                <span className="text-gray-400">
                  →
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Call */}
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={makeCall}
          >
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <Phone className="h-6 w-6 text-purple-600" />
                </div>

                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">
                    Call Customer Service
                  </h3>

                  <p className="text-sm text-gray-600">
                    {phoneNumber}
                  </p>
                </div>

                <span className="text-gray-400">
                  →
                </span>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
};

export default CustomerServicePage;
