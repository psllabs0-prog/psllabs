/** The demo is a separate document, never a storefront or checkout. */
export const FINANCE_DEMO_PATH = "/admin-ledger.01";

export function isFinanceDemoPath(pathname: string): boolean {
  return pathname.replace(/\/$/, "") === FINANCE_DEMO_PATH;
}
