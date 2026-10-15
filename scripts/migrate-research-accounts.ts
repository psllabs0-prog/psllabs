import { getMigrations } from "better-auth/db/migration";
import { getResearchAuth } from "../lib/research-auth/auth";

/** Read-only SDK compatibility plan. The reviewed SQL bootstrap owns changes. */
async function main() {
  if (process.argv.includes("--apply")) {
    throw new Error("SDK application is disabled. Use the explicitly flagged reviewed SQL bootstrap.");
  }
  const migration = await getMigrations(getResearchAuth().options);
  const tables = [...migration.toBeCreated, ...migration.toBeAdded].map(row => row.table);
  const indexes = migration.toBeAddedIndexes.map(row => row.table);
  if ([...tables, ...indexes].some(table => !table.startsWith("research_auth_"))) {
    throw new Error("Refusing a migration outside the dedicated research-account tables.");
  }
  if (migration.unsafeChanges.length || migration.schemaProblems.length) {
    throw new Error("Research-account schema needs review before applying changes.");
  }
  console.log(JSON.stringify({ tablesToCreate: migration.toBeCreated.map(row => row.table),
    tablesToAlter: migration.toBeAdded.map(row => row.table), indexesToAdd: migration.toBeAddedIndexes.length,
    applied: false }));
}

main().catch(() => { console.error("Research-account migration did not complete. Check configuration and the reviewed migration plan."); process.exitCode = 1; });
