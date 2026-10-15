import assert from "node:assert/strict";
import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { getAuthTables } from "better-auth/db";
import { NextRequest } from "next/server";
import { createResearchAuth } from "../lib/research-auth/auth";
import { createResearchRequestGuard } from "../lib/research-auth/guard";
import { RESEARCH_QUALIFICATION_VERSION, safeResearchReturnPath } from "../lib/research-auth/qualification";
import { createResearchAccountReader } from "../lib/research-auth/server";
import { researchPathRequiresAccount } from "../lib/research-auth/paths";

let checks = 0;
function ok(value: unknown, message: string) { assert.ok(value, message);checks++; }
function equal(actual: unknown, expected: unknown, message: string) { assert.deepEqual(actual,expected,message);checks++; }
const origin = "http://localhost:4090";
const database: MemoryDB = {};
const resetMessages: Array<{email:string;url:string}> = [];
const auth = createResearchAuth({ database: memoryAdapter(database), baseURL: origin,
  secret: "offline-test-only-research-secret-not-a-production-secret", rateLimitEnabled: false,
  sendPasswordReset: async (email,url) => { resetMessages.push({email,url}); } });
for (const table of Object.values(getAuthTables(auth.options))) database[table.modelName] = [];
const signup = { name: "Research account", email: "research-auth-qa@example.invalid", password: "A unique laboratory test passphrase!",
  researchStatus: "independent_researcher", ageConfirmed: true, researchUseConfirmed: true };

async function post(path: string, body: unknown, cookie = "", requestOrigin = origin) {
  return auth.handler(new Request(`${origin}/api/research-auth/${path}`, { method: "POST",
    headers: { "content-type": "application/json", origin: requestOrigin, cookie, "user-agent": "PSL offline QA" }, body: JSON.stringify(body) }));
}
function responseCookie(response: Response): string {
  return response.headers.getSetCookie().map(cookie=>cookie.split(";")[0]).join("; ");
}
const readAccount=createResearchAccountReader(()=>auth);
const guard=createResearchRequestGuard(readAccount);
function page(path: string,cookie="", headers:Record<string,string>={}) {return new NextRequest(origin+path,{headers:{cookie,...headers}});}

