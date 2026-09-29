import crypto from "node:crypto";

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Deterministic JSON: object keys sorted recursively. */
export function canonicalJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Duplicate-content key for one account. */
export function textHash(accountId: string, text: string): string {
  return sha256Hex(canonicalJson({ v: 1, accountId, text }));
}

export type PreviewHashInput = {
  postId: string;
  accountId: string;
  text: string;
  revision: number;
  isTest: boolean;
  scheduleKind: "scheduled" | "next_manual_run";
  scheduledFor: string | null;
  validityMinutes: number | null;
  links: string[];
  sourceRefs: string[];
  policyVersion: string;
};

/** What the owner reviewed. The client must echo it back to approve. */
export function previewHash(input: PreviewHashInput): string {
  return sha256Hex(canonicalJson({ v: 1, kind: "preview", ...input }));
}

export type ApprovalHashInput = {
  previewHash: string;
  approvedAt: string;
  scheduledFor: string;
  expiresAt: string;
  approvedEnv: string;
  acknowledgedWarnings: string[];
};

/** Binds the approval to the reviewed preview plus the concrete window. */
export function approvalHash(input: ApprovalHashInput): string {
  return sha256Hex(
    canonicalJson({
      v: 1,
      kind: "approval",
      ...input,
      acknowledgedWarnings: [...input.acknowledgedWarnings].sort(),
    })
  );
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function tokenHash(token: string): string {
  return sha256Hex(`x-publishing-token:${token}`);
}
