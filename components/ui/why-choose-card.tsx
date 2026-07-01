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
        "flex flex-col gap-5 rounded-lg border border-biotech-pale/80 bg-gradient-to-b from-lab-white to-biotech-mist/40 p-6 shadow-[0_8px_30px_rgba(26,77,109,0.06)] md:p-8",
        className
      )}
    >
      <div
        className="size-[4.5rem] overflow-hidden rounded-lg border border-biotech-pale"
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
