import { redirect } from "next/navigation";

export const metadata = { title: "PSL Labs", robots: { index: false, follow: false } };

export default function ResearchAccountPage() {
  redirect("/products");
}
