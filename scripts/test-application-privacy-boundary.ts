import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { isPrivacyExcludedPath } from "../lib/privacy/client";
import { isFinanceDemoPath } from "../lib/finance-demo/path";
import { REVIEWED_META_EVENT_POLICY } from "../lib/meta-ads/events";
import { loadMetaBrowserFixture } from "./meta-browser-fixture";

// Exercise the existing reviewed QA scope without enabling production paths.
let { metaBrowserContextAllowed } = loadMetaBrowserFixture(REVIEWED_META_EVENT_POLICY);

// Execute the real wrapper with deterministic hooks and a minimal DOM. No
// advertising script, network request or live browser profile is involved.
const source = readFileSync("components/layout/application-shell.tsx", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
let pathname = "/";
let initialScope: boolean | undefined;
let layoutEffects: (() => void)[] = [];
let effects: (() => void | (() => void))[] = [];
let click: ((event: Record<string, unknown>) => void) | undefined;
let reloads = 0;
let metaLoaded = false;
let metaStops = 0;
let tiktokLoaded = false;
let tiktokStops = 0;
let historyUpdates = 0;
let unsubscribe: (() => void) | undefined;
const events = new EventTarget();
const assigned: string[] = [];
const location = { href: "https://www.psllabs.org/", origin: "https://www.psllabs.org",
  get pathname() { return new URL(this.href).pathname; },
  reload: () => { reloads++; }, assign: (url: string) => { assigned.push(url); } };
const updateHistory = (_data: unknown, _unused: string, url?: string | URL | null) => {
  historyUpdates++;
  if (url != null) location.href = new URL(url, location.href).href;
};
const browser = { location, pslGoogleAdsReady: true, gtag: () => {},
  history: { pushState: updateHistory, replaceState: updateHistory },
  addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
class Target {
  constructor(readonly href: string, readonly target = "", readonly download = false) {}
  closest() { return this; }
  hasAttribute(name: string) { return name === "download" && this.download; }
}
const exports: { ApplicationShell?: (props: {children: string}) => unknown; resetDocumentNavigation?: () => void } = {};
const jsx = (type: unknown, props: unknown) => ({ type, props });
// Simulated full documents reset module state, just as a real hard navigation does.
runInNewContext(compiled + "\nexports.resetDocumentNavigation = () => { pendingDocumentNavigation = null; };", { exports, URL, Element: Target, window: browser,
  document: {
    referrer: "",
    addEventListener: (_name: string, handler: typeof click) => { click = handler; },
    removeEventListener: () => { click = undefined; },
  }, require: (name: string) => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    if (name === "react") return {
      useState: (initialize: () => boolean) => {
        initialScope ??= initialize(); return [initialScope, () => {}];
      },
      useEffect: (fn: () => void | (() => void)) => { effects.push(fn); },
      useLayoutEffect: (fn: () => void) => { layoutEffects.push(fn); },
      useSyncExternalStore: (subscribe: (notify: () => void) => () => void, getSnapshot: () => string) => {
        unsubscribe ??= subscribe(() => {}); return getSnapshot();
      },
    };
    if (name === "next/navigation") return { usePathname: () => pathname };
    if (name === "next/script") return { default: "Script" };
    if (name.endsWith("/SiteLayout")) return { SiteLayout: "SiteLayout" };
    if (name.endsWith("/finance-demo/path")) return { isFinanceDemoPath };
    if (name.endsWith("/plausible/redact")) return { PLAUSIBLE_INIT_JS: "" };
    if (name.endsWith("/privacy/client")) return { isPrivacyExcludedPath, PRIVACY_WITHDRAWAL_EVENT: "psl-privacy-withdrawal" };
    if (name.endsWith("/meta-ads/browser")) return {
      metaBrowserContextAllowed: (url: string, referrer: string) => metaBrowserContextAllowed(url, referrer),
      hasMetaBrowserSdk: () => metaLoaded, stopMetaBrowserDispatch: () => { metaStops++; } };
    if (name.endsWith("/tiktok-ads/browser")) return {
      tikTokBrowserContextAllowed: (url: string, referrer: string) => metaBrowserContextAllowed(url, referrer),
      hasTikTokBrowserSdk: () => tiktokLoaded, stopTikTokBrowserDispatch: () => { tiktokStops++; } };
    throw new Error(`Unexpected dependency: ${name}`);
  },
});
const render = () => {
  layoutEffects = []; effects = [];
  const tree = exports.ApplicationShell!({ children: "PRIVATE_CONTENT" });
  return { tree, flush: () => { layoutEffects.forEach(fn => fn()); effects.forEach(fn => fn()); } };
};
const first = render();
assert.notEqual(first.tree, null); first.flush();
assert.equal(reloads, 0);
const clickLink = (href: string, extra: Record<string, unknown> = {}) => {
  let prevented = false, stopped = false;
  click!({ target: new Target(href), button: 0, defaultPrevented: false,
    preventDefault: () => { prevented = true; }, stopPropagation: () => { stopped = true; }, ...extra });
  return { prevented, stopped };
};
assert.deepEqual(clickLink("https://www.psllabs.org/admin-ledger.01"), { prevented: true, stopped: true });
assert.equal(assigned.at(-1), "https://www.psllabs.org/admin-ledger.01");
const count = assigned.length;
for (const [url, extra] of [
  ["https://www.psllabs.org/products", {}],
  ["https://other.example/admin", {}],
  ["https://www.psllabs.org/admin", { ctrlKey: true }],
  ["https://www.psllabs.org/admin", { button: 1 }],
  ["https://www.psllabs.org/admin", { target: new Target("https://www.psllabs.org/admin", "_blank") }],
  ["https://www.psllabs.org/admin", { target: new Target("https://www.psllabs.org/admin", "", true) }],
] as Array<[string, Record<string, unknown>]>) assert.equal(clickLink(url, extra).prevented, false);
assert.equal(assigned.length, count);

// A router/history transition suppresses private children before effects run.
pathname = "/admin-ledger.01";
const privateTransition = render();
assert.equal(privateTransition.tree, null);
privateTransition.flush();
assert.equal(reloads, 0, "an already queued full navigation must not be overridden by reload");
assert.equal(browser.pslGoogleAdsReady, false);

// A fresh private document can render its existing authentication/dashboard and
// does not loop. Returning to the public store also starts a fresh document.
initialScope = undefined;
const privateDocument = render();
assert.notEqual(privateDocument.tree, null); privateDocument.flush();
assert.equal(reloads, 0);
assert.deepEqual(clickLink("https://www.psllabs.org/products"), { prevented: true, stopped: true });
pathname = "/products";
const publicTransition = render();
assert.equal(publicTransition.tree, null); publicTransition.flush();
assert.equal(reloads, 0);

for (const route of ["/admin", "/admin-ledger", "/admin-ledger.01", "/test", "/tests/check", "/demo", "/api/orders"]) {
  pathname = "/"; initialScope = undefined; render().flush();
  pathname = route;
  assert.equal(render().tree, null, `private route must not mount in the old SDK document: ${route}`);
}

function freshDocument(path: string, loaded = false) {
  unsubscribe?.(); unsubscribe = undefined;
  exports.resetDocumentNavigation!();
  location.href = `https://www.psllabs.org${path}`;
  pathname = new URL(location.href).pathname;
  initialScope = undefined; metaLoaded = loaded;
  return render();
}
freshDocument("/", true).flush();
assert.deepEqual(clickLink("https://www.psllabs.org/contact"), { prevented: true, stopped: true });
assert.deepEqual(clickLink("https://www.psllabs.org/products?email=private"), { prevented: true, stopped: true });
assert.deepEqual(clickLink("https://www.psllabs.org/products"), { prevented: false, stopped: false });
const updates = historyUpdates;
browser.history.pushState({}, "", "/products?email=private");
assert.equal(historyUpdates, updates, "unsafe SDK navigation is intercepted before history changes");
assert.equal(assigned.at(-1), "https://www.psllabs.org/products?email=private");
browser.history.replaceState({}, "", "/success?orderId=private");
assert.equal(historyUpdates, updates);
assert.equal(assigned.at(-1), "https://www.psllabs.org/success?orderId=private");
browser.history.pushState({}, "", "/products?fbclid=real_click");
assert.equal(historyUpdates, updates + 1, "reviewed public navigation remains an SPA transition");

// A query-only browser-history transition and a not-yet-committed Next pathname
// both suppress children while the original Meta SDK still exists.
freshDocument("/products", true).flush();
location.href = "https://www.psllabs.org/products?email=private";
const stops = metaStops;
events.dispatchEvent(new Event("popstate"));
assert(metaStops > stops);
const unsafeQuery = render();
assert.equal(unsafeQuery.tree, null); unsafeQuery.flush();
freshDocument("/products", true).flush();
pathname = "/contact";
assert.equal(render().tree, null);

// Next renders a new route before HistoryUpdater supplies its full URL. Keep
// that private query intact and do not reload the old catalog page.
freshDocument("/products", true).flush();
const beforePending = reloads;
pathname = "/success";
const earlyReceiptRender = render();
assert.equal(earlyReceiptRender.tree, null); earlyReceiptRender.flush();
assert.equal(reloads, beforePending);
browser.history.pushState({}, "", "/success?orderId=psl_private_receipt");
assert.equal(assigned.at(-1), "https://www.psllabs.org/success?orderId=psl_private_receipt");
render().flush();
assert.equal(reloads, beforePending, "the pending correct receipt destination is never overwritten");

// A freshly loaded unsupported page never starts the SDK and never loops.
const beforeFresh = reloads;
const freshUnsafe = freshDocument("/success?orderId=private");
assert.notEqual(freshUnsafe.tree, null); freshUnsafe.flush();
assert.equal(reloads, beforeFresh);
const freshPrivate = freshDocument("/admin-ledger.01");
assert.notEqual(freshPrivate.tree, null); freshPrivate.flush();
assert.equal(reloads, beforeFresh);

// An approved subset must also constrain SDK lifetime, even when the excluded
// destination is otherwise a reviewed, public product page.
({ metaBrowserContextAllowed } = loadMetaBrowserFixture({
  approvedPaths: { PageView: ["/", "/products/psl-rs-5ml"] }, approvedProductIds: ["PSL-RS-5ML"],
}));
freshDocument("/", true).flush();
const narrowAssignments = assigned.length, narrowUpdates = historyUpdates;
browser.history.pushState({}, "", "/products/psl-rs-5ml");
assert.equal(historyUpdates, narrowUpdates + 1, "an approved page stays within the current document");
assert.equal(assigned.length, narrowAssignments);
browser.history.replaceState({}, "", "/products/psl-rt-10mg");
assert.equal(historyUpdates, narrowUpdates + 1, "an excluded reviewed page never reaches SPA history");
assert.equal(assigned.length, narrowAssignments + 1, "one full navigation replaces the loaded SDK document");
assert.equal(assigned.at(-1), "https://www.psllabs.org/products/psl-rt-10mg");
pathname = "/products/psl-rt-10mg";
assert.equal(render().tree, null, "excluded reviewed content cannot render under the old SDK");
tiktokLoaded = true;
freshDocument("/products/psl-rs-5ml", false).flush();
const beforeTikTokStops = tiktokStops;
const beforeTikTokUpdates = historyUpdates;
browser.history.pushState({}, "", "/admin-ledger.01?orderId=private");
assert.equal(historyUpdates, beforeTikTokUpdates, "TikTok must not observe admin SPA history");
assert.equal(assigned.at(-1), "https://www.psllabs.org/admin-ledger.01?orderId=private");
assert.equal(tiktokStops, beforeTikTokStops + 1, "TikTok dispatch stops before the excluded document loads");
pathname = "/admin-ledger.01";
assert.equal(render().tree, null, "admin children cannot mount inside a loaded TikTok document");
tiktokLoaded = false;
freshDocument("/products", false).flush();
const idleReloads = reloads;
const restored = new Event("pageshow");
Object.defineProperty(restored, "persisted", { value: true });
events.dispatchEvent(new Event("pagehide"));
events.dispatchEvent(restored);
assert.equal(reloads, idleReloads, "documents without advertising SDKs do not reload on BFCache restoration");

for (const provider of ["meta", "tiktok"] as const) {
  tiktokLoaded = provider === "tiktok";
  freshDocument("/products", provider === "meta").flush();
  const beforeHideMeta = metaStops, beforeHideTikTok = tiktokStops;
  const beforeRestore: number = reloads;
  events.dispatchEvent(new Event("psl-privacy-withdrawal"));
  assert.ok(metaStops > beforeHideMeta && tiktokStops > beforeHideTikTok,
    "withdrawal revokes loaded SDKs synchronously without awaiting a React effect");
  events.dispatchEvent(new Event("pagehide"));
  assert.ok(metaStops > beforeHideMeta && tiktokStops > beforeHideTikTok,
    "advertising dispatch is revoked before a document enters BFCache");
  assert.equal(reloads, beforeRestore, "pagehide itself does not disrupt document navigation");
  events.dispatchEvent(new Event("pageshow"));
  assert.equal(reloads, beforeRestore, "a normal pageshow does not create a reload loop");
  events.dispatchEvent(restored);
  assert.equal(reloads, beforeRestore + 1, `${provider} restoration requires fresh server consent in a new document`);
}
tiktokLoaded = false;
unsubscribe?.();
console.log("[test-application-privacy-boundary] public/private, advertising URL/query/referrer, links, history, BFCache and Meta/TikTok fresh-document isolation checks passed offline");
