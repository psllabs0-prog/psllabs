/**
 * Meta Marketing API version resolution.
 * Host is fixed; only the version segment is configurable.
 */

export const META_GRAPH_API_HOST = "https://graph.facebook.com";
export const DEFAULT_META_MARKETING_API_VERSION = "v26.0";

/** Conservative form: vNN.N or vNN.NN (e.g. v26.0). No hosts/paths. */
const VERSION_RE = /^v\d{1,3}\.\d{1,2}$/;

export type MetaMarketingApiVersionResult = {
  version: string;
  source: "env" | "default";
  /** Present when env value was invalid and default was used. */
  configError: string | null;
};

export function resolveMetaMarketingApiVersion(
  rawEnv: string | null | undefined = process.env.META_MARKETING_API_VERSION
): MetaMarketingApiVersionResult {
  const raw = rawEnv?.trim();
  if (!raw) {
    return {
      version: DEFAULT_META_MARKETING_API_VERSION,
      source: "default",
      configError: null,
    };
  }

  if (
    raw.includes("/") ||
    raw.includes(":") ||
    /https?/i.test(raw) ||
    raw.includes(" ")
  ) {
    return {
      version: DEFAULT_META_MARKETING_API_VERSION,
      source: "default",
      configError: `Invalid META_MARKETING_API_VERSION (must be vNN.N, no URLs); using ${DEFAULT_META_MARKETING_API_VERSION}.`,
    };
  }

  if (!VERSION_RE.test(raw)) {
    return {
      version: DEFAULT_META_MARKETING_API_VERSION,
      source: "default",
      configError: `Invalid META_MARKETING_API_VERSION="${raw}" (expected vNN.N); using ${DEFAULT_META_MARKETING_API_VERSION}.`,
    };
  }

  return { version: raw, source: "env", configError: null };
}

/** Insights path only — never accepts arbitrary hosts. */
export function buildMetaInsightsUrl(input: {
  version: string;
  accountId: string;
  query: string;
}): string {
  const version = resolveMetaMarketingApiVersion(input.version).version;
  const accountId = input.accountId.replace(/^act_/, "");
  return `${META_GRAPH_API_HOST}/${version}/act_${accountId}/insights?${input.query}`;
}
