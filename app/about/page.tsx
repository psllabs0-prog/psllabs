import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, FileCheck, Layers, AlertCircle, Truck, LifeBuoy } from "lucide-react";

import { AboutClosing } from "@/components/about/about-cta";
import { AboutHero } from "@/components/about/about-hero";
import { AnimateIn } from "@/components/product/animate-in";
import { aboutContent } from "@/lib/about";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "About PSL Labs",
  description:
    "How PSL Labs works: independent lab reports, batch transparency, U.S. shipping, and research support.",
  path: "/about",
});

export default function AboutPage() {
  const { hero, closing } = aboutContent;

  const operatingSections = [
    {
      id: "built-around-verification",
      icon: CheckCircle2,
      title: "Built around documents you can check",
      paragraphs: [
        "Research materials should stand on lab reports you can open and verify, not on marketing language. We sell synthetic peptides for laboratory research and publish third-party documentation for active lots.",
        "You can review identity, purity, and measured amount data for published batches before you decide whether the material fits your work.",
      ],
      linkText: "See how testing works",
      linkHref: "/testing",
    },
    {
      id: "independent-laboratory-documentation",
      icon: FileCheck,
      title: "Independent lab reports",
      paragraphs: [
        "We do not publish our own in-house HPLC or mass spectrometry reports. Published testing is done by Janoshik Analytical, an independent lab.",
        "Each Certificate of Analysis covers purity, identity, and measured amount for the tested sample. Reports include a task number so you can confirm the original file on the lab's site.",
      ],
      linkText: "View batch reports",
      linkHref: "/coa",
    },
    {
      id: "batch-transparency",
      icon: Layers,
      title: "One report, one batch",
      paragraphs: [
        "A report applies to the lot and sample named on that document. It does not cover other lots.",
        "Every product currently for sale has a published lot report. Coming Soon items stay unavailable until testing is finished and published.",
      ],
      linkText: "Look up a lot or task number",
      linkHref: "/coa",
    },
    {
      id: "what-analytical-reports-do-not-establish",
      icon: AlertCircle,
      title: "What the report does not cover",
      paragraphs: [
        "HPLC purity and mass results speak to identity, reported purity, and measured amount for the tested sample.",
        "Unless another test is listed, the report does not cover sterility, endotoxin status, or biological safety. Materials are for laboratory research only.",
      ],
      linkText: "Read testing details",
      linkHref: "/testing",
    },
    {
      id: "us-fulfillment",
      icon: Truck,
      title: "U.S. shipping",
      paragraphs: [
        "We ship from Phoenix, Arizona. Packages are packed to protect vials in normal domestic transit.",
        "Most orders process within 1 to 2 business days after payment clears, with tracking to all 50 U.S. states.",
      ],
      linkText: "Shipping rates and timing",
      linkHref: "/shipping",
    },
    {
      id: "research-support",
      icon: LifeBuoy,
      title: "Support",
      paragraphs: [
        "Ask us about lot documents, order status, tracking, or product specs.",
        "We do not advise on dosing, human use, or clinical protocols. For order or documentation help, contact us.",
      ],
      linkText: "Contact support",
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
              <p className="mono text-accent">HOW WE WORK</p>
              <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink md:text-3xl">
                Clear documents over marketing claims.
              </h2>
              <p className="text-base leading-relaxed text-ash md:text-lg">
                We publish batch reports, ship in the U.S., and keep support focused on orders and documentation.
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
