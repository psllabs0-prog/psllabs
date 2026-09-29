import { X_POST_ID_RE } from "./constants";

export type CreateReport = {
  transportError: boolean;
  httpStatus: number | null;
  postId: string | null;
  errorTitle: string | null;
  rateLimitReset: string | null;
};

export type CreateClassification =
  | { kind: "created"; postId: string }
  | { kind: "rejected"; code: string; message: string; rateLimitResetAt: string | null }
  | { kind: "uncertain"; code: string; message: string };

/**
 * X answered and definitely did not create the post. Everything else that is
 * not a success with a valid ID is uncertain: the post may exist, so it goes
 * to owner review and is never retried automatically.
 */
const DEFINITE_REJECTIONS = new Set([400, 401, 403, 404, 422, 429]);

function cleanTitle(title: string | null): string {
  return (title ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 200);
}

export function classifyCreateResult(r: CreateReport): CreateClassification {
  if (r.transportError || r.httpStatus === null) {
    return {
      kind: "uncertain",
      code: "transport_error",
      message: "No HTTP response from X (timeout or network error); the post may exist.",
    };
  }
  if (r.httpStatus === 200 || r.httpStatus === 201) {
    if (r.postId !== null && X_POST_ID_RE.test(r.postId)) return { kind: "created", postId: r.postId };
    return {
      kind: "uncertain",
      code: "success_without_valid_id",
      message: `X returned ${r.httpStatus} without a valid post ID.`,
    };
  }
  if (DEFINITE_REJECTIONS.has(r.httpStatus)) {
    let rateLimitResetAt: string | null = null;
    if (r.rateLimitReset && /^\d{9,11}$/.test(r.rateLimitReset)) {
      rateLimitResetAt = new Date(Number(r.rateLimitReset) * 1000).toISOString();
    }
    const title = cleanTitle(r.errorTitle);
    return {
      kind: "rejected",
      code: `http_${r.httpStatus}`,
      message: `X rejected the request (${r.httpStatus})${title ? `: ${title}` : ""}.`,
      rateLimitResetAt,
    };
  }
  return {
    kind: "uncertain",
    code: `http_${r.httpStatus}`,
    message: `X returned ${r.httpStatus}; the post may or may not exist.`,
  };
}

export type LookupData = {
  id: string | null;
  authorId: string | null;
  text: string | null;
  createdAt: string | null;
  urls: Array<{ url: string; expandedUrl: string }>;
};

export type LookupReport = {
  transportError: boolean;
  httpStatus: number | null;
  data: LookupData | null;
};

export type LookupVerdict =
  | { kind: "confirmed"; createdAt: string | null }
  | { kind: "mismatch"; code: "id_mismatch" | "author_mismatch" | "text_mismatch"; message: string }
  | { kind: "retry"; code: string; message: string };

function unescapeXText(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** X replaces links with t.co; URL entities carry the original. */
export function expandXText(text: string, urls: LookupData["urls"]): string {
  let out = unescapeXText(text);
  for (const u of urls) {
    if (u.url && u.expandedUrl) out = out.split(u.url).join(u.expandedUrl);
  }
  return out;
}

function comparableUrls(text: string): string {
  return text.replace(/https:\/\/[^\s]+/g, (u) => u.replace(/\/+$/, ""));
}

export function verifyLookup(input: {
  expectedPostId: string;
  expectedAuthorId: string;
  approvedText: string;
  report: LookupReport;
}): LookupVerdict {
  const { report } = input;
  if (report.transportError || report.httpStatus === null) {
    return { kind: "retry", code: "transport_error", message: "Lookup request failed; will retry read-only." };
  }
  if (report.httpStatus !== 200 || !report.data) {
    return {
      kind: "retry",
      code: report.httpStatus === 404 ? "not_found" : `http_${report.httpStatus}`,
      message: `Lookup returned ${report.httpStatus}; will retry read-only.`,
    };
  }
  const d = report.data;
  if (d.id !== input.expectedPostId) {
    return { kind: "mismatch", code: "id_mismatch", message: "Lookup returned a different post ID." };
  }
  if (d.authorId !== input.expectedAuthorId) {
    return { kind: "mismatch", code: "author_mismatch", message: "Post author is not the locked destination account." };
  }
  const observed = expandXText(d.text ?? "", d.urls);
  if (observed !== input.approvedText && comparableUrls(observed) !== comparableUrls(input.approvedText)) {
    return { kind: "mismatch", code: "text_mismatch", message: "Post text does not match the approved text." };
  }
  return { kind: "confirmed", createdAt: d.createdAt };
}
