import { AlertCircle, CheckCircle2, Info } from "lucide-react";

type CalloutVariant = "limitation" | "key-point" | "method";

type AnalyticalCalloutProps = {
  title: string;
  children: React.ReactNode;
  variant?: CalloutVariant;
  className?: string;
};

export function AnalyticalCallout({
  title,
  children,
  variant = "limitation",
  className = "",
}: AnalyticalCalloutProps) {
  const config = {
    limitation: {
      border: "border-signal/30",
      bg: "bg-signal/5",
      iconColor: "text-signal",
      label: "ANALYTICAL LIMITATION",
      Icon: AlertCircle,
    },
    "key-point": {
      border: "border-accent/30",
      bg: "bg-accent/5",
      iconColor: "text-accent",
      label: "KEY ANALYTICAL PRINCIPLE",
      Icon: CheckCircle2,
    },
    method: {
      border: "border-linen",
      bg: "bg-surface",
      iconColor: "text-accent",
      label: "METHOD SPECIFICATION",
      Icon: Info,
    },
  }[variant];

  const IconComponent = config.Icon;

  return (
    <aside
      className={`rounded-xl border ${config.border} ${config.bg} p-5 sm:p-6 ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <IconComponent
          className={`size-4 sm:size-5 shrink-0 ${config.iconColor}`}
          aria-hidden
        />
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-[0.6875rem] font-semibold uppercase tracking-wider text-stone">
            {config.label}
          </span>
          <span className="text-stone">·</span>
          <h3 className="font-display text-base font-bold text-ink">
            {title}
          </h3>
        </div>
      </div>
      <div className="mt-3 text-sm leading-relaxed text-ash sm:text-base space-y-2">
        {children}
      </div>
    </aside>
  );
}
