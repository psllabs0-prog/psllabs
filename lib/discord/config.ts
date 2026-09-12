export function isDiscordBotEnabled(): boolean {
  return process.env.DISCORD_BOT_ENABLED?.trim() === "true";
}

export function isDiscordTestMode(): boolean {
  return process.env.DISCORD_TEST_MODE?.trim() === "true";
}

export function getDiscordConfig(): {
  applicationId: string | null;
  publicKey: string | null;
  botTokenConfigured: boolean;
  guildId: string | null;
  inviteUrl: string;
  rateLimitPerMinute: number;
  enabled: boolean;
  ready: boolean;
} {
  const applicationId = process.env.DISCORD_APPLICATION_ID?.trim() || null;
  const publicKey = process.env.DISCORD_PUBLIC_KEY?.trim() || null;
  const botTokenConfigured = Boolean(process.env.DISCORD_BOT_TOKEN?.trim());
  const guildId = process.env.DISCORD_GUILD_ID?.trim() || null;
  const inviteRaw =
    process.env.DISCORD_INVITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_DISCORD_INVITE_URL?.trim() ||
    "https://discord.gg/Jhavgx3HB4";
  let inviteUrl = "https://discord.gg/Jhavgx3HB4";
  try {
    const u = new URL(inviteRaw);
    if (u.protocol === "https:") inviteUrl = u.toString();
  } catch {
    // keep default
  }

  const rateLimitPerMinute = (() => {
    const n = Number(process.env.DISCORD_RATE_LIMIT_PER_MINUTE?.trim() ?? "10");
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
  })();

  const enabled = isDiscordBotEnabled();
  const ready = Boolean(applicationId && publicKey && botTokenConfigured);

  return {
    applicationId,
    publicKey,
    botTokenConfigured,
    guildId,
    inviteUrl,
    rateLimitPerMinute,
    enabled,
    ready,
  };
}

/** Never return secrets — for admin UI only. */
export function getDiscordAdminStatusSafe() {
  const c = getDiscordConfig();
  return {
    enabled: c.enabled,
    applicationConfigured: Boolean(c.applicationId),
    publicKeyConfigured: Boolean(c.publicKey),
    botTokenConfigured: c.botTokenConfigured,
    guildIdConfigured: Boolean(c.guildId),
    inviteUrl: c.inviteUrl,
    rateLimitPerMinute: c.rateLimitPerMinute,
    testMode: isDiscordTestMode(),
    ready: c.ready,
  };
}
