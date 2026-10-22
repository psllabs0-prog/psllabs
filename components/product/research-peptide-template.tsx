import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";
import { ProductPrice, SaleBadge } from "@/components/commerce/product-price";

import { TestingScopeExplainer } from "@/components/testing/testing-scope-explainer";
import { getBatchReportsForProduct, formatReportedPurity } from "@/lib/batch-reports";
import { reportPagePath } from "@/lib/batch-reports/report-pages";
import type { ProductAvailability } from "@/lib/inventory/availability";
import type { Product } from "@/lib/products";
import { getCatalogProductByHandle } from "@/lib/products/catalog";
import { getProductImage } from "@/lib/products/images";
import { getProductRender } from "@/lib/products/renders";

import { MobileStickyCart } from "./mobile-sticky-cart";
import { ProductFaq } from "./product-faq";
import { ProductPurchase } from "./product-purchase";
import { ProductQuantityProvider } from "./product-quantity-provider";
import { ProductSpecificationsTable } from "./product-specifications-table";
import { ProductTesting } from "./product-testing";
import styles from "./research-product.module.css";

type ResearchPeptideTemplateProps = {
  product: Product;
  availability: ProductAvailability;
};

export function ResearchPeptideTemplate({ product, availability }: ResearchPeptideTemplateProps) {
  const catalog = getCatalogProductByHandle(product.handle);
  const report = getBatchReportsForProduct(product.handle).find(
    (candidate) => candidate.status === "report_available" && Boolean(candidate.reportUrl) && candidate.sku === catalog?.sku,
  );
  const reportPath = report ? reportPagePath(report) : undefined;
  const fallbackImage = getProductImage(product.handle);
  const imageSrc = product.imageSrc ?? fallbackImage.src;
  const imageAlt = product.imageAlt ?? fallbackImage.alt;
  const render = getProductRender(product.handle);
  const strength = catalog?.strength.replace(/(\d)(mg|ml)$/i, "$1 $2");
  const firstSentenceEnd = product.shortDescription.indexOf(".");
  const leadDescription = firstSentenceEnd >= 0
    ? product.shortDescription.slice(0, firstSentenceEnd + 1)
    : product.shortDescription;

  return (
    <ProductQuantityProvider unitPrice={product.price}>
      <main className={`storefront-theme ${styles.page}`}>
        <nav aria-label="Breadcrumb" className={`${styles.container} ${styles.breadcrumbs}`}>
          <Link href="/">Home</Link><span aria-hidden>/</span>
          <Link href="/products">Products</Link><span aria-hidden>/</span>
          <span aria-current="page">{product.name}</span>
        </nav>

        <section className={`${styles.container} ${styles.productLayout}`}>
          <div className={styles.productTitle}>
            <p className={styles.eyebrow}>PSL Labs / Laboratory research</p>
            <h1>{product.name}{strength ? <>{" "}<span className={styles.strength}>{strength}</span></> : null}</h1>
            <p className={styles.shortDescription}>{leadDescription}</p>
            <p className={styles.titlePrice}><ProductPrice handle={product.handle} unitPrice={product.price} size="large" /><span>per vial</span></p>
          </div>

          <div className={styles.productMedia}>
            <div className={`${styles.imageWell}${render ? ` ${styles.renderWell}` : ""}`}>
              <div className={styles.imageRecord}>
                <span>{catalog?.sku}</span>
                <SaleBadge handle={product.handle} />
              </div>
              <div className={`${styles.imageFrame}${render ? ` ${styles.renderFrame}` : ""}`}>
                <Image src={render?.src ?? imageSrc} alt={render?.alt ?? imageAlt} fill preload sizes={render ? "(max-width: 800px) 265px, (max-width: 1100px) 340px, 500px" : "(max-width: 359px) 260px, (max-width: 800px) 286px, (max-width: 1100px) 340px, 390px"} className={styles.vialImage} />
              </div>
            </div>
            <div className={styles.mediaMeta}><span>For laboratory research only.</span>{" "}<span>Not for human or animal use.</span></div>
          </div>

          <div className={styles.purchaseArea}>
            <ProductPurchase productHandle={product.handle} stockStatus={product.stockStatus} availability={availability} nominalStrength={strength} hideSinglePriceOnMobile />
            {report ? (
              <section className={styles.batchSummary} aria-label="Published batch summary">
                <div className={styles.batchHeading}><h2>Published batch record</h2><FileText size={18} aria-hidden /></div>
                <p className={styles.mono}>{report.laboratory} · Task {report.taskNumber} · {report.analysisDate}</p>
                <p className={styles.batchIdentifier}>Batch {report.batch}</p>
                <dl className={styles.batchMetrics}>
                  {report.purityPercent !== undefined ? <div><dt>Reported purity</dt><dd>{formatReportedPurity(report.purityPercent)}</dd></div> : null}
                  {report.reportedResult ? <div><dt>{report.reportedResult.label}</dt><dd>{report.reportedResult.value}</dd></div> : report.reportedAmountMg !== undefined ? <div><dt>Amount measured</dt><dd>{report.reportedAmountMg} mg</dd></div> : null}
                </dl>
                <p className={styles.scopeNote}>Results apply only to the tested sample and batch. Label amount: {strength ?? report.nominalStrength}.</p>
                <div className={styles.batchActions}>
                  <a href={report.reportUrl} target="_blank" rel="noopener noreferrer">View original report <ArrowUpRight size={16} aria-hidden /></a>
                  <a href={report.verificationUrl} target="_blank" rel="noopener noreferrer">Verify with Janoshik <ArrowUpRight size={16} aria-hidden /></a>
                  {reportPath ? <Link href={reportPath}>{report.laboratory} report {report.taskNumber}</Link> : null}
                </div>
              </section>
            ) : <p className={styles.scopeNote}>Batch report not yet published. <Link href="/coa">Check batch documentation</Link>.</p>}
          </div>
        </section>

        <nav aria-label="Product details" className={styles.productTabs}>
          <div className={styles.container}>
            <a href="#batch-testing">Batch documentation</a>
            {product.specifications?.length ? <a href="#product-specifications">Specifications</a> : null}
            <a href="#product-questions">Questions</a>
            <Link href="/shipping">Shipping</Link>
          </div>
        </nav>

        <div className={`${styles.container} ${styles.detailsLayout}`}>
          <ProductTesting product={product} compact />
          {product.specifications?.length ? (
            <section id="product-specifications" className={styles.detailSection}>
              <h2>Product specifications</h2>
              <ProductSpecificationsTable specifications={product.specifications} />
            </section>
          ) : null}
        </div>

        <section id="product-questions" className={styles.questionsSection}>
          <div className={styles.container}>
            <h2>Questions before you order?</h2>
            <ProductFaq faqs={product.faqs} />
          </div>
        </section>

        <section className={`${styles.container} ${styles.informationSection}`}>
          <div className={styles.overview}>
            <h2>About {product.name}</h2>
            <p>{product.shortDescription}</p>
            {product.whyThisExists.split("\n\n").map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            <ul className={styles.productBullets}>{product.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
            {product.ingredients.length ? <dl className={styles.materialDetails}>{product.ingredients.map((ingredient) => <div key={ingredient.name}><dt>{ingredient.name}</dt><dd>{ingredient.dose}</dd><dd>{ingredient.mechanism}</dd></div>)}</dl> : null}
          </div>
          <div className={styles.laboratoryNotes}>
            <h2>Review before laboratory use.</h2>
            <ol>{product.howToUse.map((step) => <li key={step.step}><h3>{step.title}</h3><p>{step.description}</p></li>)}</ol>
          </div>
        </section>

        <section className={`${styles.container} ${styles.testingScope}`}>
          <details>
            <summary>What the results mean</summary>
            <TestingScopeExplainer showPolicy={false} headingLevel={3} reportKind={product.handle === "reconstitution-solution" ? "solution" : "peptide"} />
          </details>
        </section>

        <section className={`${styles.container} ${styles.disclaimer}`} aria-label="Research-use notice">
          <p>{product.researchDisclaimer ?? "For laboratory research only. Not for human or animal use."}</p>
          <p>Laboratory reports cover only the submitted sample and tests reported; they do not establish safety, efficacy or suitability for human or animal use.</p>
          <p><Link href="/disclaimer#product-label-information">Read the full product disclaimer</Link>.</p>
        </section>

        <MobileStickyCart productHandle={product.handle} productName={`${product.name}${strength ? ` · ${strength}` : ""}`} stockStatus={availability.status} availability={availability} />
      </main>
    </ProductQuantityProvider>
  );
}
