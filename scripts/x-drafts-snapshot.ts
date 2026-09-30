/**
 * Regenerates lib/x-drafts/source-snapshot.ts from the allowlist in
 * lib/x-drafts/sources.ts. `--check` exits 1 when the committed snapshot is
 * stale. Reads only the allowlisted files; no network or database access.
 */
import fs from "node:fs";
import path from "node:path";

import { buildXDraftSources, renderXDraftSnapshotModule } from "../lib/x-drafts/source-build";

const target = path.join(process.cwd(), "lib/x-drafts/source-snapshot.ts");
const next = renderXDraftSnapshotModule(buildXDraftSources());
const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8").replace(/\r\n?/g, "\n") : "";

if (process.argv.includes("--check")) {
  if (current !== next) {
    console.error("lib/x-drafts/source-snapshot.ts is stale. Run `npm run x-drafts:snapshot` and review the diff.");
    process.exit(1);
  }
  console.log("Source snapshot is current.");
} else {
  fs.writeFileSync(target, next, "utf8");
  console.log(current === next ? "Source snapshot unchanged." : "Source snapshot written — review the diff before committing.");
}
