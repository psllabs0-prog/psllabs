export const ADMIN_GROUPS = [
  { id: "today", label: "Today", defaultView: "overview" },
  { id: "orders", label: "Orders", defaultView: "orders" },
  { id: "growth", label: "Growth", defaultView: "marketing" },
  { id: "money", label: "Money", defaultView: "finance" },
  { id: "more", label: "More tools", defaultView: "decisions" },
] as const;

export type AdminGroupId = (typeof ADMIN_GROUPS)[number]["id"];

export const ADMIN_VIEWS = [
  { id: "overview", group: "today", label: "Overview", legacyHref: "/admin-ops" },
  { id: "weekly-brief", group: "today", label: "Weekly brief", legacyHref: "/admin-ceo" },
  { id: "orders", group: "orders", label: "Orders & ledger", legacyHref: "/admin-ledger" },
  { id: "fulfillment", group: "orders", label: "Fulfillment", legacyHref: "/admin-fulfillment" },
  { id: "inventory", group: "orders", label: "Inventory", legacyHref: "/admin-inventory" },
  { id: "support", group: "orders", label: "Customer support", legacyHref: "/admin-support" },
  { id: "marketing", group: "growth", label: "Marketing", legacyHref: "/admin-acquisition" },
  { id: "partners", group: "growth", label: "Partners", legacyHref: "/admin-partners" },
  { id: "social", group: "growth", label: "X post queue", legacyHref: "/admin-social" },
  { id: "retention", group: "growth", label: "Retention", legacyHref: "/admin-retention" },
  { id: "search", group: "growth", label: "Search & SEO", legacyHref: "/admin-authority" },
  { id: "attribution", group: "growth", label: "Attribution", legacyHref: "/admin-attribution" },
  { id: "finance", group: "money", label: "Finance", legacyHref: "/admin-finance" },
  { id: "decisions", group: "more", label: "Decisions", legacyHref: "/admin-decisions" },
  { id: "customer-insights", group: "more", label: "Customer insights", legacyHref: "/admin-customer-intelligence" },
  { id: "feedback", group: "more", label: "Customer feedback", legacyHref: "/admin-intelligence" },
  { id: "data", group: "more", label: "Data connections", legacyHref: "/admin-data" },
  { id: "discord", group: "more", label: "Discord", legacyHref: "/admin-discord" },
  { id: "automation", group: "more", label: "Automation health", legacyHref: "/admin-ops?tab=mission-control" },
] as const satisfies readonly {
  id: string;
  group: AdminGroupId;
  label: string;
  legacyHref: string;
}[];

export type AdminView = (typeof ADMIN_VIEWS)[number];
export type AdminViewId = AdminView["id"];

/** Only known tool IDs become view selections or sign-in destinations. */
export function resolveAdminView(value: unknown): AdminView {
  return ADMIN_VIEWS.find((view) => view.id === value) ?? ADMIN_VIEWS[0];
}

export function adminViewHref(view: AdminViewId): string {
  return view === "overview" ? "/admin" : `/admin?view=${view}`;
}
