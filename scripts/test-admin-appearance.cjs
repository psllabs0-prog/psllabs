/** Offline presentation checks only. No network, database, credentials or actions.
 * Run: node scripts/test-admin-appearance.cjs
 * For browser acceptance, also inspect the authenticated read-only Preview.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const postcss = require("postcss");

const root = path.resolve(__dirname, "..");
const cssPath = path.join(root, "components/admin/admin-appearance.module.css");
const css = fs.readFileSync(cssPath, "utf8");
const component = fs.readFileSync(path.join(root, "components/admin/admin-appearance.tsx"), "utf8");
const parsed = postcss.parse(css);
let rules = 0;
parsed.walkRules((rule) => {
  assert.match(rule.selector, /^\.root(?:\s|$)/, `Unscoped CSS: ${rule.selector}`);
  assert.doesNotMatch(rule.selector, /:global|(^|[\s,])(html|body)(?=[\s,:.#\[]|$)/);
  rules++;
});
assert(rules >= 20, "Theme rules were parsed");
assert.doesNotMatch(component, /use client|useEffect|usePathname|document\.|fetch\(|getSql|process\.env/);
assert.match(component, /data-psl-admin-appearance="light"/);
assert.match(css, /color-scheme:\s*light/);
assert.match(css, /:disabled\s*\{/);
assert.match(css, /:focus-visible\s*\{/);
assert.match(css, /::placeholder\s*\{/);
assert.doesNotMatch(css, /pointer-events\s*:/, "CSS must not change interaction permissions");
assert.doesNotMatch(css, /\.root\s+\*\s*\{/, "No blanket all-black descendant rule");

const dirs = fs.readdirSync(path.join(root, "app"), { withFileTypes: true })
  // The isolated fictional scenario intentionally uses a demo-only shell.
  .filter((d) => d.isDirectory() && /^admin(?:-|$)/.test(d.name) && d.name !== "admin-ledger.01")
  .map((d) => d.name);
assert(dirs.length >= 17, "All known admin routes are present");
for (const dir of dirs) {
  const layout = fs.readFileSync(path.join(root, "app", dir, "layout.tsx"), "utf8");
  assert.match(layout, /export \{ default \} from "@\/components\/admin\/admin-appearance"/);
}
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}
for (const file of walk(path.join(root, "app"))) {
  const rel = path.relative(path.join(root, "app"), file).split(path.sep);
  if (/^admin(?:-|$)/.test(rel[0]) || !/\.(tsx?|jsx?|css)$/.test(file)) continue;
  assert(!fs.readFileSync(file, "utf8").includes("admin-appearance"), `Public import: ${rel.join("/")}`);
}

const colors = {};
parsed.walkDecls(/^--admin-/, (d) => { colors[d.prop] = d.value; });
function luminance(hex) {
  const rgb = hex.replace("#", "").match(/../g).map((v) => parseInt(v, 16) / 255);
  const linear = rgb.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const pairs = [
  ["main/surface", colors["--admin-text"], colors["--admin-surface"], 4.5],
  ["main/page", colors["--admin-text"], colors["--admin-page"], 4.5],
  ["muted/page", colors["--admin-muted"], colors["--admin-page"], 4.5],
  ["placeholder/surface", colors["--admin-placeholder"], colors["--admin-surface"], 4.5],
  ["link/page", colors["--admin-link"], colors["--admin-page"], 4.5],
  ["inverse button", "#ffffff", colors["--admin-text"], 4.5],
  ["accent button", "#ffffff", colors["--admin-link"], 4.5],
  ["disabled label", colors["--admin-muted"], colors["--admin-disabled-bg"], 4.5],
  ["error/page", colors["--admin-error"], colors["--admin-page"], 4.5],
  ["warning/amber", colors["--admin-warning"], "#fef3c7", 4.5],
  ["success/green", colors["--admin-success"], "#ecfdf5", 4.5],
  ["control border", colors["--admin-control-border"], colors["--admin-surface"], 3],
];
for (const [name, a, b, minimum] of pairs) {
  const ratio = contrast(a, b);
  assert(ratio >= minimum, `${name}: ${ratio} < ${minimum}`);
  console.log(`[admin-appearance] ${name}: ${ratio.toFixed(2)}:1`);
}
console.log(`[admin-appearance] PASS: ${dirs.length} admin layouts, ${rules} scoped rules, ${pairs.length} palette contrast checks. Browser/full-site acceptance remains separate.`);
