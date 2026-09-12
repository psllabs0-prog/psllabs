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
  answerProducts,
  answerShipping,
  answerSupport,
  matchKnownPublicBatch,
  matchKnownPublicProduct,
} from "../lib/discord/answers";
import {
  getDiscordConfig,
  getDiscordAdminStatusSafe,
  isDiscordBotEnabled,
} from "../lib/discord/config";
import { hashDiscordUserId } from "../lib/discord/store";
import { canCreateContentOpportunityFromTheme } from "../lib/customer-intelligence/guardrails";
import { createHmac } from "node:crypto";
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
  assert(/cfg\.ready/.test(route), "interactions uses full readiness gate");
  assert(/Discord bot not ready/.test(route), "incomplete config => 503");
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

  const coaUnknown = answerCoa("made-up-batch-xyz");
  assert(/will not invent/i.test(coaUnknown.content), "/coa does not invent batch");
  assert(!/made-up-batch-xyz/i.test(coaUnknown.content), "unknown hint not echoed");
  assert(coaUnknown.ephemeral === true, "freeform unknown COA hint ephemeral");

  const coaGeneric = answerCoa();
  assert(coaGeneric.ephemeral === false, "no-hint COA can be public");
  assert(/coa|certificate|report/i.test(coaGeneric.content), "generic COA guidance");

  const known = matchKnownPublicProduct("Retatrutide");
  assert(known?.handle === "retatrutide", "known public product matches");
  const coaKnown = answerCoa("Retatrutide");
  assert(/Retatrutide/i.test(coaKnown.content), "known product => specific");
  assert(coaKnown.ephemeral === false, "known public product COA can be public");

  const coaEmail = answerCoa("please check order for luke@example.com");
  assert(!/luke@example\.com/i.test(coaEmail.content), "email not echoed");
  assert(coaEmail.ephemeral === true, "PII-like COA hint ephemeral");

  const coaHuman = answerCoa("retatrutide for weight loss");
  assert(coaHuman.category === "restricted_human_use_request", "human-use COA boundary");
  assert(coaHuman.riskLevel === "restricted", "human-use restricted");

  assert(matchKnownPublicBatch("totally-private-inbound-xyz") === null, "unknown batch null");
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
  // Restricted gate runs before inventory/pricing lookup.
  const productsFn = ansSrc.slice(ansSrc.indexOf("export async function answerProducts"));
  const restrictedIdx = productsFn.indexOf("textLooksRestrictedHumanUse");
  const lookupIdx = productsFn.indexOf("lookupSellableAvailabilitySummary");
  assert(
    restrictedIdx > 0 && lookupIdx > restrictedIdx,
    "/products checks human-use before pricing/availability"
  );

  // Restricted paths return before DB lookup — safe offline.
  const restricted = await answerProducts("retatrutide for weight loss");
  assert(
    restricted.category === "restricted_human_use_request",
    "/products human-use => boundary"
  );
  assert(restricted.ephemeral === true, "/products boundary ephemeral");
  assert(!/\$\d/.test(restricted.content), "/products restricted: no pricing");
  assert(
    !canCreateContentOpportunityFromTheme(restricted.category),
    "restricted products feeds compliance only"
  );

  const dosing = await answerProducts("retatrutide dosing schedule");
  assert(dosing.riskLevel === "restricted", "dosing phrase => boundary");

  // Normal product catalog line (no DB required for this assertion).
  assert(
    matchKnownPublicProduct("retatrutide")?.name === "Retatrutide",
    "normal retatrutide resolves to public catalog product"
  );
}

function testHashAndReadiness() {
  const prev = {
    enabled: process.env.DISCORD_BOT_ENABLED,
    app: process.env.DISCORD_APPLICATION_ID,
    pub: process.env.DISCORD_PUBLIC_KEY,
    token: process.env.DISCORD_BOT_TOKEN,
    hash: process.env.DISCORD_ANALYTICS_HASH_SECRET,
  };

  delete process.env.DISCORD_ANALYTICS_HASH_SECRET;
  process.env.DISCORD_BOT_ENABLED = "true";
  process.env.DISCORD_APPLICATION_ID = "app";
  process.env.DISCORD_PUBLIC_KEY = "ab".repeat(32);
  process.env.DISCORD_BOT_TOKEN = "token";
  assert(getDiscordConfig().ready === false, "secret missing => bot not ready");
  assert(
    getDiscordAdminStatusSafe().analyticsHashConfigured === false,
    "admin shows hashing no"
  );
  assert(hashDiscordUserId("12345") === null, "no hash without secret");

  process.env.DISCORD_ANALYTICS_HASH_SECRET = "test-secret-for-hmac";
  assert(getDiscordConfig().ready === true, "secret present + ids => ready");
  assert(
    getDiscordAdminStatusSafe().analyticsHashConfigured === true,
    "admin shows hashing yes"
  );
  const h1 = hashDiscordUserId("12345");
  const h2 = hashDiscordUserId("12345");
  assert(typeof h1 === "string" && h1 === h2, "stable HMAC hash");
  assert(h1 !== "12345", "raw Discord id never returned as hash");
  const expected = createHmac("sha256", "test-secret-for-hmac")
    .update("12345")
    .digest("hex");
  assert(h1 === expected, "HMAC matches expected");

  const storeSrc = readFileSync(
    join(process.cwd(), "lib/discord/store.ts"),
    "utf8"
  );
  assert(
    /if\s*\(\s*!userHash\s*\)[\s\S]*allowed:\s*false/.test(storeSrc),
    "rate limiter fails closed without hash"
  );
  assert(!/CRON_SECRET/.test(storeSrc), "does not use CRON_SECRET");

  // restore
  for (const [k, v] of Object.entries({
    DISCORD_BOT_ENABLED: prev.enabled,
    DISCORD_APPLICATION_ID: prev.app,
    DISCORD_PUBLIC_KEY: prev.pub,
    DISCORD_BOT_TOKEN: prev.token,
    DISCORD_ANALYTICS_HASH_SECRET: prev.hash,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
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
  assert(
    typeof status.analyticsHashConfigured === "boolean",
    "analytics hash configured flag present"
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

  const dash = readFileSync(
    join(process.cwd(), "components/admin/admin-discord-dashboard.tsx"),
    "utf8"
  );
  assert(
    /Analytics\/rate-limit hashing configured/.test(dash),
    "admin UI shows hashing configured"
  );
}

async function main() {
  console.log("[test:discord] start");
  testSignatureVerification();
  testSanitizeAndMentions();
  testAnswers();
  await testProductsNoInbound();
  testHashAndReadiness();
  testAdminAndDisabled();
  console.log("[test:discord] ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
