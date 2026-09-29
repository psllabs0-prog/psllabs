import twitterText from "twitter-text";

import { detectForbiddenTopic } from "@/lib/authority/guardrails";

import { X_LIMITS } from "./constants";

/**
 * Approved guidance this validator implements (ops-knowledge front matter
 * `last_reviewed`). A drift test fails when a file is re-reviewed so the
 * rules here are rechecked. Bumping it changes every preview hash.
 */
export const X_CONTENT_POLICY_VERSION =
  "compliance/prohibited-content@2026-09-23;compliance/claims-rules@2026-09-23;marketing/content-policy@2026-09-23;marketing/social-policy@2026-09-23";

export const X_CONTENT_POLICY_FILES = [
  "ops-knowledge/compliance/prohibited-content.md",
  "ops-knowledge/compliance/claims-rules.md",
  "ops-knowledge/marketing/content-policy.md",
  "ops-knowledge/marketing/social-policy.md",
] as const;

export type XContentIssue = { code: string; message: string };

export type XContentCheck = {
  text: string;
  weightedLength: number;
  maxWeightedLength: number;
  links: string[];
  errors: XContentIssue[];
  /** Must be acknowledged individually before approval. */
  warnings: XContentIssue[];
  ok: boolean;
};

const HIDDEN_CHAR_RE = /[\u0000-\u0008\u000B-\u001F\u007F\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/;

const SHORTENER_HOSTS = new Set([
  "t.co",
  "bit.ly",
  "tinyurl.com",
  "goo.gl",
  "ow.ly",
  "buff.ly",
  "is.gd",
  "rebrand.ly",
  "cutt.ly",
  "shorturl.at",
  "lnkd.in",
  "dlvr.it",
  "tiny.cc",
  "rb.gy",
  "t.ly",
]);

const OWN_HOSTS = new Set(["psllabs.org", "www.psllabs.org"]);

/** prohibited-content.md: never in public output. No override. */
const BLOCKED: Array<{ code: string; re: RegExp; message: string }> = [
  { code: "human_use", re: /\b(for|in)\s+humans?\b|\bhuman[\s-](use|consumption|administration)\b|\bpersonal use\b/i, message: "Human-use framing is prohibited (research use only)." },
  { code: "dosing", re: /\bdos(e|es|ed|ing|age|ages)\b|\btitrat|\binject|\breconstitut|\badminist(er|ered|ering|ration)\b/i, message: "Dosing, injection, reconstitution, or administration guidance is prohibited." },
  { code: "treat_cure_heal", re: /\b(cure[sd]?|curing|treats?|treatment|treating|heals?|healing)\b/i, message: "Treat/cure/heal claims are prohibited." },
  { code: "anti_aging", re: /\banti[\s-]?aging\b/i, message: "Anti-aging claims are prohibited." },
  { code: "clinically_proven", re: /\bclinically[\s-]proven\b/i, message: "\"Clinically proven\" is prohibited." },
  { code: "doctor_recommended", re: /\bdoctor[\s-]recommended\b/i, message: "\"Doctor recommended\" is prohibited." },
  { code: "weight_loss", re: /\b(weight|fat)[\s-]?loss\b|\blose\s+weight\b/i, message: "Weight-loss claims are prohibited." },
  { code: "drug_comparison", re: /\bnatural\s+(ozempic|glp-?1)\b|\b(alternative\s+to|replaces?|replacement\s+for)\b/i, message: "Drug comparisons and replacement claims are prohibited." },
  { code: "before_after", re: /\bbefore\s*(and|&|\/)\s*after\b/i, message: "Before/after framing is prohibited." },
  { code: "outcome_promise", re: /\byou\s+will\b/i, message: "Specific outcome claims (\"you will…\") are prohibited." },
];

/** Guardrail topics that need an explicit owner acknowledgement. */
const WARNED: Array<{ code: string; re: RegExp; message: string }> = [
  { code: "biomarker_claim", re: /\b(boosts?|boosting|increases?|enhances?)\b/i, message: "Possible unsubstantiated \"boosts/increases\" claim." },
  { code: "prevents", re: /\bprevents?\b/i, message: "\"Prevents\" can read as a medical claim." },
  { code: "protocol_terms", re: /\b(cycles?|stacks?|stacking)\b/i, message: "Cycle/stack language suggests human use." },
  { code: "safety_efficacy", re: /\b(safe|safety|efficacy|effective|side[\s-]?effects?)\b/i, message: "Safety/efficacy language needs review." },
  { code: "body_outcome", re: /\b(muscle|bodybuilding|ped|disease|results?|benefits?)\b/i, message: "Outcome/body language needs review." },
];

/** Normalization happens once, before preview; the stored text is what is approved and posted. */
export function normalizeDraftText(raw: string): string {
  return raw.normalize("NFC").replace(/\r\n?/g, "\n").trim();
}

function checkUrl(url: string): XContentIssue | null {
  if (!/^https:\/\//i.test(url)) {
    return { code: "link_not_https", message: `Link must be written in full with https:// — ${url}` };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { code: "link_invalid", message: `Link could not be parsed — ${url}` };
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.username || parsed.password) return { code: "link_credentials", message: "Links may not contain credentials." };
  if (parsed.port) return { code: "link_port", message: "Links may not specify a port." };
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("[")) {
    return { code: "link_ip", message: "Links must use a domain name, not an IP address." };
  }
  if (host.split(".").some((label) => label.startsWith("xn--"))) {
    return { code: "link_punycode", message: "Internationalized (punycode) domains are not allowed." };
  }
  if (SHORTENER_HOSTS.has(host)) return { code: "link_shortener", message: "Link shorteners are not allowed; use the full URL." };
  return null;
}

