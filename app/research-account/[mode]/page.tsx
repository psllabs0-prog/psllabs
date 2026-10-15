import { notFound } from "next/navigation";
import { ResearchAccountForm, type ResearchFormMode } from "@/components/research-auth/research-account-form";
import { createPageMetadata } from "@/lib/seo";

const modes = ["sign-in", "sign-up", "forgot-password", "reset-password"] as const;
type Props = { params: Promise<{ mode: string }>; searchParams: Promise<{ next?: string; token?: string }> };

export async function generateMetadata({ params }: Props) {
  const { mode } = await params;
  return { ...createPageMetadata({ title: mode === "sign-up" ? "Create a Research Account" : mode.includes("password") ? "Research Account Password" : "Research Account Sign In", description: "Secure PSL Labs research-account access. Research use only, not for human or animal consumption.", path: `/research-account/${mode}` }), robots: { index: false, follow: false } };
}

export default async function AccountEntryPage({ params, searchParams }: Props) {
  const { mode } = await params;
  if (!modes.includes(mode as ResearchFormMode)) notFound();
  const query = await searchParams;
  return <ResearchAccountForm mode={mode as ResearchFormMode} nextPath={query.next} token={query.token} />;
}
