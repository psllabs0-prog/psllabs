import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, FileCheck, Layers, AlertCircle, Truck, LifeBuoy } from "lucide-react";

import { AboutClosing } from "@/components/about/about-cta";
import { AboutHero } from "@/components/about/about-hero";
import { AnimateIn } from "@/components/product/animate-in";
import { aboutContent } from "@/lib/about";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "About PSL Labs: Verifiable Operating Practices",
  description:
    "PSL Labs focuses on independent third-party lab reports, lot transparency, U.S. fulfillment, and research support.",
  path: "/about",
});

export default function AboutPage() {
  const { hero, closing } = aboutContent;

  const operatingSections = [
    {
      id: "built-around-verification",
      icon: CheckCircle2,
      title: "Built Around Verification",
      paragraphs: [
        "PSL Labs is built on a simple idea: research materials should stand on documents you can check, not on marketing claims. We supply synthetic peptides and related lab materials with clear third-party documentation.",
        "Instead of broad quality slogans, we publish lab results for active lots so researchers can review identity, purity, and amount data before using the material in their work.",
      ],
      linkText: "Learn about our testing methodology",
      linkHref: "/testing",
    },
    {
      id: "independent-laboratory-documentation",
      icon: FileCheck,
      title: "Independent Laboratory Documentation",
      paragraphs: [
        "We do not test our own products for published reports, and we do not rely only on supplier paperwork. Published testing is done by Janoshik Analytical, an independent lab using HPLC and mass spectrometry.",
        "Each Certificate of Analysis covers chromatographic purity, chemical identity, and measured mass for the tested sample. Reports include a task number and a verification link so you can confirm the file on the lab's own server.",
      ],
      linkText: "Review published batch reports in COA Lookup",
      linkHref: "/coa",
    },
    {
      id: "batch-transparency",
      icon: Layers,
      title: "Batch Transparency",
      paragraphs: [
        "Lab results are batch-specific. A report applies to the lot and sample named on that document. It does not cover other lots.",
        "Every active catalog product has a published lot report. When we bring in a new lot, we finish third-party testing and publish it before that lot ships. Coming Soon items stay unavailable until that step is done.",
      ],
      linkText: "Search reports by lot or task number",
      linkHref: "/coa",
    },
    {
      id: "what-analytical-reports-do-not-establish",
      icon: AlertCircle,
      title: "What Analytical Reports Do Not Establish",
      paragraphs: [
        "HPLC purity and mass spectrometry results speak to chemical identity, peak-area purity, and measured mass for the tested sample.",
        "Unless a separate assay is documented, these reports do not cover sterility, endotoxin status, pharmacokinetics, or biological safety. Materials are for laboratory research only, not for human or veterinary use.",
      ],
      linkText: "Review analytical scope and testing standards",
      linkHref: "/testing",
    },
    {
      id: "us-fulfillment",
      icon: Truck,
      title: "U.S. Fulfillment",
      paragraphs: [
        "We fulfill orders from Phoenix, Arizona. Packages are packed to protect vial seals and lyophilized material in normal domestic transit.",
        "Orders usually process within 1 to 2 business days after payment clears, with tracked shipping to all 50 U.S. states. See the shipping page for rates, timing, and tracking details.",
      ],
      linkText: "View our domestic shipping policies and thresholds",
      linkHref: "/shipping",
    },
    {
      id: "research-support",
      icon: LifeBuoy,
      title: "Research Support",
      paragraphs: [
        "We answer questions about lot documentation, order status, tracking, and product specs directly.",
        "We do not advise on human administration, dosing, therapeutic protocols, or clinical use. For order or documentation help, contact us.",
      ],
      linkText: "Contact our research support team",
      linkHref: "/contact",
    },
  ];

  return (
    <main className="bg-paper">
      <AboutHero hero={hero} />

      <section className="section-surface-soft px-6 py-14 md:px-16 md:py-20 lg:px-24">
        <div className="mx-auto flex max-w-[960px] flex-col gap-10 md:gap-14">
          <AnimateIn>
            <div className="flex flex-col gap-3">
              <p className="mono text-accent">OPERATING PRACTICES</p>
              <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink md:text-3xl">
                Verifiable standards, not marketing claims.
              </h2>
              <p className="text-base leading-relaxed text-ash md:text-lg">
                PSL Labs is structured around operational transparency, documented testing standards, and research-use-only compliance.
              </p>
            </div>
          </AnimateIn>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {operatingSections.map((section, index) => {
              const Icon = section.icon;
              return (
                <AnimateIn key={section.id} delay={0.06 * index}>
                  <article className="premium-card flex h-full flex-col justify-between p-6 md:p-8">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-lg border border-border-strong bg-paper text-accent">
                          <Icon className="size-5" aria-hidden />
                        </div>
                        <h3 className="font-display text-xl font-bold text-ink">
                          {section.title}
                        </h3>
                      </div>

                      <div className="flex flex-col gap-3 pt-2 text-sm leading-relaxed text-ash md:text-base">
                        {section.paragraphs.map((p, pIndex) => (
                          <p key={pIndex}>{p}</p>
                        ))}
                      </div>
                    </div>

                    <div className="mt-6 border-t border-linen pt-4">
                      <Link
                        href={section.linkHref}
                        className="mono text-xs font-medium text-accent underline underline-offset-4 hover:opacity-80 md:text-sm"
                      >
                        {section.linkText} →
                      </Link>
                    </div>
                  </article>
                </AnimateIn>
              );
            })}
          </div>
        </div>
      </section>

      <AboutClosing closing={closing} />
    </main>
  );
}
