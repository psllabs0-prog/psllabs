import { PSL_META_DATASET_ID } from "./events";

// A code-reviewed release must follow Meta Test Events verification. Credentials
// or an environment variable alone must not turn on unverified collection.
export const META_PRODUCTION_VERIFIED = false;
export type MetaServerConfig = { datasetId: string; accessToken: string; apiVersion: "v26.0" };
export function readMetaServerConfig(): MetaServerConfig | null {
  if (!META_PRODUCTION_VERIFIED || process.env.META_ADS_ENABLED !== "true" ||
      process.env.META_DATASET_ID !== PSL_META_DATASET_ID) return null;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!accessToken || !/^[\x21-\x7e]{1,4096}$/.test(accessToken)) return null;
  return { datasetId: PSL_META_DATASET_ID, accessToken, apiVersion: "v26.0" };
}
