/** Reject unsafe browser requests from sibling domains as well as other sites. */
export function isSameOriginMutation(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true;
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin && parsed.origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