async function main() {
  for (const fields of [
    {researchStatus:""}, {researchStatus:"patient"}, {researchStatus:null}, {researchStatus:undefined},
    {ageConfirmed:false}, {ageConfirmed:"true"}, {ageConfirmed:undefined},
    {researchUseConfirmed:false}, {researchUseConfirmed:"true"}, {researchUseConfirmed:undefined},
    {password:"short"}, {password:"x".repeat(129)},
  ]) { const result=await post("sign-up/email",{...signup,...fields});ok(result.status>=400,"invalid signup rejected");equal(database.research_auth_user.length,0,"invalid signup creates no user"); }
  const created=await post("sign-up/email",{...signup, qualificationVersion:"forged", qualifiedAt:"2000-01-01"});
  equal(created.status,200,"free instant signup succeeds");
  const cookie=responseCookie(created);ok(cookie.includes("psl_research.session_token="),"dedicated session cookie");
  const setCookie=created.headers.getSetCookie().join(";");ok(setCookie.includes("HttpOnly"),"HttpOnly cookie");ok(/SameSite=Lax/i.test(setCookie),"SameSite cookie");
  equal(database.research_auth_user.length,1,"dedicated user");equal(database.research_auth_account.length,1,"dedicated credential account");
  const stored=database.research_auth_user[0];equal(stored.qualificationVersion,RESEARCH_QUALIFICATION_VERSION,"qualification version server owned");
  ok(stored.qualifiedAt instanceof Date && stored.qualifiedAt.getFullYear()>=2026,"qualification time server owned");
  const credential=database.research_auth_account[0];ok(typeof credential.password==="string"&&credential.password!==signup.password&&!credential.password.includes(signup.password),"password hashed");
  const account=await readAccount(new Headers({cookie}));ok(account,"real library session authenticated");
  const protectedPaths=["/","/products","/products/psl-rt-10mg","/products/retatrutide","/faq","/coa","/testing","/shipping","/returns","/disclaimer","/guides","/science","/partners","/partners/register","/checkout","/research-account","/api/inventory/availability","/api/authnet-config","/api/checkout","/api/checkout-card","/api/checkout/card/session","/api/checkout/apply-discount","/api/newsletter","/api/partners/enroll","/api/unknown-catalog"];
  for(const path of protectedPaths){
    for(const invalidCookie of ["","psl_research.session_token=forged","psl_admin_session=separate-identity","psl_partner_session=separate-identity"]){
      const blocked=await guard(page(path,invalidCookie,{"x-psl-research-request-path":"/terms","rsc":"1"}));
      equal(blocked.status,path.startsWith("/api/")?401:307,path+" anonymous/forged RSC rejected");
      equal(blocked.headers.get("cache-control"),"private, no-store",path+" unauth no-store");
      const body=await blocked.text();ok(!body.includes("59.99")&&!body.includes("application/ld+json"),path+" no catalog payload");
    }
    const allowed=await guard(page(path,cookie));equal(allowed.headers.get("x-middleware-next"),"1",path+" real account allowed");
    equal(allowed.headers.get("x-middleware-request-x-psl-research-request-path"),path,path+" trusted path overwritten");
  }
  for(const path of ["/research-account/sign-in","/research-account/sign-up","/research-account/forgot-password","/terms","/privacy","/contact","/payment-return","/success","/cancel","/unsubscribe","/newsletter/confirm","/api/checkout/card","/api/tagada-webhook","/api/btcpay-webhook","/api/cron/finance-reconcile","/api/admin/inventory","/api/partners/auth/verify","/api/partners/account","/api/integrations/n8n/mission-control/runs","/api/privacy/consent","/api/marketing/unsubscribe","/api/order-status","/_next/static/app.js","/branding/psl-logo-web.png"]){equal(researchPathRequiresAccount(path),false,path+" explicit public/independently authenticated route");}
  const legacyReturn=await guard(page("/checkout?paymentAction=requireAction&paymentId=qa-only"));
  equal(legacyReturn.status,307,"legacy recovery starts a new unambiguous document");
  ok(legacyReturn.headers.get("location")?.includes("/payment-return?"),"legacy recovery goes only to recovery page");
  equal(legacyReturn.headers.get("Referrer-Policy"),"no-referrer","recovery hints stay out of referrers");
  for(const unsafe of ["https://evil.example","//evil.example","/api/checkout","/admin","/research-account/sign-in","/\\evil.example","/%61dmin"]){equal(safeResearchReturnPath(unsafe),"/","unsafe return target rejected");}
  equal(safeResearchReturnPath("/products/psl-rt-10mg?email=private&token=private"),"/products/psl-rt-10mg","private query stripped");
  equal((await post("sign-in/email",{email:signup.email,password:"wrong password"})).status,401,"wrong password rejected");
  equal((await post("sign-in/email",{email:signup.email,password:signup.password},"","https://evil.example")).status,403,"cross-site origin rejected");
  const updated=await post("update-user",{researchStatus:"patient"},cookie);ok(updated.status>=400,"invalid declaration update rejected");
  const signout=await post("sign-out",{},cookie);equal(signout.status,200,"signout succeeds");equal(await readAccount(new Headers({cookie})),null,"stolen former cookie revoked");
  equal((await guard(page("/products",cookie))).status,307,"revoked session cannot regain store");
  const login=await post("sign-in/email",{email:signup.email,password:signup.password});equal(login.status,200,"password sign-in works");const secondCookie=responseCookie(login);
  const activeSession=database.research_auth_session[0];const originalExpiry=activeSession.expiresAt;
  activeSession.expiresAt=new Date(Date.now()-10000);equal(await readAccount(new Headers({cookie:secondCookie})),null,"expired session rejected");
  activeSession.expiresAt=originalExpiry;
  const freshLogin=await post("sign-in/email",{email:signup.email,password:signup.password});const resetCookie=responseCookie(freshLogin);
  stored.researchUseConfirmed=false;equal(await readAccount(new Headers({cookie:resetCookie})),null,"invalid stored declaration cannot unlock store");stored.researchUseConfirmed=true;
  const unknownReset=await post("request-password-reset",{email:"unknown@example.invalid",redirectTo:origin+"/research-account/reset-password"});
  const knownReset=await post("request-password-reset",{email:signup.email,redirectTo:origin+"/research-account/reset-password"});
  equal(knownReset.status,200,"known password reset requested");equal(await knownReset.json(),await unknownReset.json(),"reset response does not reveal registration");equal(resetMessages.length,1,"only registered reset addressed; no real mail");
  const token=new URL(resetMessages[0].url).pathname.split("/").at(-1)!;const newPassword="A different laboratory test passphrase!";
  equal((await post("reset-password",{token,newPassword})).status,200,"one-time reset succeeds");
  equal(await readAccount(new Headers({cookie:resetCookie})),null,"reset revokes old sessions");
  ok((await post("reset-password",{token,newPassword})).status>=400,"reset token cannot replay");
  equal((await post("sign-in/email",{email:signup.email,password:signup.password})).status,401,"old password no longer works");
  equal((await post("sign-in/email",{email:signup.email,password:newPassword})).status,200,"new password works");
  console.log(`Research accounts: ${checks} checks passed. Actual Better Auth memory adapter; no database, provider, mail, advertising or order writes.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
