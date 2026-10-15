import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { getMigrations } from "better-auth/db/migration";
import { createResearchAuth } from "../lib/research-auth/auth";
import { assertReviewedQualificationConstraints } from "./research-accounts-schema-check";

const EXPECTED_PROJECT="prj_2okzpd1tXGerE2c5i0zdjExu8tLd";
const SETUP_FLAG="reviewed-kashu-20261014-v1";
const authTables=["research_auth_user","research_auth_session","research_auth_account","research_auth_verification","research_auth_rate_limit"].sort();

/** Operator build command only; there is no HTTP route or request-time DDL. */
async function main(){
  if(!process.argv.includes("--apply-reviewed-public-schema")){console.log("Plan only: reviewed additive research-auth SQL in one public transaction plus nullable orders.research_acknowledgement JSONB; metadata snapshots, CHECK verification, read-only SDK plan; no customer/order row writes.");return;}
  assert.equal(process.env.PSL_RESEARCH_SETUP,SETUP_FLAG,"Explicit reviewed build flag required.");
  assert.equal(process.env.VERCEL,"1","Provider build context required.");
  assert.equal(process.env.VERCEL_ENV,"production","Staged production context required.");
  assert.equal(process.env.VERCEL_PROJECT_ID,EXPECTED_PROJECT,"Verified PSL project required.");
  assert.notEqual(process.env.PSL_VISUAL_PREVIEW,"1","Production auth may not use a design-preview database bypass.");
  const connectionString=process.env.DATABASE_URL||process.env.POSTGRES_URL;
  const secret=process.env.RESEARCH_AUTH_SECRET?.trim();
  assert.ok(connectionString&&secret&&secret.length>=32,"Existing database and dedicated new auth secret required.");
  const url=new URL(connectionString!);assert.ok(["postgres:","postgresql:"].includes(url.protocol)&&url.hostname.endsWith(".neon.tech"),"Existing Neon database required.");
  const pool=new Pool({connectionString,options:"-c search_path=public",max:2,connectionTimeoutMillis:10000,idleTimeoutMillis:1000});
  const report:Record<string,unknown>={project:EXPECTED_PROJECT,setupVersion:SETUP_FLAG,productionAccountWrites:0,orderRowWrites:0,mailSends:0,providerCalls:0};
  try{
    const snapshot=async()=>{
      const exists=await pool.query("SELECT to_regclass('public.orders') IS NOT NULL AS orders,to_regclass('public.products') IS NOT NULL AS products,to_regclass('public.partner_registration_profiles') IS NOT NULL AS partners,to_regclass('public.research_auth_user') IS NOT NULL AS auth");
      assert.ok(exists.rows[0].orders&&exists.rows[0].products&&exists.rows[0].partners,"Existing PSL schema required.");
      const core=await pool.query("SELECT (SELECT count(*)::int FROM public.orders) AS orders,(SELECT count(*)::int FROM public.products) AS products,(SELECT count(*)::int FROM public.partner_registration_profiles) AS partner_profiles");
      const identities=await pool.query("SELECT relname,oid::text FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname",[["orders","products","partner_registration_profiles",...authTables]]);
      const accounts=exists.rows[0].auth?Number((await pool.query("SELECT count(*)::int AS accounts FROM public.research_auth_user")).rows[0].accounts):0;
      return {...core.rows[0],researchAccounts:accounts,relations:identities.rows};
    };
    const before=await snapshot();report.before=before;
    const column=await pool.query("SELECT atttypid::regtype::text AS type FROM pg_attribute WHERE attrelid='public.orders'::regclass AND attname='research_acknowledgement' AND NOT attisdropped");
    assert.ok(!column.rows.length||column.rows[0].type==="jsonb","Existing order acknowledgement type must be reviewed JSONB.");
    const sql=readFileSync(resolve("scripts/research-accounts-schema.sql"),"utf8");
    assert.ok(!/^\s*(?:DROP|TRUNCATE|DELETE|UPDATE|ALTER)\b/im.test(sql),"Reviewed auth SQL must be additive.");
    const client=await pool.connect();
    try{
      await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtext('psl-research-auth-bootstrap-v1'))");
      await client.query("SET LOCAL search_path TO public");await client.query(sql);
      await client.query("ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS research_acknowledgement JSONB");
      const constraints=await client.query("SELECT pg_get_expr(conbin,conrelid) AS expression,convalidated AS validated FROM pg_constraint WHERE conrelid='public.research_auth_user'::regclass AND contype='c'");
      assertReviewedQualificationConstraints(constraints.rows);
      await client.query("COMMIT");
    }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
    const configured=createResearchAuth({database:pool,secret:secret!,baseURL:"https://www.psllabs.org",sendPasswordReset:async()=>{throw new Error("Bootstrap never sends account mail.");}});
    const sdkPlan=await getMigrations(configured.options,{throwOnUnsafe:false});
    assert.equal(sdkPlan.toBeCreated.length,0,"SDK must find all dedicated tables.");
    assert.equal(sdkPlan.toBeAdded.length,0,"SDK must find all required fields.");
    assert.equal(sdkPlan.unsafeChanges.length,0,"SDK unsafe-change plan must be empty.");
    assert.equal(sdkPlan.schemaProblems.length,0,"SDK schema findings must be empty.");
    // Existing compatible manual indexes may have different names; metadata-only
    // SDK index suggestions are reported, never executed by this checker.
    report.sdkIndexSuggestions=sdkPlan.toBeAddedIndexes.length;
    const after=await snapshot();report.after=after;
    assert.equal(after.researchAccounts,before.researchAccounts,"Bootstrap may not create production customer accounts.");
    for(const relation of before.relations){assert.ok(after.relations.some((candidate:{relname:string;oid:string})=>candidate.relname===relation.relname&&candidate.oid===relation.oid),"Existing relation identity must be preserved.");}
    report.applied=true;report.qualificationChecksVerifiedBeforeCommit=true;report.sdkReadOnlyCompatibilityPassed=true;
    console.log(JSON.stringify(report));
  }finally{await pool.end();}
}
main().catch(()=>{console.error("Reviewed research-account bootstrap did not pass. Current live deployment must remain unchanged; inspect the sanitized stage and schema plan.");process.exitCode=1;});
