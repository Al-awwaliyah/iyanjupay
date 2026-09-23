import React from "react";
import { LucideIcon } from "lucide-react";

import DashboardActionCard from "@/components/dashboard/DashboardActionCard";

interface ServiceCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
  color: string;
  comingSoon?: boolean;
  available?: boolean;
}

const SERVICE_TONES: Record<string, string> = {
  "bg-blue-500": "bg-blue-500/10 text-blue-600",
  "bg-purple-500": "bg-violet-500/10 text-violet-600",
  "bg-red-500": "bg-red-500/10 text-red-600",
  "bg-yellow-500": "bg-amber-500/10 text-amber-600",
  "bg-orange-500": "bg-orange-500/10 text-orange-600",
  "bg-slate-500": "bg-slate-500/10 text-slate-600",
  "bg-pink-500": "bg-pink-500/10 text-pink-600",
  "bg-indigo-500": "bg-indigo-500/10 text-indigo-600",
  "bg-cyan-500": "bg-cyan-500/10 text-cyan-600",
  "bg-emerald-500": "bg-emerald-500/10 text-emerald-600",
};

const ServiceCard = ({
  title,
  description,
  icon,
  onClick,
  color,
  comingSoon = false,
  available = true,
}: ServiceCardProps) => {
  return (
    <DashboardActionCard
      title={title}
      description={description}
      icon={icon}
      onClick={onClick}
      comingSoon={comingSoon || !available}
      iconClassName={
        SERVICE_TONES[color] ??
        "bg-primary/10 text-primary"
      }
    />
  );
};

export default ServiceCard;
