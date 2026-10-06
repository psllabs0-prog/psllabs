// Display references supplement the compound identity; checkout uses the existing SKU.
const codes: Record<string, string> = {
  retatrutide: "PSL-3 (RT)",
  "ghk-cu": "PSL-Cu",
  "bpc-157": "PSL-BPC",
  tesamorelin: "PSL-TESA",
  "reconstitution-solution": "PSL-H2O",
};

export function homeProductCode(handle: string): string {
  return codes[handle] ?? "PSL";
}
