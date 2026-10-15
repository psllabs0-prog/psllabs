import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { getMigrations } from "better-auth/db/migration";
import { createResearchAuth } from "../lib/research-auth/auth";
import { createResearchAccountReader } from "../lib/research-auth/server";
import { createResearchRequestGuard } from "../lib/research-auth/guard";
import { assertReviewedQualificationConstraints } from "./research-accounts-schema-check";

const QA_SCHEMA = /^psl_research_qa_\d{8}_[a-f0-9]{16}$/;
const tables = ["research_auth_user","research_auth_session","research_auth_account","research_auth_verification","research_auth_rate_limit"].sort();

async function main() {
  if (!process.argv.includes("--run-isolated-qa")) {
    console.log("Plan only: create one random psl_research_qa_YYYYMMDD_<16hex> schema; apply reviewed SQL there; test real BetterAuth/Postgres with capture-only mail; verify owner/OID/prefix and drop ONLY that schema. No public records, provider calls or real mail.");return;
  }
  const envFile=process.argv.find(arg=>arg.startsWith("--env-file="))?.slice(11);
  const fromEnvironment=process.argv.includes("--environment");
  if ((!envFile&&!fromEnvironment)||(envFile&&fromEnvironment)) throw new Error("Choose exactly one explicit protected configuration source.");
  const protectedEnv=fromEnvironment?process.env:parseEnv(readFileSync(envFile!,"utf8"));
  const connectionString=protectedEnv.DATABASE_URL || protectedEnv.POSTGRES_URL;
  if (!connectionString) throw new Error("No database connection is configured.");
  const databaseUrl=new URL(connectionString);
  if (!["postgres:","postgresql:"].includes(databaseUrl.protocol) || !databaseUrl.hostname.endsWith(".neon.tech")) throw new Error("Expected existing Neon PostgreSQL connection.");
  const schema=`psl_research_qa_${new Date().toISOString().slice(0,10).replaceAll("-","")}_${randomBytes(8).toString("hex")}`;
  if (!QA_SCHEMA.test(schema)) throw new Error("Invalid QA schema guard.");
  const control=new Pool({connectionString,max:1,connectionTimeoutMillis:10000,idleTimeoutMillis:1000});
  const isolated=new Pool({connectionString,options:`-c search_path=${schema}`,max:2,connectionTimeoutMillis:10000,idleTimeoutMillis:1000});
  let createdOid:string|null=null,stage="preflight",checks=0;
  const check=(truth:unknown,message:string)=>{assert.ok(truth,message);checks++;};
  const report:Record<string,unknown>={schema,startedAt:new Date().toISOString(),onlyTemporarySchema:true,publicAccountWrites:0,realMailSends:0,orderWrites:0,providerCalls:0};
  try {
    const existing=await control.query("SELECT to_regclass('public.orders') IS NOT NULL AS orders, to_regclass('public.products') IS NOT NULL AS products, to_regclass('public.partner_registration_profiles') IS NOT NULL AS partners");
    check(existing.rows[0].orders&&existing.rows[0].products&&existing.rows[0].partners,"expected PSL existing database schema");
    const publicBefore=await control.query("SELECT oid::text,relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname",[tables]);
    stage="create-isolated-schema";
    await control.query(`CREATE SCHEMA "${schema}"`);
    const identity=await control.query("SELECT oid::text, pg_get_userbyid(nspowner)=current_user AS owned FROM pg_namespace WHERE nspname=$1",[schema]);
    check(identity.rows.length===1&&identity.rows[0].owned===true,"QA schema owned by current operator");createdOid=identity.rows[0].oid;
    const current=await isolated.query("SELECT current_schema() AS schema");check(current.rows[0].schema===schema,"PG adapter isolated search_path");
    stage="apply-isolated-schema";
    const client=await isolated.connect();try{await client.query("BEGIN");await client.query(readFileSync(resolve("scripts/research-accounts-schema.sql"),"utf8"));await client.query("COMMIT");}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
    const createdTables=await isolated.query("SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename",[schema]);
    check(JSON.stringify(createdTables.rows.map(row=>row.tablename))===JSON.stringify(tables),"only reviewed dedicated tables created");
    const constraints=await isolated.query("SELECT pg_get_expr(conbin,conrelid) AS expression,convalidated AS validated FROM pg_constraint WHERE conrelid='research_auth_user'::regclass AND contype='c'");
    assertReviewedQualificationConstraints(constraints.rows);checks++;
    const origin="http://localhost:4091",messages:Array<{email:string;url:string}>=[];
    const auth=createResearchAuth({database:isolated,secret:randomBytes(48).toString("base64url"),baseURL:origin,
      sendPasswordReset:async(email,url)=>{messages.push({email,url});}});
    stage="isolated-sdk-compatibility";
    const sdkPlan=await getMigrations(auth.options,{throwOnUnsafe:false});
    check(!sdkPlan.toBeCreated.length&&!sdkPlan.toBeAdded.length&&!sdkPlan.unsafeChanges.length&&!sdkPlan.schemaProblems.length,"reviewed SQL satisfies actual SDK in isolated schema before public migration");
    report.sdkReadOnlyCompatibilityPassed=true;report.sdkIndexSuggestions=sdkPlan.toBeAddedIndexes.length;
    const reader=createResearchAccountReader(()=>auth),guard=createResearchRequestGuard(reader);
    const email=`${schema}@example.invalid`,password=randomBytes(30).toString("base64url");
    const signup={name:"Isolated research QA",email,password,researchStatus:"independent_researcher",ageConfirmed:true,researchUseConfirmed:true};
    const post=(path:string,body:unknown,cookie="")=>auth.handler(new Request(`${origin}/api/research-auth/${path}`,{method:"POST",headers:{"content-type":"application/json",origin,cookie,"x-forwarded-for":"127.0.0.1"},body:JSON.stringify(body)}));
    const cookie=(response:Response)=>response.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
    stage="actual-pg-signup";
    for(const invalid of [{researchStatus:"patient"},{ageConfirmed:false},{researchUseConfirmed:false}])check((await post("sign-up/email",{...signup,...invalid})).status>=400,"invalid declaration rejected");
    const created=await post("sign-up/email",signup);check(created.status===200,"actual PG signup");const firstCookie=cookie(created);
    check(Boolean(await reader(new Headers({cookie:firstCookie}))),"actual PG session read");
    const credential=await isolated.query('SELECT password FROM research_auth_account');check(credential.rows.length===1&&credential.rows[0].password!==password,"PG stores hashed password");
    const accountRows=await isolated.query('SELECT "researchStatus","ageConfirmed","researchUseConfirmed" FROM research_auth_user');
    check(accountRows.rows.length===1&&accountRows.rows[0].ageConfirmed===true&&accountRows.rows[0].researchUseConfirmed===true,"PG saved true declarations");
    const counters=await isolated.query('SELECT count(*)::int AS count FROM research_auth_rate_limit');check(counters.rows[0].count>0,"durable PG auth rate limits exercised");
    stage="actual-pg-boundary";
    for(const path of ["/","/products","/products/psl-rt-10mg","/checkout","/api/inventory/availability","/api/checkout/card/session"]){
      check((await guard(new NextRequest(origin+path))).status===(path.startsWith("/api/")?401:307),"PG anonymous boundary");
      check((await guard(new NextRequest(origin+path,{headers:{cookie:firstCookie}}))).headers.get("x-middleware-next")==="1","PG authenticated boundary");
    }
    check((await post("sign-out",{},firstCookie)).status===200,"PG signout");check(await reader(new Headers({cookie:firstCookie}))===null,"PG revocation");
    const login=await post("sign-in/email",{email,password});check(login.status===200,"PG password sign-in");const secondCookie=cookie(login);
    stage="actual-pg-reset";
    check((await post("request-password-reset",{email,redirectTo:origin+"/research-account/reset-password"})).status===200,"PG reset requested");
    check(messages.length===1,"reset captured only; no mail transport");const token=new URL(messages[0].url).pathname.split("/").at(-1)!;
    const newPassword=randomBytes(30).toString("base64url");check((await post("reset-password",{token,newPassword})).status===200,"PG one-time reset");
    check(await reader(new Headers({cookie:secondCookie}))===null,"PG reset revokes old session");
    check((await post("reset-password",{token,newPassword})).status>=400,"PG reset replay rejected");
    check((await post("sign-in/email",{email,password})).status===401,"PG old password rejected");check((await post("sign-in/email",{email,password:newPassword})).status===200,"PG new password works");
    const publicAfter=await control.query("SELECT oid::text,relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname",[tables]);
    check(JSON.stringify(publicBefore.rows)===JSON.stringify(publicAfter.rows),"public research-auth relations unchanged");
    report.passed=true;report.checks=checks;report.actualPostgresAdapter=true;report.captureOnlyPasswordReset=true;
  } catch(error) {
    report.passed=false;report.failedStage=stage;report.failure=error instanceof assert.AssertionError?error.message:"Isolated QA could not complete; no connection details printed.";process.exitCode=1;
  } finally {
    await isolated.end();
    if(createdOid){
      const current=await control.query("SELECT oid::text,pg_get_userbyid(nspowner)=current_user AS owned FROM pg_namespace WHERE nspname=$1",[schema]);
      if(!QA_SCHEMA.test(schema)||current.rows.length!==1||current.rows[0].oid!==createdOid||current.rows[0].owned!==true)throw new Error("Refusing cleanup: QA schema identity changed.");
      await control.query(`DROP SCHEMA "${schema}" CASCADE`);
      const absent=await control.query("SELECT to_regnamespace($1) IS NULL AS absent",[schema]);
      report.cleanupVerified=absent.rows[0].absent===true;
    }
    await control.end();report.finishedAt=new Date().toISOString();
    writeFileSync(resolve(tmpdir(),"psl-research-pg-qa-20261014.json"),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  }
}
main().catch(()=>{console.error("Isolated research-account QA stopped safely. Check the reviewed schema guard and sanitized report.");process.exitCode=1;});
