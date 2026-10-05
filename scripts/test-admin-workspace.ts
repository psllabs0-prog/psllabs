/** Offline regressions: execute the real page, access gate, and inventory loader with fixture storage. */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createContext, Script } from "node:vm";
import { createElement, type ReactElement, type ReactNode } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { ADMIN_GROUPS, ADMIN_VIEWS, adminViewHref, resolveAdminView } from "../lib/admin/navigation";
import type { AdminWorkspaceInventory } from "../lib/admin/workspace-inventory";

const ROOT = resolve(__dirname, "..");
const inventoryFixture: AdminWorkspaceInventory = {
  products: [{ handle: "fixture-active", name: "Fixture active product", sku: "FIX-01", stock: 0 }],
  history: [{ id: "1", handle: "fixture-active", sku: "FIX-01", oldStock: 2, newStock: 0, changedAt: "2026-10-05T12:00:00Z" }],
};
type WorkspaceProps = { selectedView: string; inventory?: AdminWorkspaceInventory; inventoryUnavailable: boolean };
type PageModule = {
  default: (props: { searchParams: Promise<Record<string, unknown>> }) => Promise<ReactElement>;
  metadata: { robots: { index: boolean; follow: boolean } };
};

function harness({ configured = true, authenticated = true, storageFails = false } = {}) {
  const calls: string[] = [];
  const selected: WorkspaceProps[] = [];
  const fixtures: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime,
    "@/lib/admin/auth": {
      isAdminPasswordConfigured: () => { calls.push("configured"); return configured; },
      isAdminAuthenticated: async () => { calls.push("auth"); return authenticated; },
    },
    "@/lib/seo": { createPageMetadata: (input: unknown) => input },
    "@/components/admin/admin-login-form": {
      AdminLoginForm: ({ redirectTo }: { redirectTo: string }) => createElement("form", { "data-login-destination": redirectTo }),
    },
    "@/components/admin/admin-workspace": {
      AdminWorkspace: (props: WorkspaceProps) => { selected.push(props); return createElement("main", { "data-workspace": props.selectedView }); },
    },
    "@/lib/products/catalog": {
      getActiveCatalogProducts: () => {
        calls.push("active-catalog");
        return [{ handle: "fixture-active", name: "Fixture active product", sku: "FIX-01" }];
      },
    },
    "@/lib/inventory/store": {
      ensureInventorySchema: async () => { calls.push("schema"); if (storageFails) throw new Error("fixture database unavailable"); },
      ensureProductTracked: async (handle: string, name: string, sku: string) => { calls.push(`track:${handle}:${name}:${sku}`); },
      getAdminInventoryRows: async () => { calls.push("products"); return inventoryFixture.products; },
      getRecentStockHistory: async (limit: number) => { calls.push(`history:${limit}`); return inventoryFixture.history; },
    },
    "next/navigation": { useRouter: () => ({ refresh: () => {} }) },
    "next/dynamic": {
      __esModule: true,
      default: (loader: () => Promise<unknown>) => {
        // Inspect which lazy boundaries the real workspace renders, without executing dashboard effects.
        const name = loader.toString().match(/require\("\.\/([^"]+)"\)/)?.[1];
        assert(name, "lazy dashboard import must be explicit");
        return () => createElement("div", { "data-lazy-panel": name });
      },
    },
  };
  const allowed = new Set([
    "app/admin/page.tsx", "lib/admin/navigation.ts", "lib/admin/workspace-access.ts",
    "lib/admin/workspace-inventory.ts", "components/admin/admin-appearance.tsx", "components/admin/admin-workspace.tsx",
  ].map((file) => resolve(ROOT, file)));
  const cache = new Map<string, Record<string, unknown>>();
  function load(id: string, parent = ROOT): Record<string, unknown> {
    if (Object.hasOwn(fixtures, id)) return fixtures[id] as Record<string, unknown>;
    if (id === "./admin-appearance.module.css") return { default: { root: "fixture-admin-appearance" }, __esModule: true };
    if (id === "./admin-workspace-nav") return {
      AdminReturnNav: () => createElement("a", { href: "/admin" }, "Admin home"),
      AdminWorkspaceNav: () => createElement("nav", {}, "Fixture navigation"),
    };
    let file = id.startsWith("@/") ? resolve(ROOT, id.slice(2)) : resolve(parent, id);
    if (!existsSync(file)) file += existsSync(`${file}.ts`) ? ".ts" : ".tsx";
    assert(allowed.has(file), `unmocked module forbidden: ${id}`);
    if (cache.has(file)) return cache.get(file)!;
    const output: Record<string, unknown> = {};
    cache.set(file, output);
    const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: file,
    }).outputText;
    const run = new Script(`(function(require,module,exports){${compiled}\n})`, { filename: file }).runInContext(createContext({})) as
      (require: (id: string) => unknown, module: { exports: Record<string, unknown> }, exports: Record<string, unknown>) => void;
    const loadedModule = { exports: output };
    run((dependency) => load(dependency, dirname(file)), loadedModule, output);
    return loadedModule.exports;
  }
  return { calls, selected, page: load("@/app/admin/page") as unknown as PageModule, load };
}