export function checkPostText(text: string): XContentCheck {
  const errors: XContentIssue[] = [];
  const warnings: XContentIssue[] = [];
  const parsed = twitterText.parseTweet(text);

  if (text.length === 0) errors.push({ code: "empty", message: "Text is required." });
  if (text !== normalizeDraftText(text)) {
    errors.push({ code: "not_normalized", message: "Text must be saved (normalized) before approval." });
  }
  if (HIDDEN_CHAR_RE.test(text)) {
    errors.push({ code: "hidden_characters", message: "Text contains invisible or control characters." });
  }
  if (parsed.weightedLength > X_LIMITS.maxWeightedLength || !parsed.valid) {
    if (text.length > 0) {
      errors.push({
        code: "too_long",
        message: `Weighted length ${parsed.weightedLength} exceeds ${X_LIMITS.maxWeightedLength} or is invalid for X.`,
      });
    }
  }
  if (twitterText.extractMentions(text).length > 0 || /(^|[^\w])[@＠]\w/.test(text)) {
    errors.push({ code: "mention", message: "Mentions/replies are not allowed in V1." });
  }

  const links = twitterText
    .extractUrlsWithIndices(text, { extractUrlsWithoutProtocol: true })
    .map((u) => u.url);
  if (/\bhttp:\/\//i.test(text)) {
    errors.push({ code: "link_not_https", message: "Only https:// links are allowed." });
  }
  if (links.length > X_LIMITS.maxLinks) {
    errors.push({ code: "too_many_links", message: `At most ${X_LIMITS.maxLinks} links.` });
  }
  const rawLinks = (text.match(/\bhttps?:\/\/[^\s]+/gi) ?? []).map((u) => u.replace(/[.,;:!?)\]}'"]+$/, ""));
  for (const url of rawLinks.filter((u) => !links.includes(u))) {
    const issue = checkUrl(url);
    if (issue && !errors.some((e) => e.code === issue.code)) errors.push(issue);
  }
  for (const url of links) {
    const issue = checkUrl(url);
    if (issue) {
      if (!errors.some((e) => e.code === issue.code)) errors.push(issue);
      continue;
    }
    const host = new URL(url).hostname.toLowerCase();
    if (!OWN_HOSTS.has(host)) {
      const code = `external_link:${host}`;
      if (!warnings.some((w) => w.code === code)) {
        warnings.push({ code, message: `External link to ${host} — confirm it is approved.` });
      }
    }
  }

  for (const rule of BLOCKED) {
    if (rule.re.test(text)) errors.push({ code: `claim:${rule.code}`, message: rule.message });
  }
  for (const rule of WARNED) {
    if (rule.re.test(text)) warnings.push({ code: `claim:${rule.code}`, message: rule.message });
  }
  if (
    detectForbiddenTopic(text) &&
    !errors.some((e) => e.code.startsWith("claim:")) &&
    !warnings.some((w) => w.code.startsWith("claim:"))
  ) {
    warnings.push({ code: "claim:guardrail_topic", message: "Matches a restricted guardrail topic (lib/authority/guardrails)." });
  }

  return {
    text,
    weightedLength: parsed.weightedLength,
    maxWeightedLength: X_LIMITS.maxWeightedLength,
    links,
    errors,
    warnings,
    ok: errors.length === 0,
  };
}
