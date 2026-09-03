import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface ServiceCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
  color: string;
  comingSoon?: boolean;
}

const ServiceCard = ({
  title,
  description,
  icon: Icon,
  onClick,
  color,
  comingSoon = false,
}: ServiceCardProps) => {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (comingSoon) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <Card
      role={comingSoon ? undefined : "button"}
      tabIndex={comingSoon ? -1 : 0}
      aria-label={comingSoon ? `${title}, coming soon` : title}
      aria-disabled={comingSoon}
      className={[
        "group relative overflow-hidden rounded-2xl border bg-white",
        "transition-all duration-200",
        comingSoon
          ? "cursor-default border-slate-200 opacity-80"
          : "cursor-pointer border-slate-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#082A63]/25 focus:ring-offset-2",
      ].join(" ")}
      onClick={comingSoon ? undefined : onClick}
      onKeyDown={handleKeyDown}
    >
      <CardContent className="relative flex flex-col items-center p-5 text-center sm:p-6">
        {comingSoon && (
          <div className="absolute right-3 top-3 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Coming Soon
          </div>
        )}

        <div
          className={[
            "mb-4 flex h-14 w-14 items-center justify-center rounded-2xl",
            "shadow-sm transition-all duration-200",
            comingSoon
              ? "grayscale"
              : "group-hover:scale-105 group-hover:shadow-md",
            color,
          ].join(" ")}
        >
          <Icon
            className="h-6 w-6 text-white"
            strokeWidth={2}
            aria-hidden="true"
          />
        </div>

        <h3 className="mb-1.5 text-base font-bold tracking-tight text-slate-900 sm:text-lg">
          {title}
        </h3>

        <p className="max-w-[220px] text-xs leading-5 text-slate-500 sm:text-sm">
          {description}
        </p>

        {!comingSoon && (
          <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-[#082A63] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span>Open service</span>
            <span aria-hidden="true">→</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ServiceCard;
