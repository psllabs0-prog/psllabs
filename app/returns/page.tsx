import type { Metadata } from "next";

import { ReturnsPage } from "@/components/returns/returns-page";
import { returnsPageMeta } from "@/lib/content/returns";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: returnsPageMeta.title,
  description: returnsPageMeta.description,
  path: "/returns",
});

export default function Page() {
  return <ReturnsPage />;
}
