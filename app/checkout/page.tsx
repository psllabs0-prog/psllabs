import type { Metadata } from "next";

import { CheckoutPage } from "@/components/checkout/checkout-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Checkout",
  description:
    "Complete institutional procurement of PSL Labs laboratory research materials. Review order details and shipping information.",
  path: "/checkout",
});

export default function Page() {
  return <CheckoutPage />;
}
