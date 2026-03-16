"use client";

import { type LucideIcon } from "lucide-react";

interface DashboardCardProps {
  title: string;
  icon: LucideIcon;
  iconBg: string;
  children: React.ReactNode;
  action?: {
    label: string;
    variant: "primary" | "accent" | "warning" | "danger";
    onClick?: () => void;
  };
}

const variantStyles = {
  primary: "bg-primary hover:bg-primary/90 text-white",
  accent: "bg-accent hover:bg-accent-hover text-white",
  warning: "bg-warning hover:bg-amber-600 text-white",
  danger: "bg-danger hover:bg-red-600 text-white",
};

export default function DashboardCard({
  title,
  icon: Icon,
  iconBg,
  children,
  action,
}: DashboardCardProps) {
  return (
    <div className="bg-card rounded-xl border border-card-border shadow-sm hover:shadow-md transition-all duration-200 flex flex-col">
      {/* Card Header */}
      <div className="px-5 pt-5 pb-3 flex items-start gap-3.5">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-[15px] font-semibold text-text-primary pt-1.5">{title}</h3>
      </div>

      {/* Card Body */}
      <div className="px-5 flex-1">{children}</div>

      {/* Card Action */}
      {action && (
        <div className="px-5 pb-5 pt-4">
          <button
            onClick={action.onClick}
            className={`w-full py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-150 cursor-pointer shadow-sm ${
              variantStyles[action.variant]
            }`}
          >
            {action.label}
          </button>
        </div>
      )}
    </div>
  );
}
