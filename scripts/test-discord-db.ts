/**
 * DB smoke for Discord schema + duplicate interaction safety.
 * Run: npm run test:discord-db
 */
import { loadEnvLocal } from "./_env";
import {
  ensureDiscordSchema,
  recordDiscordInteraction,
  checkDiscordRateLimit,
} from "@/lib/discord/store";

loadEnvLocal();

async function main() {
  console.log("[test:discord-db] running…");
  await ensureDiscordSchema();
  const id = `test_interaction_${Date.now()}`;
  const a = await recordDiscordInteraction({
    discordInteractionId: id,
    command: "ask",
    category: "test",
    riskLevel: "low",
    outcome: "answered",
    responseSource: "test",
    reportingExcluded: true,
    userHash: "testhash",
  });
  const b = await recordDiscordInteraction({
    discordInteractionId: id,
    command: "ask",
    category: "test",
    riskLevel: "low",
    outcome: "answered",
    responseSource: "test",
    reportingExcluded: true,
    userHash: "testhash",
  });
  if (!a.inserted) throw new Error("first insert should succeed");
  if (b.inserted) throw new Error("duplicate interaction must not insert again");

  const r1 = await checkDiscordRateLimit("rate_test_hash");
  const r2 = await checkDiscordRateLimit("rate_test_hash");
  if (r2.count < r1.count) throw new Error("rate limit should accumulate");

  console.log("[test:discord-db] all passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
