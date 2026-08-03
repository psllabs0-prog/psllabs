import Link from "next/link";
import { Mail, Clock, CalendarDays } from "lucide-react";

import { AnimateIn } from "@/components/product/animate-in";
import type { ContactPageContent } from "@/lib/contact";

const detailIcons = {
  email: Mail,
  response: Clock,
  hours: CalendarDays,
} as const;

type ContactInfoPanelProps = {
  content: ContactPageContent;
};

export function ContactInfoPanel({ content }: ContactInfoPanelProps) {
  return (
    <div className="flex flex-col gap-10 lg:gap-12">
      <div className="flex flex-col gap-6">
        <AnimateIn>
          <p className="mono text-accent">{content.label}</p>
        </AnimateIn>
        <AnimateIn delay={0.06}>
          <h1 className="font-display text-display-lg font-bold text-ink">
            {content.headline}
          </h1>
        </AnimateIn>
        <AnimateIn delay={0.1}>
          <p className="max-w-md text-body-lg leading-relaxed text-ash">
            {content.intro}
          </p>
        </AnimateIn>
      </div>

      <AnimateIn delay={0.14}>
        <div className="relative overflow-hidden rounded-md border border-linen bg-surface p-6 md:p-8">
          <div className="relative flex flex-col gap-6">
            {content.details.map((detail) => {
              const Icon = detailIcons[detail.id as keyof typeof detailIcons];

              return (
                <div key={detail.id} className="flex gap-4">
                  {Icon ? (
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-paper">
                      <Icon
                        className="size-4 text-accent"
                        strokeWidth={1.25}
                        aria-hidden
                      />
                    </div>
                  ) : null}
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="font-mono text-[0.65rem] uppercase tracking-wider text-ash">
                      {detail.label}
                    </p>
                    {detail.href ? (
                      <a
                        href={detail.href}
                        className="font-display text-lg font-bold text-ink underline underline-offset-4 transition-opacity duration-200 ease-out hover:opacity-70"
                      >
                        {detail.value}
                      </a>
                    ) : (
                      <p className="text-base font-medium text-ink">
                        {detail.value}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </AnimateIn>

      <AnimateIn delay={0.18}>
        <div className="flex flex-col gap-4">
          <p className="mono text-ash">Common topics</p>
          <ul className="flex flex-col gap-2">
            {content.topics.map((topic) => (
              <li key={topic.href}>
                <Link
                  href={topic.href}
                  className="group inline-flex items-center gap-2 text-sm font-medium text-accent transition-opacity duration-200 ease-out hover:opacity-70 md:text-base"
                >
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full bg-accent transition-transform duration-200 group-hover:scale-125"
                  />
                  {topic.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </AnimateIn>
    </div>
  );
}
