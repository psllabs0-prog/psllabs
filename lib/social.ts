/** Default PSL Labs community invite — used when env is unset in local dev. */
export const DEFAULT_DISCORD_INVITE_URL = "https://discord.gg/Jhavgx3HB4";

/** Discord community invite — `NEXT_PUBLIC_DISCORD_INVITE_URL` in env. */
export function getDiscordInviteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL?.trim();

  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === "https:") {
        return url.toString();
      }
    } catch {
      // fall through to default
    }
  }

  return DEFAULT_DISCORD_INVITE_URL;
}
