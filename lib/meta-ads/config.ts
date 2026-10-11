import { PSL_META_DATASET_ID } from "./events";

// The narrow PageView release has passed isolated QA. This is activation
// readiness, not a claim that genuine production event receipt was observed.
// Production remains off until the explicit server environment flag is enabled.
export const META_PAGEVIEW_QA_READY = true;
export type MetaServerConfig = { datasetId: string; accessToken: string; apiVersion: "v26.0" };
export function readMetaServerConfig(): MetaServerConfig | null {
  if (!META_PAGEVIEW_QA_READY || process.env.META_ADS_ENABLED !== "true" ||
      process.env.META_DATASET_ID !== PSL_META_DATASET_ID) return null;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!accessToken || !/^[\x21-\x7e]{1,4096}$/.test(accessToken)) return null;
  return { datasetId: PSL_META_DATASET_ID, accessToken, apiVersion: "v26.0" };
}
