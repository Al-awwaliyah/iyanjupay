import React from "react";
import { MessageCircle } from "lucide-react";

const WhatsAppFloat = () => {
  const phoneNumber = "+2347016799143";

  const openWhatsApp = () => {
    window.open(
      `https://wa.me/${phoneNumber.replace("+", "")}`,
      "_blank"
    );
  };

  return (
    <div
      className="fixed bottom-20 right-5 z-50 cursor-pointer"
      onClick={openWhatsApp}
      aria-label="Contact us on WhatsApp"
    >
      <div className="bg-green-500 hover:bg-green-600 text-white p-3 rounded-full shadow-lg transition-all duration-300 hover:scale-105">
        <MessageCircle className="h-5 w-5" />
      </div>
    </div>
  );
};

export default WhatsAppFloat;
