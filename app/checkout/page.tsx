import type { Metadata } from "next";

import { CheckoutPage } from "@/components/checkout/checkout-page";
import { createPageMetadata } from "@/lib/seo";
import { isDesignPreview } from "@/lib/design-preview";

export const metadata: Metadata = createPageMetadata({
  title: "Checkout",
  description:
    "Review your PSL Labs order details and shipping information before completing checkout.",
  path: "/checkout",
});

export default function Page() {
  return <CheckoutPage visualPreview={isDesignPreview()} />;
}
