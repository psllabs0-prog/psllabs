import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Retired tool bookmarks return to the existing authenticated admin hub. */
export default function RetiredCommunityPage() {
  redirect("/admin");
}
