/**
 * Treat inbound email as untrusted. Strip injection attempts and secrets-shaped text
 * from customer-visible drafting context — never execute instructions in the body.
 */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /system\s*prompt/gi,
  /you\s+are\s+now/gi,
  /reveal\s+(your\s+)?(secrets?|api\s*keys?|env|password)/gi,
  /override\s+(policy|classification|rules?)/gi,
  /execute\s+(code|sql|shell)/gi,
  /send\s+(email|money|crypto)\s+to/gi,
  /approve\s+(refund|replacement)/gi,
  /change\s+(system|policy|rules)/gi,
  /access\s+admin/gi,
  /dump\s+(database|env|credentials)/gi,
];

export function extractEmailAddress(raw: string): string {
  const angle = raw.match(/<([^>]+)>/);
  const candidate = (angle?.[1] ?? raw).trim().toLowerCase();
  const match = candidate.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].toLowerCase() : candidate.slice(0, 254);
}

export function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fw|fwd)\s*:\s*/gi, "")
    .trim()
    .slice(0, 500);
}

export function normalizeBody(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").replace(/\0/g, "");
  // Drop quoted reply chains aggressively for classification.
  const lines = text.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (/^On .+ wrote:$/i.test(line.trim())) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
    if (/^From:\s+/i.test(line.trim()) && kept.length > 3) break;
    kept.push(line);
  }
  text = kept.join("\n");
  // Mark injection attempts but do not follow them.
  for (const pattern of INJECTION_PATTERNS) {
    text = text.replace(pattern, "[untrusted-instruction-removed]");
  }
  // Redact credential-shaped strings from stored body.
  text = text.replace(
    /(api[_-]?key|password|secret|token)\s*[:=]\s*\S+/gi,
    "$1=[redacted]"
  );
  return text.trim().slice(0, 20000);
}

export function buildThreadKey(input: {
  fromEmail: string;
  subject: string;
  inReplyTo?: string | null;
  references?: string | null;
}): string {
  const ref = (input.inReplyTo || input.references || "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)[0];
  if (ref) return `ref:${ref.slice(0, 200)}`;
  const subj = normalizeSubject(input.subject).toLowerCase();
  return `pair:${input.fromEmail.toLowerCase()}|${subj.slice(0, 160)}`;
}

export function containsInjectionAttempt(raw: string): boolean {
  return INJECTION_PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(raw);
  });
}
