import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

export function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv: string[]): { product: string; qty: number | null } {
  let product = "";
  let qty: number | null = null;

  for (const arg of argv) {
    if (arg.startsWith("--product=")) {
      product = arg.slice("--product=".length).trim();
    }
    if (arg.startsWith("--qty=")) {
      qty = Number(arg.slice("--qty=".length).trim());
    }
  }

  return { product, qty };
}

export function parseStockArgs(argv = process.argv.slice(2)) {
  return parseArgs(argv);
}
