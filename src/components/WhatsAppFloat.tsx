
import React from 'react';
import { MessageCircle } from 'lucide-react';

const WhatsAppFloat = () => {
  const phoneNumber = "+2347016799143";
  
  const openWhatsApp = () => {
    window.open(`https://wa.me/${phoneNumber.replace('+', '')}`, '_blank');
  };

  return (
    <div 
      className="fixed bottom-6 right-6 z-50 cursor-pointer"
      onClick={openWhatsApp}
    >
      <div className="bg-green-500 hover:bg-green-600 text-white p-4 rounded-full shadow-lg transition-all duration-300 hover:scale-110">
        <MessageCircle className="h-6 w-6" />
      </div>
    </div>
  );
};

export default WhatsAppFloat;
