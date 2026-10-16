import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Fulfillment — PSL Labs",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function ManualFulfillmentTestPage() {
  redirect("/admin-fulfillment");
}
