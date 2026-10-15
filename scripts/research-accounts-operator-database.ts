type OperatorEnvironment = Record<string, string | undefined>;

function neonUrl(value: string) {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !/^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)+\.neon\.tech$/i.test(url.hostname)) {
    throw new Error("A recognized Neon endpoint is required for the research operator.");
  }
  if (!["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode") || "")) {
    throw new Error("Explicit TLS is required for the research operator.");
  }
  return url;
}

function directHost(host: string) {
  return host.replace(/^(ep-[a-z0-9-]+)-pooler(?=\.)/i, "$1");
}

/** Operator only: session search_path must not pass through transaction pooling.
 * Neon documents direct vs pooled as the same endpoint without -pooler:
 * https://neon.com/docs/connect/connection-pooling
 * This never changes the application's runtime database configuration. */
export function researchOperatorConnection(env: OperatorEnvironment) {
  const primaryValue = env.DATABASE_URL || env.POSTGRES_URL;
  if (!primaryValue) throw new Error("No existing database connection is configured.");
  const primary = neonUrl(primaryValue);
  for (const key of ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "POSTGRES_URL_UNPOOLED"]) {
    if (!env[key]) continue;
    const candidate = neonUrl(env[key]!);
    if (candidate.hostname !== directHost(primary.hostname) || /-pooler\./i.test(candidate.hostname) ||
        candidate.pathname !== primary.pathname || candidate.username !== primary.username ||
        candidate.port !== primary.port) {
      throw new Error("The configured unpooled URL must identify the same Neon endpoint, database and role.");
    }
    return { connectionString: candidate.toString(), connectionMode: "existing-unpooled-variable", source: key };
  }
  const selected = new URL(primary);
  selected.hostname = directHost(primary.hostname);
  return { connectionString: selected.toString(), connectionMode: selected.hostname === primary.hostname ? "existing-direct" : "same-endpoint-unpooled-host", source: "primary" };
}

/** Codes only: never include database error messages, details, queries or URLs. */
export function operatorErrorCode(problem: unknown): string | null {
  const candidate = problem && typeof problem === "object" && "code" in problem ? problem.code : null;
  return typeof candidate === "string" && /^[A-Z0-9_]{2,64}$/.test(candidate) ? candidate : null;
}
