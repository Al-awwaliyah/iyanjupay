import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface ServiceCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
  color: string;
}

const ServiceCard = ({ title, description, icon: Icon, onClick, color }: ServiceCardProps) => {
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={title}
      className="group cursor-pointer overflow-hidden border-slate-200 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#082A63]/30"
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <CardContent className="flex flex-col items-center p-5 text-center sm:p-6">
        <div className={`mb-3 rounded-full p-3.5 shadow-sm transition-transform duration-200 group-hover:scale-105 ${color}`}>
          <Icon className="h-6 w-6 text-white" aria-hidden="true" />
        </div>
        <h3 className="mb-1.5 text-base font-semibold text-slate-900 sm:text-lg">{title}</h3>
        <p className="text-xs leading-5 text-slate-500 sm:text-sm">{description}</p>
      </CardContent>
    </Card>
  );
};

export default ServiceCard;
