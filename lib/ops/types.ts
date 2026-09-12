export type OpsPriority = "P0" | "P1" | "P2" | "P3";

export type OpsArea =
  | "finance"
  | "support"
  | "inventory"
  | "fulfillment"
  | "ceo"
  | "data"
  | "acquisition"
  | "seo"
  | "system";

export type OpsException = {
  sourceType: string;
  sourceId: string;
  priority: OpsPriority;
  area: OpsArea;
  title: string;
  why: string;
  detectedAt: string;
  href: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  note: string | null;
};

export const OPS_PRIORITY_RANK: Record<OpsPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

export function sortOpsExceptions(items: OpsException[]): OpsException[] {
  return [...items].sort((a, b) => {
    const pr = OPS_PRIORITY_RANK[a.priority] - OPS_PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    return a.detectedAt.localeCompare(b.detectedAt);
  });
}

export function topOpsActions(
  items: OpsException[],
  max = 3
): OpsException[] {
  return sortOpsExceptions(items.filter((i) => !i.acknowledged)).slice(0, max);
}
