import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";

import { TestingScopeExplainer } from "@/components/testing/testing-scope-explainer";
import { getBatchReportsForProduct, formatReportedPurity } from "@/lib/batch-reports";
import { formatPrice } from "@/lib/cart/format";
import type { ProductAvailability } from "@/lib/inventory/availability";
import type { Product } from "@/lib/products";
import { getCatalogProductByHandle } from "@/lib/products/catalog";
import { getProductImage } from "@/lib/products/images";

import { MobileStickyCart } from "./mobile-sticky-cart";
import { ProductArtworkDialog } from "./product-artwork-dialog";
import { ProductArtworkNotice } from "./product-artwork-notice";
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
  const fallbackImage = getProductImage(product.handle);
  const imageSrc = product.imageSrc ?? fallbackImage.src;
  const imageAlt = product.imageAlt ?? fallbackImage.alt;
  const strength = catalog?.strength.replace(/(\d)(mg|ml)$/i, "$1 $2");

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
            <h1>{product.name}{strength ? <span className={styles.strength}>{strength}</span> : null}</h1>
            <p className={styles.shortDescription}>{product.shortDescription}</p>
            <p className={styles.titlePrice}>{formatPrice(product.price)}<span>per vial</span></p>
          </div>

          <div className={styles.productMedia}>
            <div className={styles.imageWell}>
              <div className={styles.imageFrame}>
                <Image src={imageSrc} alt={imageAlt} fill preload sizes="(max-width: 800px) 180px, 200px" className={styles.vialImage} />
              </div>
              <div className={styles.imageCaption}>
                <span>Existing product artwork</span>
                <ProductArtworkDialog src={imageSrc} alt={imageAlt} name={product.name} strength={catalog?.strength} />
              </div>
            </div>
            <div className={styles.mediaMeta}><span>{catalog?.sku}</span><span>Not for human or animal use.</span></div>
            <ProductArtworkNotice handle={product.handle} className={styles.labelNotice} />
          </div>

          <div className={styles.purchaseArea}>
            <ProductPurchase productHandle={product.handle} stockStatus={product.stockStatus} availability={availability} />
            {report ? (
              <section className={styles.batchSummary} aria-label="Published batch summary">
                <div className={styles.batchHeading}><h2>Published batch report</h2><FileText size={18} aria-hidden /></div>
                <p className={styles.mono}>{report.batch} · {report.laboratory}</p>
                <dl className={styles.batchMetrics}>
                  {report.purityPercent !== undefined ? <div><dt>Reported purity</dt><dd>{formatReportedPurity(report.purityPercent)}</dd></div> : null}
                  {report.reportedResult ? <div><dt>{report.reportedResult.label}</dt><dd>{report.reportedResult.value}</dd></div> : report.reportedAmountMg !== undefined ? <div><dt>Amount measured</dt><dd>{report.reportedAmountMg} mg</dd></div> : null}
                </dl>
                <p className={styles.scopeNote}>Results apply only to the tested sample and batch. Label amount: {strength ?? report.nominalStrength}.</p>
                <div className={styles.batchActions}>
                  <a href={report.reportUrl} target="_blank" rel="noopener noreferrer">View original report <ArrowUpRight size={16} aria-hidden /></a>
                  <a href={report.verificationUrl} target="_blank" rel="noopener noreferrer">Verify with Janoshik <ArrowUpRight size={16} aria-hidden /></a>
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
          <h2>What the results mean</h2>
          <TestingScopeExplainer showPolicy={false} headingLevel={3} reportKind={product.handle === "reconstitution-solution" ? "solution" : "peptide"} />
        </section>

        <section className={`${styles.container} ${styles.disclaimer}`} aria-label="Research-use notice">
          <p>{product.researchDisclaimer ?? "For laboratory research only. Not for human or animal use."}</p>
          <p>Laboratory reports cover only the submitted sample and tests reported; they do not establish safety, efficacy or suitability for human or animal use.</p>
        </section>

        <MobileStickyCart productHandle={product.handle} productName={`${product.name}${strength ? ` · ${strength}` : ""}`} stockStatus={availability.status} availability={availability} />
      </main>
    </ProductQuantityProvider>
  );
}
