import Link from "next/link";
import { Truck } from "lucide-react";

import { FLAT_SHIPPING_USD, FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";
import styles from "./storefront-shell.module.css";

export function AnnouncementBar() {
  return (
    <aside aria-label="Shipping information" className={styles.shipping}>
      <Link
        href="/shipping"
        aria-label={`$${FLAT_SHIPPING_USD} U.S. shipping. Free on product subtotals of $${FREE_SHIPPING_THRESHOLD} or more. View shipping details.`}
      >
          <Truck
            className="hidden size-4 shrink-0 text-accent sm:block"
            strokeWidth={1.75}
            aria-hidden
          />

          <p>
              ${FLAT_SHIPPING_USD} U.S. shipping · Free on product subtotals of $
              {FREE_SHIPPING_THRESHOLD} or more
          </p>
      </Link>
    </aside>
  );
}
