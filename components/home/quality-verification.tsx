"use client";

import { useState } from "react";
import Link from "next/link";

import { HomeSection } from "@/components/ui/home-section";
import { PillButton } from "@/components/ui/pill-button";
import type { QualityTab } from "@/lib/home/home-data";
import { cn } from "@/lib/utils";

type QualityVerificationProps = {
  tabs: QualityTab[];
};

export function QualityVerification({ tabs }: QualityVerificationProps) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  if (!activeTab) return null;

  return (
    <HomeSection background="lavender" size="editorial">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-16 lg:grid-cols-2 lg:gap-24">
        <header className="flex flex-col gap-8 lg:max-w-lg">
          <p className="mono text-slate-muted">QUALITY VERIFICATION</p>
          <h2 className="font-display text-[clamp(2rem,4vw,3rem)] font-bold leading-[1.08] tracking-[-0.02em] text-near-black">
            Tested by a lab we don&apos;t own.
          </h2>
          <p className="text-lg leading-relaxed text-slate-muted">
            Independent verification on every batch. Select a panel to see what
            we measure—and why it matters for research-grade supply.
          </p>
          <PillButton href="/testing" variant="secondary" className="w-fit">
            Full testing standards
          </PillButton>
        </header>

        <div className="flex flex-col gap-8">
          <div
            role="tablist"
            aria-label="Quality verification panels"
            className="flex flex-wrap gap-2"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeId === tab.id}
                onClick={() => setActiveId(tab.id)}
                className={cn(
                  "rounded-pill px-5 py-2.5 text-sm font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-near-black",
                  activeId === tab.id
                    ? "bg-near-black text-white"
                    : "border border-near-black/10 bg-[var(--color-lab-white)] text-near-black hover:bg-near-black/5"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            className="flex flex-col gap-8 rounded-3xl border border-near-black/5 bg-[var(--color-lab-white)] p-8 md:p-10"
          >
            <div className="flex flex-col gap-4">
              <h3 className="font-display text-2xl font-bold tracking-[-0.02em] text-near-black md:text-3xl">
                {activeTab.title}
              </h3>
              <p className="text-base leading-relaxed text-slate-muted md:text-lg">
                {activeTab.summary}
              </p>
            </div>

            <ul className="flex flex-col gap-4">
              {activeTab.details.map((detail, index) => (
                <li
                  key={detail}
                  className="flex gap-4 text-base leading-relaxed text-slate-muted"
                >
                  <span
                    className="shrink-0 font-[family-name:var(--font-mono)] text-xs text-[var(--color-sage)]"
                    aria-hidden
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {detail}
                </li>
              ))}
            </ul>

            <Link
              href="/testing#coa"
              className="text-sm font-medium text-[var(--color-sage)] underline underline-offset-4 transition-opacity duration-200 ease-out hover:opacity-70"
            >
              How to read your COA →
            </Link>
          </div>
        </div>
      </div>
    </HomeSection>
  );
}
