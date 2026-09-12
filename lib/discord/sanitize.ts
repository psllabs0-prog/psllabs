const MAX_QUESTION_LEN = 400;

/** Sanitize untrusted Discord user text for safe templating. */
export function sanitizeDiscordInput(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/@everyone/gi, "[mention-blocked]")
    .replace(/@here/gi, "[mention-blocked]")
    .replace(/<@&?\d+>/g, "[mention-blocked]")
    .replace(/https?:\/\/\S+/gi, "[link-removed]")
    .trim();
  if (s.length > MAX_QUESTION_LEN) {
    s = s.slice(0, MAX_QUESTION_LEN);
  }
  return s;
}

export const DISCORD_ALLOWED_MENTIONS = {
  parse: [] as string[],
} as const;

export function looksLikeOrderPiiRequest(text: string): boolean {
  return (
    /where\s+is\s+my\s+order/i.test(text) ||
    /what\s+did\s+i\s+buy/i.test(text) ||
    /my\s+(shipping\s+)?address/i.test(text) ||
    /did\s+my\s+payment/i.test(text) ||
    /order\s+(number|#|status)/i.test(text) ||
    /track(ing)?\s+my\s+order/i.test(text)
  );
}

export { MAX_QUESTION_LEN };
