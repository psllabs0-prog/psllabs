import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, FileCheck, Layers, AlertCircle, Truck, LifeBuoy } from "lucide-react";

import { AboutClosing } from "@/components/about/about-cta";
import { AboutHero } from "@/components/about/about-hero";
import { AnimateIn } from "@/components/product/animate-in";
import { aboutContent } from "@/lib/about";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "About PSL Labs — Verifiable Operating Practices",
  description:
    "PSL Labs operates around empirical verification: independent third-party laboratory reports, lot transparency, U.S. fulfillment, and dedicated research support.",
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
        "PSL Labs is founded on a straightforward operating principle: research materials should never rely on marketing assertions, subjective ratings, or unverified claims. We supply synthetic peptide reference standards and biochemicals with transparent, verifiable documentation for laboratory and in vitro investigation.",
        "Rather than publishing broad generalizations, we ground our catalog in empirical analytical data. Every active compound is documented by laboratory analysis so researchers can evaluate physical compound properties before integrating materials into their research workflows.",
      ],
      linkText: "Learn about our testing methodology",
      linkHref: "/testing",
    },
    {
      id: "independent-laboratory-documentation",
      icon: FileCheck,
      title: "Independent Laboratory Documentation",
      paragraphs: [
        "We do not test our own products or rely on self-reported supplier documentation. All published analytical testing is conducted by Janoshik Analytical—an independent third-party analytical laboratory utilizing High-Performance Liquid Chromatography (HPLC) and Mass Spectrometry (MS).",
        "Each laboratory Certificate of Analysis (COA) documents chromatographic purity, chemical identity, and quantitative mass content. Every published report includes an original task number and direct verification link, enabling researchers to independently confirm document authenticity on the testing laboratory's server.",
      ],
      linkText: "Review published batch reports in COA Lookup",
      linkHref: "/coa",
    },
    {
      id: "batch-transparency",
      icon: Layers,
      title: "Batch Transparency",
      paragraphs: [
        "Analytical data is batch-specific. Testing performed on a designated sample applies strictly to that specific production lot and does not guarantee properties of past, separate, or unlisted synthesis runs.",
        "Every active product in our catalog corresponds to an active published lot report. When a new lot is introduced, independent analytical testing is conducted and published before that lot is released for research fulfillment. Pipeline materials (marked Coming Soon) remain unpurchasable until independent verification is completed.",
      ],
      linkText: "Search reports by lot or task number",
      linkHref: "/coa",
    },
    {
      id: "what-analytical-reports-do-not-establish",
      icon: AlertCircle,
      title: "What Analytical Reports Do Not Establish",
      paragraphs: [
        "Scientific accuracy requires absolute clarity about testing boundaries. Standard HPLC chromatographic purity and mass spectrometry assays establish chemical identity, chromatographic peak area purity, and measured mass of the tested sample.",
        "Unless independently tested and explicitly documented by a separate specialized assay, analytical reports do not establish microbiological sterility, bacterial endotoxin/pyrogen status, pharmacokinetic properties, or biological safety. All compounds are distributed strictly for laboratory research and analytical reference—not for human or veterinary administration, medical application, or clinical therapy.",
      ],
      linkText: "Review analytical scope and testing standards",
      linkHref: "/testing",
    },
    {
      id: "us-fulfillment",
      icon: Truck,
      title: "U.S. Fulfillment",
      paragraphs: [
        "PSL Labs operates domestic fulfillment out of Phoenix, Arizona. All shipments are packaged securely using protective materials designed to safeguard vial seals and physical lyophilized compound integrity during transit.",
        "Orders are processed within 1–2 business days following payment confirmation, with tracked domestic carrier delivery to physical addresses across all 50 U.S. states. Full details on delivery timeframes, tracking procedures, and transit guidelines are documented on our shipping page.",
      ],
      linkText: "View our domestic shipping policies & thresholds",
      linkHref: "/shipping",
    },
    {
      id: "research-support",
      icon: LifeBuoy,
      title: "Research Support",
      paragraphs: [
        "We offer direct, responsive support for researchers, laboratories, and institutions. Inquiries concerning lot documentation, order status, carrier tracking, or product specifications are answered directly by our team.",
        "In accordance with strict research compliance policies, support staff will not provide guidance or consultation regarding human administration, dosage calculation, therapeutic protocols, or clinical use. For assistance with orders or batch documentation, reach out directly.",
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
