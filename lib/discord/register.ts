import { getDiscordConfig } from "./config";
import { DISCORD_V1_COMMANDS } from "./commands";
import { recordCommandRegistration } from "./store";

/**
 * Explicit admin-only Discord command registration.
 * Never logs the bot token.
 */
export async function registerDiscordCommands(): Promise<{
  ok: boolean;
  scope: string;
  commandCount: number;
  errorSummary?: string;
}> {
  const cfg = getDiscordConfig();
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!cfg.applicationId || !token) {
    return {
      ok: false,
      scope: "none",
      commandCount: 0,
      errorSummary: "Discord application id or bot token not configured.",
    };
  }

  const scope = cfg.guildId ? "guild" : "global";
  const url = cfg.guildId
    ? `https://discord.com/api/v10/applications/${cfg.applicationId}/guilds/${cfg.guildId}/commands`
    : `https://discord.com/api/v10/applications/${cfg.applicationId}/commands`;

  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(DISCORD_V1_COMMANDS),
    });
    const text = await res.text();
    if (!res.ok) {
      const safe = text.slice(0, 300).replace(token, "[redacted]");
      await recordCommandRegistration({
        scope,
        ok: false,
        commandCount: 0,
        errorSummary: `Discord API ${res.status}: ${safe}`,
      });
      return {
        ok: false,
        scope,
        commandCount: 0,
        errorSummary: `Discord API ${res.status}`,
      };
    }
    await recordCommandRegistration({
      scope,
      ok: true,
      commandCount: DISCORD_V1_COMMANDS.length,
    });
    return {
      ok: true,
      scope,
      commandCount: DISCORD_V1_COMMANDS.length,
    };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message.slice(0, 200) : "Registration failed";
    await recordCommandRegistration({
      scope,
      ok: false,
      commandCount: 0,
      errorSummary: msg.replace(token, "[redacted]"),
    });
    return { ok: false, scope, commandCount: 0, errorSummary: msg };
  }
}
