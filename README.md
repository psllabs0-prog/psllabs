This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Structured data (JSON-LD)

Product, FAQ, Article, and Organization schema are embedded on key pages as
`<script type="application/ld+json">` tags. After deploy, validate with Google’s
[Rich Results Test](https://search.google.com/test/rich-results).

## Analytics (Plausible)

Privacy-friendly analytics is loaded on every page via the root layout. Custom events:

| Event | When it fires |
| --- | --- |
| `checkout_started` | User clicks Continue to Bitcoin or card payment |
| `newsletter_signup` | Newsletter form succeeds |
| `purchase` | BTCPay or Tagada webhook confirms payment (server-side Events API) |

View reports at [plausible.io](https://plausible.io) after signing in to the PSL Labs site dashboard. Goal/conversion funnels can be built from the custom event names above.

## Inventory admin

Password-protected inventory management lives at `/admin-inventory`. Set `ADMIN_PASSWORD` in the environment. Stock updates are written to Postgres and recorded in `stock_history`.

## Transactional email

Order emails use Porkbun SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, optional `SMTP_PORT`). All messages send from `support@psllabs.org`.

| Email | Trigger |
| --- | --- |
| Order confirmation | Payment confirmed (BTCPay / Tagada webhook or card checkout) |
| Order shipped | Admin saves a tracking number on `/admin-ledger` |
| Delivery follow-up | Daily cron, 7 days after tracking was saved |

### Cron jobs (Vercel)

Set `CRON_SECRET` in the environment. Vercel invokes these routes on the schedule in `vercel.json`:

| Path | Schedule (UTC) | Purpose |
| --- | --- | --- |
| `/api/cron/delivery-followup` | `0 14 * * *` (daily at 14:00 UTC) | Post-delivery follow-up email with Trustpilot link |
| `/api/cron/low-stock` | `0 15 * * *` (daily at 15:00 UTC) | Low-stock alert to operations |

Manual test (local or staging):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/delivery-followup
```

## Getting Started


First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
