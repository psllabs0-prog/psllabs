import type { BtcpostageAddress } from "./types";

const fields = ["code", "error_code", "field", "message", "error", "description", "detail", "suggestion"] as const;
const words = new Set(("a an the and or is are was were be been being no not cannot can't could couldn't unable to for of in on with from by this that it your " +
  "address verification verify verified validate validated validation delivery deliverable undeliverable primary secondary unit apartment suite street house number city state province country zip postal code " +
  "api key secret token authentication authorization authenticated authorized unauthenticated unauthorized forbidden permission permissions denied invalid missing required expired incorrect unknown invalid_request " +
  "account access credentials credential configured configuration enabled disabled suspended restricted blocked active inactive status request response success successful failure failed error errors " +
  "service services provider carrier usps easypost upstream server temporarily temporary unavailable available timeout timed out rate limit limited exceeded " +
  "found match matching mismatch insufficient balance credits credit subscription plan feature supported unsupported allowed permitted test production mode " +
  "true false please contact support try again later internal exception bad malformed empty input parameter parameters required field fields error_code").split(/\s+/));

/** Deliberately lossy: never preserve an arbitrary provider word as diagnostic prose. */
export function verificationErrorDiagnostics(raw: unknown, address: BtcpostageAddress, credentials: { key: string; secret: string }) {
  const sensitive = [...Object.values(address).filter((value): value is string => typeof value === "string")
    .flatMap(value => [value, ...value.split(/[^\p{L}\p{N}]+/u)]), credentials.key, credentials.secret]
    .filter(value => value.length >= 3).sort((a, b) => b.length - a.length);
  const scrub = (value: string) => {
    let result = value.slice(0, 2000);
    for (const privateValue of sensitive) result = result.replace(new RegExp(privateValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " [redacted] ");
    return result.replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi, " [redacted] ")
      .replace(/[^\s<>@]+@[^\s<>@]+/g, " [redacted] ").replace(/\d+/g, " [redacted] ");
  };
  const prose = (value: string) => scrub(value).replace(/[^A-Za-z\s'_-]+/g, " ").split(/\s+/)
    .map(word => words.has(word.toLowerCase()) ? word : "[redacted]").join(" ")
    .replace(/(?:\[redacted\]\s*)+/g, "[redacted] ").trim().slice(0, 240);
  const errors = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  return errors.slice(0, 3).map(error => {
    const object = error && typeof error === "object" && !Array.isArray(error) ? error as Record<string, unknown> : null;
    const shape = object ? Object.fromEntries(fields.filter(field => Object.hasOwn(object, field)).map(field => [field, typeof object[field]])) : typeof error;
    const codes = object ? [object.code, object.error_code].filter((code): code is string => typeof code === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(code))
      .map(code => scrub(code).replace(/[^A-Za-z_.-]+/g, ".")).filter(code => !/redacted/i.test(code)).slice(0, 2) : [];
    const text = typeof error === "string" ? error : object ? [object.message, object.error, object.description, object.detail]
      .filter((value): value is string => typeof value === "string").join(" ") : "";
    return { shape, codes, summary: prose(text) };
  });
}
