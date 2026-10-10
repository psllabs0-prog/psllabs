import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { readPrivacyConsent } from "../lib/privacy/client";
import * as events from "../lib/meta-ads/events";

/** Offline-only module injection; production exposes no policy override. */
export function loadMetaBrowserFixture(policy: events.MetaEventPolicy): typeof import("../lib/meta-ads/browser") {
  const source = readFileSync("lib/meta-ads/browser.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const mocks: Record<string, unknown> = {
    "../privacy/client": { readPrivacyConsent },
    "./events": { ...events, PRODUCTION_META_EVENT_POLICY: policy },
  };
  const exports = {};
  new Script(`(function(require,exports){${compiled}\n})`).runInThisContext()((name: string) => {
    assert(name in mocks, `Unmocked browser dependency: ${name}`);
    return mocks[name];
  }, exports);
  return exports as typeof import("../lib/meta-ads/browser");
}
