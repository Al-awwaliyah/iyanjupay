import React from "react";
import {
  ArrowLeft,
  MessageCircle,
  Mail,
  Phone,
  Clock,
  Headphones,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface CustomerServicePageProps {
  onBack: () => void;
}

const CustomerServicePage = ({
  onBack,
}: CustomerServicePageProps) => {
  const whatsappNumber =
    import.meta.env.VITE_WHATSAPP_SUPPORT_NUMBER || "";

  const supportEmail =
    import.meta.env.VITE_SUPPORT_EMAIL || "";

  const supportPhone =
    import.meta.env.VITE_SUPPORT_PHONE || "";

  const openWhatsApp = () => {
    if (!whatsappNumber) {
      return;
    }

    const cleanedNumber =
      whatsappNumber.replace(/[^\d]/g, "");

    if (!cleanedNumber) {
      return;
    }

    const message = encodeURIComponent(
      "Hello IyanjuPay Support, I need assistance with my account."
    );

    window.open(
      `https://wa.me/${cleanedNumber}?text=${message}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const openEmail = () => {
    if (!supportEmail) {
      return;
    }

    const subject = encodeURIComponent(
      "IyanjuPay Customer Support"
    );

    const body = encodeURIComponent(
      "Hello IyanjuPay Support,\n\nI need assistance with my account.\n\nThank you."
    );

    window.location.href =
      `mailto:${supportEmail}?subject=${subject}&body=${body}`;
  };

  const makeCall = () => {
    if (!supportPhone) {
      return;
    }

    window.location.href =
      `tel:${supportPhone}`;
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
            Customer Service
          </h1>
        </div>

        {/* Welcome Card */}
        <Card className="mb-6 overflow-hidden border-0 shadow-lg">
          <CardContent className="p-0">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
                  <Headphones className="h-7 w-7" />
                </div>

                <div>
                  <h2 className="text-xl font-bold">
                    How can we help?
                  </h2>

                  <p className="text-purple-100 text-sm mt-1">
                    Our support team is here to assist you.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-green-600" />
                </div>

                <div>
                  <p className="font-semibold text-gray-900">
                    Support availability
                  </p>

                  <p className="text-sm text-gray-600">
                    Contact support through any available channel.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Options */}
        <div className="space-y-3">

          {/* WhatsApp */}
          <Card
            className={`transition-shadow ${
              whatsappNumber
                ? "cursor-pointer hover:shadow-md"
                : "opacity-70"
            }`}
            onClick={openWhatsApp}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-4">

                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <MessageCircle className="h-6 w-6 text-green-600" />
                </div>

                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">
                    WhatsApp Support
                  </h3>

                  <p className="text-sm text-gray-600">
                    Chat with customer service on WhatsApp.
                  </p>

                  {!whatsappNumber && (
                    <p className="text-xs text-orange-600 mt-1">
                      WhatsApp support number has not been configured.
                    </p>
                  )}
                </div>

                <ChevronRight className="h-5 w-5 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          {/* Email */}
          <Card
            className={`transition-shadow ${
              supportEmail
                ? "cursor-pointer hover:shadow-md"
                : "opacity-70"
            }`}
            onClick={openEmail}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-4">

                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-blue-600" />
                </div>

                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">
                    Email Support
                  </h3>

                  <p className="text-sm text-gray-600">
                    Send us an email about your issue.
                  </p>

                  {!supportEmail && (
                    <p className="text-xs text-orange-600 mt-1">
                      Support email has not been configured.
                    </p>
                  )}
                </div>

                <ChevronRight className="h-5 w-5 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          {/* Phone */}
          <Card
            className={`transition-shadow ${
              supportPhone
                ? "cursor-pointer hover:shadow-md"
                : "opacity-70"
            }`}
            onClick={makeCall}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-4">

                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                  <Phone className="h-6 w-6 text-purple-600" />
                </div>

                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">
                    Call Support
                  </h3>

                  <p className="text-sm text-gray-600">
                    Speak directly with customer service.
                  </p>

                  {!supportPhone && (
                    <p className="text-xs text-orange-600 mt-1">
                      Support phone number has not been configured.
                    </p>
                  )}
                </div>

                <ChevronRight className="h-5 w-5 text-gray-400" />
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Message Section */}
        <Card className="mt-6 bg-white">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <MessageCircle className="h-5 w-5 text-purple-600 mt-1" />

              <div>
                <h3 className="font-semibold text-gray-900">
                  Need help with a transaction?
                </h3>

                <p className="text-sm text-gray-600 mt-1">
                  Keep your transaction reference available when contacting
                  support so we can investigate the issue faster.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default CustomerServicePage;
