import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const resources = [
  { href: "/track", label: "Track your order" },
  { href: "/coa", label: "Find a batch report" },
  { href: "/guides/verify-peptide-laboratory-report", label: "Check a laboratory report" },
  { href: "/guides/peptide-purity-vs-content", label: "Understand purity and amount" },
];

export function OrderResources() {
  return (
    <section className="public-section-card mt-8 p-5 md:p-6" aria-labelledby="order-resources-title">
      <h2 id="order-resources-title" className="font-display text-lg font-bold text-ink">
        Your order documents
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-ash">
        Keep your order number, vial label and original laboratory report together.
        Match the product, strength and batch on your label before saving a report
        for your research records.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {resources.map((resource) => (
          <li key={resource.href}>
            <Link href={resource.href} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border-strong px-3 py-3 text-sm text-ink hover:border-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              {resource.label}<ArrowUpRight className="size-4 shrink-0 text-accent" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm leading-relaxed text-ash">
        Can&apos;t match a report, or have a question about your order?{" "}
        <Link href="/contact" className="text-accent underline underline-offset-4">Contact us</Link>
        {" "}with your order number and the details on your label.
      </p>
    </section>
  );
}
