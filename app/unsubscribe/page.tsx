import type { Metadata } from "next";

import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Unsubscribe",
  description: "Unsubscribe from PSL Labs marketing email.",
  path: "/unsubscribe",
});

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-page px-6 py-16 md:px-16">
      <div className="mx-auto max-w-lg">
        <h1 className="font-display text-display-lg font-bold text-ink">
          Marketing email preferences
        </h1>
        {params.done === "1" ? (
          <p className="mt-4 text-sm text-ash">
            You are unsubscribed from PSL Labs marketing emails. Transactional
            order and support messages are unaffected.
          </p>
        ) : params.error === "1" ? (
          <p className="mt-4 text-sm text-ash">
            That unsubscribe link is invalid or expired. Contact support@psllabs.org
            if you need help.
          </p>
        ) : params.token ? (
          <form action="/api/marketing/unsubscribe" method="get" className="mt-6">
            <input type="hidden" name="token" value={params.token} />
            <p className="text-sm text-ash">
              Confirm unsubscribe from marketing emails only (not order or support
              mail).
            </p>
            <button
              type="submit"
              className="mt-4 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white"
            >
              Unsubscribe
            </button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-ash">
            Use the unsubscribe link from a marketing email, or contact
            support@psllabs.org.
          </p>
        )}
      </div>
    </main>
  );
}