async function main() {
  let scenarios = 0;
  const groupIds = ADMIN_GROUPS.map((group) => group.id);
  assert.equal(groupIds.length, 5);
  assert.equal(new Set(ADMIN_VIEWS.map((view) => view.id)).size, ADMIN_VIEWS.length);
  for (const group of ADMIN_GROUPS) assert.equal(resolveAdminView(group.defaultView).group, group.id);
  const legacyPages = readdirSync(resolve(ROOT, "app"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("admin-") && existsSync(resolve(ROOT, "app", entry.name, "page.tsx")))
    .map((entry) => `/${entry.name}`).sort();
  assert.deepEqual([...new Set(ADMIN_VIEWS.map((view) => view.legacyHref.split("?")[0]))].sort(), legacyPages, "every legacy tool remains reachable from the hub");
  for (const view of ADMIN_VIEWS) {
    const url = new URL(adminViewHref(view.id), "https://example.test");
    assert.equal(url.pathname, "/admin");
    assert.equal(resolveAdminView(url.searchParams.get("view")).id, view.id, "bookmark round trip");
  }
  for (const invalid of [undefined, null, "", "unknown", "__proto__", "constructor", "https://example.test", ["inventory"], "inventory&redirect=https://example.test"]) {
    assert.equal(resolveAdminView(invalid).id, "overview");
    scenarios++;
  }

  const unavailable = harness({ configured: false });
  renderToStaticMarkup(await unavailable.page.default({ searchParams: Promise.resolve({ view: "inventory" }) }));
  assert.deepEqual(unavailable.calls, ["configured"], "missing config must not check session or initialize inventory");
  assert.equal(unavailable.selected.length, 0);
  scenarios++;

  for (const view of ADMIN_VIEWS) {
    const signedOut = harness({ authenticated: false });
    const html = renderToStaticMarkup(await signedOut.page.default({ searchParams: Promise.resolve({ view: view.id }) }));
    assert.deepEqual(signedOut.calls, ["configured", "auth"]);
    assert.equal(signedOut.selected.length, 0, "unauthenticated request must not render any dashboard");
    assert(html.includes(`data-login-destination="${adminViewHref(view.id)}"`), "login returns to the selected safe view");
    scenarios++;

    const signedIn = harness();
    renderToStaticMarkup(await signedIn.page.default({ searchParams: Promise.resolve({ view: view.id }) }));
    assert.equal(signedIn.selected.length, 1);
    assert.equal(signedIn.selected[0].selectedView, view.id);
    if (view.id === "inventory") {
      assert.deepEqual(signedIn.calls, ["configured", "auth", "schema", "active-catalog", "track:fixture-active:Fixture active product:FIX-01", "products", "history:10"]);
      assert.strictEqual(signedIn.selected[0].inventory?.products, inventoryFixture.products, "existing stock must reach the panel unchanged, including zero stock");
      assert.strictEqual(signedIn.selected[0].inventory?.history, inventoryFixture.history);
    } else {
      assert.deepEqual(signedIn.calls, ["configured", "auth"], "other views must not initialize inventory");
      assert.equal(signedIn.selected[0].inventory, undefined);
    }
    scenarios++;
  }

  const failed = harness({ storageFails: true });
  renderToStaticMarkup(await failed.page.default({ searchParams: Promise.resolve({ view: "inventory" }) }));
  assert.equal(failed.selected[0].inventoryUnavailable, true);
  assert.equal(failed.selected[0].inventory, undefined, "failed stock read must not become a fabricated empty inventory");
  scenarios++;

  const malicious = harness({ authenticated: false });
  const loginHtml = renderToStaticMarkup(await malicious.page.default({ searchParams: Promise.resolve({ view: "https://example.test" }) }));
  assert(loginHtml.includes('data-login-destination="/admin"'));
  assert(!loginHtml.includes("https://example.test"));
  assert.equal(malicious.page.metadata.robots.index, false);
  assert.equal(malicious.page.metadata.robots.follow, false);
  scenarios++;

  for (const authenticated of [false, true]) {
    const layout = harness({ authenticated });
    const Appearance = layout.load("@/components/admin/admin-appearance").default as (props: { children: ReactNode }) => Promise<ReactElement>;
    const html = renderToStaticMarkup(await Appearance({ children: createElement("p", {}, "Child page") }));
    assert.equal(html.includes("Admin home"), authenticated, "legacy return navigation requires a valid session");
    assert(html.includes("Child page"), "layout must preserve existing independently guarded page");
    scenarios++;
  }

  const workspace = harness();
  const Workspace = workspace.load("./components/admin/admin-workspace.tsx").AdminWorkspace as (props: WorkspaceProps) => ReactElement;
  for (const view of ADMIN_VIEWS) {
    const html = renderToStaticMarkup(createElement(Workspace, {
      selectedView: view.id, inventory: view.id === "inventory" ? inventoryFixture : undefined, inventoryUnavailable: false,
    }));
    assert.equal((html.match(/data-lazy-panel=/g) ?? []).length, view.id === "retention" ? 2 : 1, "only the selected tool's panels may mount");
    assert.equal(html.includes('data-lazy-panel="admin-newsletter-welcome-panel"'), view.id === "retention", "newsletter status and previews belong to retention only");
    assert.equal(html.includes('data-lazy-panel="mission-control"'), view.id === "automation", "polling Mission Control must unmount when another tool is selected");
    scenarios++;
  }

  console.log(`Admin workspace regressions passed: ${scenarios} access/selection cases, all ${legacyPages.length} legacy routes covered.`);
}

void main();
