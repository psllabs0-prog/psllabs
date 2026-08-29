/** Discord community invite — exposed to the client via NEXT_PUBLIC_ prefix. */
export function getDiscordInviteUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
