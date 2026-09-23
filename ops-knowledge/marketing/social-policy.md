---
status: approved
owner: Luke
last_reviewed: 2026-09-23
---

# Social policy

Sources: `lib/social.ts`, `lib/discord/*`, `/admin-discord`.

## Discord

- Public invite URL is configured via `NEXT_PUBLIC_DISCORD_INVITE_URL`, with a coded default invite in `lib/social.ts`.
- Discord bot / interactions are implemented under `lib/discord/` and `/api/discord/interactions`.
- Answer behavior is constrained to approved knowledge and RUO boundaries; channel answers must not leak order PII (see Discord answer modules / tests).

**NEEDS OWNER CONFIRMATION:** Whether the coded default invite remains the canonical public Discord link for all marketing surfaces.

## Paid social acquisition

- Meta + TikTok sync via `/api/cron/paid-acquisition-sync` (`0 11 * * *` UTC).
- Admin: `/admin-acquisition`, `/admin-attribution`.

## Prohibited social content

Follow [compliance/prohibited-content.md](../compliance/prohibited-content.md) and RUO rules — no dosing, medical claims, before/after outcome marketing, or drug comparisons.
