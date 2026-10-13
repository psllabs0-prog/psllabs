import Link from "next/link";

export default function NotFound() {
  return (
    <main className="storefront-not-found">
      <p className="storefront-error-code">404 / PAGE NOT FOUND</p>
      <h1>This page isn’t in the catalog.</h1>
      <p>The link may have changed. Browse current materials or find a published batch report below.</p>
      <div>
        <Link href="/products">View product catalog <span aria-hidden="true">↗</span></Link>
        <Link href="/coa">Find a batch report <span aria-hidden="true">↗</span></Link>
      </div>
    </main>
  );
}
