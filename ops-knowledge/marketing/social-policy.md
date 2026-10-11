---
status: approved
owner: Luke
last_reviewed: 2026-10-11
---

# Social policy

Sources: `lib/navigation.ts`, `lib/discord/config.ts`.

## Retired community channel

- The owner removed the Discord server. Do not promote, invite users to, or send messages to that channel.
- Public invite links and the active admin tool have been removed. Legacy tool bookmarks return to `/admin`, which retains its existing authentication.
- Bot interactions and command registration are disabled in code, regardless of old deployment environment flags. Historical records remain intact.

## Paid social acquisition

- Meta + TikTok sync via `/api/cron/paid-acquisition-sync` (`0 11 * * *` UTC).
- Admin: `/admin-acquisition`, `/admin-attribution`.

## Prohibited social content

Follow [compliance/prohibited-content.md](../compliance/prohibited-content.md) and RUO rules — no dosing, medical claims, before/after outcome marketing, or drug comparisons.
