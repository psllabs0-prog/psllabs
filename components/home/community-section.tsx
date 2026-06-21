import { BookOpen, Microscope, Users } from "lucide-react";

import { HomeSection } from "@/components/ui/home-section";
import { PillButton } from "@/components/ui/pill-button";

const pillars = [
  {
    icon: Microscope,
    title: "Research-grade standards",
    description:
      "We publish testing data, cite primary literature on product pages, and design the stack around mechanisms—not trends.",
    theme: "bg-mint",
  },
  {
    icon: BookOpen,
    title: "Open documentation",
    description:
      "COAs, ingredient dossiers, and protocol guides written for people who read labels and check references.",
    theme: "bg-lavender",
  },
  {
    icon: Users,
    title: "Built for long horizons",
    description:
      "PSL Labs is for researchers and practitioners planning in decades—consistency, transparency, and compounding matter more than hype.",
    theme: "bg-pale-yellow",
  },
];

export function CommunitySection() {
  return (
    <HomeSection background="mint" size="editorial">
      <div className="mx-auto max-w-[1440px]">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:gap-24">
          <div className="flex flex-col gap-10 lg:max-w-xl">
            <div className="flex flex-col gap-6">
              <p className="mono text-slate-muted">RESEARCH COMMUNITY</p>
              <h2 className="font-display text-[clamp(2rem,4vw,3.25rem)] font-bold leading-[1.08] tracking-[-0.02em] text-near-black">
                For people who read the methods section.
              </h2>
              <p className="text-lg leading-relaxed text-slate-muted">
                PSL Labs exists for a small community of longevity researchers,
                clinicians, and serious self-experimenters who want clinical-grade
                compounds with documentation they can actually verify.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <PillButton href="/about">Our story</PillButton>
              <PillButton href="/protocol" variant="secondary">
                The protocol
              </PillButton>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {pillars.map(({ icon: Icon, title, description, theme }) => (
              <article
                key={title}
                className="flex gap-6 rounded-3xl border border-near-black/5 bg-[var(--color-lab-white)] p-8 md:p-10"
              >
                <div
                  className={`flex size-14 shrink-0 items-center justify-center rounded-2xl ${theme}`}
                  aria-hidden
                >
                  <Icon className="size-6 text-near-black" strokeWidth={1.5} />
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="font-display text-xl font-bold tracking-[-0.02em] text-near-black">
                    {title}
                  </h3>
                  <p className="text-base leading-relaxed text-slate-muted">
                    {description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </HomeSection>
  );
}
