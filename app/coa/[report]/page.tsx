import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BatchTestingCard } from "@/components/product/batch-testing-card";
import { SiteBreadcrumbs } from "@/components/seo/site-breadcrumbs";
import {
  formatLabelAmount,
  getReportPageReportBySlug,
  getReportPageReports,
  reportPagePath,
  reportPageSlug,
} from "@/lib/batch-reports/report-pages";
import { getProduct } from "@/lib/products";
import { productPathFromHandle } from "@/lib/products/catalog";
import { createPageMetadata } from "@/lib/seo";

/**
 * One page per published laboratory report (for example /coa/janoshik-226457).
 * Facts only, from lib/batch-reports: no new claims, no Review/Rating markup (BreadcrumbList only).
 * The body reuses the existing BatchTestingCard and the product page's research-use notice.
 */
type PageProps = { params: Promise<{ report: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return getReportPageReports().map((report) => ({ report: reportPageSlug(report) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { report: slug } = await params;
  const report = getReportPageReportBySlug(slug);
  if (!report) return { title: "Report not found", robots: { index: false, follow: false } };

  return createPageMetadata({
    title: `${report.laboratory} Report ${report.taskNumber}: ${report.product} ${formatLabelAmount(report.nominalStrength)}, Batch ${report.batch}`,
    description: report.reportAltText,
    path: reportPagePath(report)!,
  });
}

export default async function BatchReportPage({ params }: PageProps) {
  const { report: slug } = await params;
  const report = getReportPageReportBySlug(slug);
  if (!report) notFound();

  const path = reportPagePath(report)!;
  const labelAmount = formatLabelAmount(report.nominalStrength);
  const productHref = productPathFromHandle(report.productHandle);
  const product = getProduct(report.productHandle);
  const otherReports = getReportPageReports().filter((candidate) => candidate !== report);

  return (
    <main className="public-page-surface">
      <div className="mx-auto max-w-[960px] px-6 py-16 md:px-16 md:py-20 lg:px-24 lg:py-24">
        <SiteBreadcrumbs
          items={[
            { name: "Home", path: "/" },
            { name: "Batch reports", path: "/coa" },
            { name: `${report.laboratory} ${report.taskNumber}`, path },
          ]}
        />
        <header className="public-page-header mb-10 flex max-w-3xl flex-col gap-5 md:mb-12">
          <p className="mono text-accent">BATCH REPORTS</p>
          <h1 className="font-display text-display-lg font-bold text-ink">
            {report.laboratory} Report {report.taskNumber}{" "}
            <span className="mt-2 block text-xl font-medium text-ash md:text-2xl">
              {report.product} {labelAmount} · Batch {report.batch}
            </span>
          </h1>
          <p className="text-body-lg leading-relaxed text-ash">{report.reportAltText}</p>
          <p className="text-sm">
            <Link
              href={productHref}
              className="mono font-semibold text-accent underline underline-offset-4 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {report.product} {labelAmount} product page →
            </Link>
          </p>
        </header>

        <BatchTestingCard report={report} />

        {otherReports.length > 0 && (
          <section className="mt-12 flex flex-col gap-4" aria-labelledby="other-reports">
            <h2 id="other-reports" className="font-display text-xl font-bold text-ink md:text-2xl">
              Published reports
            </h2>
            <ul className="grid gap-2 text-sm">
              {otherReports.map((other) => (
                <li key={other.taskNumber}>
                  <Link
                    href={reportPagePath(other)!}
                    className="inline-flex min-h-11 items-center text-accent underline underline-offset-4 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {other.laboratory} {other.taskNumber}: {other.product} {formatLabelAmount(other.nominalStrength)}, Batch {other.batch}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-12 border-t border-linen pt-6 text-xs leading-relaxed text-ash" aria-label="Research-use notice">
          <p>{product?.researchDisclaimer ?? "For laboratory research only. Not for human or animal use."}</p>
          <p className="mt-2">
            <Link href="/disclaimer#product-label-information" className="text-accent underline underline-offset-4 hover:opacity-80">
              Read the full product disclaimer
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
