import { resolveAdminView, type AdminViewId } from "./navigation";

type AccessChecks<TInventory> = {
  isPasswordConfigured: () => boolean;
  isAuthenticated: () => Promise<boolean>;
  loadInventory: () => Promise<TInventory>;
};

export type AdminWorkspaceAccess<TInventory> =
  | { status: "unavailable"; view: AdminViewId }
  | { status: "signed-out"; view: AdminViewId }
  | {
      status: "ready";
      view: AdminViewId;
      inventory?: TInventory;
      inventoryUnavailable: boolean;
    };

/** Authenticate before any inventory read/initialization, and only load the selected tool. */
export async function loadAdminWorkspace<TInventory>(
  requestedView: unknown,
  checks: AccessChecks<TInventory>,
): Promise<AdminWorkspaceAccess<TInventory>> {
  const view = resolveAdminView(requestedView).id;
  if (!checks.isPasswordConfigured()) return { status: "unavailable", view };
  if (!(await checks.isAuthenticated())) return { status: "signed-out", view };

  if (view !== "inventory") {
    return { status: "ready", view, inventoryUnavailable: false };
  }

  try {
    return {
      status: "ready",
      view,
      inventory: await checks.loadInventory(),
      inventoryUnavailable: false,
    };
  } catch {
    // Keep navigation available during a database outage; never show empty stock as real data.
    return { status: "ready", view, inventoryUnavailable: true };
  }
}
