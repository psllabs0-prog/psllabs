/**
 * Offline tests for Phase 12 Discord agent.
 * Run: npm run test:discord
 */
import { createPrivateKey, sign, generateKeyPairSync } from "node:crypto";
import { verifyDiscordRequest } from "../lib/discord/verify";
import {
  DISCORD_ALLOWED_MENTIONS,
  looksLikeOrderPiiRequest,
  sanitizeDiscordInput,
} from "../lib/discord/sanitize";
import {
  answerAsk,
  answerCoa,
  answerShipping,
  answerSupport,
} from "../lib/discord/answers";
import { isDiscordBotEnabled, getDiscordAdminStatusSafe } from "../lib/discord/config";
import { canCreateContentOpportunityFromTheme } from "../lib/customer-intelligence/guardrails";
import { readFileSync } from "fs";
import { join } from "path";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function testSignatureVerification() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubJwk = publicKey.export({ format: "jwk" }) as { x?: string };
  // Convert JWK x (base64url) to hex raw key for Discord-style verify
  const rawPub = Buffer.from(pubJwk.x!, "base64url");
  const publicKeyHex = rawPub.toString("hex");

  const timestamp = "1234567890";
  const rawBody = JSON.stringify({ type: 1 });
  const message = Buffer.from(timestamp + rawBody);

  const signature = sign(null, message, privateKey);
  const signatureHex = signature.toString("hex");

  assert(
    verifyDiscordRequest({
      publicKeyHex,
      signatureHex,
      timestamp,
      rawBody,
    }) === true,
    "valid Discord signature accepted"
  );

  assert(
    verifyDiscordRequest({
      publicKeyHex,
      signatureHex: "00".repeat(64),
      timestamp,
      rawBody,
    }) === false,
    "invalid signature rejected"
  );

  // Route must verify before JSON — confirm interactions route uses text() first
  const route = readFileSync(
    join(process.cwd(), "app/api/discord/interactions/route.ts"),
    "utf8"
  );
  const textIdx = route.indexOf("await request.text()");
  const parseIdx = route.indexOf("JSON.parse(rawBody)");
  assert(textIdx > 0 && parseIdx > textIdx, "raw body before JSON parse");
  assert(/status:\s*401/.test(route), "invalid signature => 401");
  assert(/type === 1/.test(route) && /type:\s*1/.test(route), "PING => PONG");
}

function testSanitizeAndMentions() {
  const s = sanitizeDiscordInput("hello @everyone visit https://evil.test dosing");
  assert(!/@everyone/i.test(s), "@everyone blocked");
  assert(!/https:\/\//i.test(s), "links stripped");
  assert(DISCORD_ALLOWED_MENTIONS.parse.length === 0, "allowed_mentions empty");
}

function testAnswers() {
  const boundary = answerAsk("what injection dose should I use?");
  assert(boundary.riskLevel === "restricted", "dosing gets boundary");
  assert(boundary.ephemeral === true, "boundary ephemeral");
  assert(
    !canCreateContentOpportunityFromTheme("restricted_human_use_request"),
    "restricted cannot create content opportunity"
  );

  const order = answerAsk("where is my order?");
  assert(order.outcome === "routed_support", "order status routed private");
  assert(order.ephemeral === true, "order route ephemeral");
  assert(looksLikeOrderPiiRequest("where is my order"), "pii detect");

  const support = answerSupport();
  assert(support.ephemeral === true, "/support ephemeral");
  assert(!/SELECT|orders/i.test(support.content), "/support no order query");

  const shipping = answerShipping();
  assert(/ship/i.test(shipping.content), "/shipping from policy");
  assert(shipping.responseSource === "policy:shipping", "approved policy only");

  const coa = answerCoa("made-up-batch-xyz");
  assert(/will not invent/i.test(coa.content), "/coa does not invent batch");
}

async function testProductsNoInbound() {
  // Offline: assert the sellable lookup helper never exposes inbound/pipeline.
  const src = readFileSync(
    join(process.cwd(), "lib/support/inventory-lookup.ts"),
    "utf8"
  );
  assert(/sellable stock only/i.test(src), "sellable-only documented");
  assert(!/inboundPipeline|orderedInbound|awaitingTesting/.test(src), "no inbound fields");

  const ansSrc = readFileSync(
    join(process.cwd(), "lib/discord/answers.ts"),
    "utf8"
  );
  assert(
    /lookupSellableAvailabilitySummary/.test(ansSrc),
    "/products uses sellable summary"
  );
  assert(
    /not internal unit counts/i.test(ansSrc),
    "unit counts explicitly withheld"
  );
}

function testAdminAndDisabled() {
  process.env.DISCORD_BOT_ENABLED = "false";
  assert(isDiscordBotEnabled() === false, "disabled");
  const status = getDiscordAdminStatusSafe();
  assert(!("botToken" in status), "token never in admin status");
  assert(
    status.botTokenConfigured === false ||
      typeof status.botTokenConfigured === "boolean",
    "bot token only as boolean"
  );

  const reg = readFileSync(
    join(process.cwd(), "lib/discord/register.ts"),
    "utf8"
  );
  assert(/replace\(token,\s*"\[redacted\]"\)/.test(reg), "registration never logs token");
  const adminRoute = readFileSync(
    join(process.cwd(), "app/api/admin/discord/route.ts"),
    "utf8"
  );
  assert(/requireAdminAuth/.test(adminRoute), "command registration requires admin");
}

async function main() {
  console.log("[test:discord] start");
  testSignatureVerification();
  testSanitizeAndMentions();
  testAnswers();
  await testProductsNoInbound();
  testAdminAndDisabled();
  console.log("[test:discord] ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
