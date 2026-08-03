import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type CertificateRow = {
  label: string;
  value: string;
  /** Accent highlight — use once for the key verification number (e.g. purity). */
  highlight?: boolean;
};

type CertificatePanelProps = {
  headerLabel?: string;
  rows: CertificateRow[];
  className?: string;
  children?: React.ReactNode;
};

export function CertificatePanel({
  headerLabel = "Certificate",
  rows,
  className,
  children,
}: CertificatePanelProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-linen bg-surface",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-linen px-4 py-3 md:px-5">
        <p className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-stone">
          {headerLabel}
        </p>
        <Check
          className="size-4 shrink-0 text-accent"
          strokeWidth={2.5}
          aria-hidden
        />
        <span className="sr-only">Verified report available</span>
      </div>
      <dl>
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-4 border-b border-linen px-4 py-3 last:border-b-0 md:px-5"
          >
            <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-stone">
              {row.label}
            </dt>
            <dd
              className={cn(
                "text-right font-mono text-sm tabular-nums tracking-tight",
                row.highlight ? "font-medium text-accent" : "text-ink"
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  );
}
