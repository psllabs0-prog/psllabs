import {
  LabIllustration,
  type LabIllustrationId,
} from "@/components/illustrations/lab-illustrations";
import { cn } from "@/lib/utils";

type TrustElementProps = {
  illustration: LabIllustrationId;
  label: string;
  className?: string;
};

export function TrustElement({
  illustration,
  label,
  className,
}: TrustElementProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 text-center",
        className
      )}
    >
      <div
        className="size-16 overflow-hidden rounded-lg border border-biotech-pale shadow-[0_8px_24px_rgba(26,77,109,0.08)]"
        aria-hidden
      >
        <LabIllustration id={illustration} />
      </div>
      <p className="font-display text-sm font-bold tracking-[-0.02em] text-ink md:text-base">
        {label}
      </p>
    </div>
  );
}
