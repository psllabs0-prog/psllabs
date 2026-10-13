import type { Metadata } from "next";

import { ReturnsPage } from "@/components/returns/returns-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Returns, Refunds and Research Order Issues",
  description: "How to report damaged, incorrect or documentation-related PSL Labs orders. Review return eligibility, evidence to provide and the case-by-case resolution process.",
  path: "/returns",
});

export default function Page() {
  return <ReturnsPage />;
}
