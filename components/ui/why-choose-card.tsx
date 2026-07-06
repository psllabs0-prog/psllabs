import {
  LabIllustration,
  type LabIllustrationId,
} from "@/components/illustrations/lab-illustrations";
import { cn } from "@/lib/utils";

type WhyChooseCardProps = {
  illustration: LabIllustrationId;
  title: string;
  description: string;
  className?: string;
};

export function WhyChooseCard({
  illustration,
  title,
  description,
  className,
}: WhyChooseCardProps) {
  return (
    <article
      className={cn(
        "premium-card premium-card-hover flex flex-col gap-4 p-5 md:gap-5 md:p-6",
        className
      )}
    >
      <div
        className="size-[4rem] overflow-hidden rounded-lg border border-linen bg-soft-blue/50 md:size-[4.5rem]"
        aria-hidden
      >
        <LabIllustration id={illustration} />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-display text-lg font-bold tracking-[-0.02em] text-ink">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-ash md:text-base">
          {description}
        </p>
      </div>
    </article>
  );
}
