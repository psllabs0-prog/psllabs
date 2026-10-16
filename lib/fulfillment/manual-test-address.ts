import { isPhysicalUSShippingAddress } from "@/lib/shipping/request";
import type { ManualFulfillmentTestAddress } from "./manual-test-types";

/** Format validation only; a fresh positive carrier verification is still required. */
export function parseManualTestAddress(value: unknown): ManualFulfillmentTestAddress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!["address", "city", "state", "zip"].every(key => typeof row[key] === "string") ||
      row.street2 !== undefined && typeof row.street2 !== "string") return null;
  const address = { address: (row.address as string).trim(), street2: (row.street2 as string | undefined)?.trim() || "",
    city: (row.city as string).trim(), state: (row.state as string).trim().toUpperCase(), zip: (row.zip as string).trim() };
  if (!address.address || Object.values(address).some(text => text.length > 200 || /[\u0000-\u001f\u007f]/.test(text))) return null;
  return isPhysicalUSShippingAddress({ firstName: "TEST", lastName: "ONLY", country: "US", ...address,
    address: [address.address, address.street2].filter(Boolean).join("\n") }) ? address : null;
}
