import { spawnSync } from "node:child_process";

/** One explicitly flagged operator build; ordinary builds and requests do no setup. */
if(process.env.PSL_RESEARCH_SETUP==="reviewed-kashu-20261014-v1"){
  if(process.env.VERCEL!=="1"||process.env.VERCEL_ENV!=="production"||
      process.env.VERCEL_PROJECT_ID!=="prj_2okzpd1tXGerE2c5i0zdjExu8tLd"){
    throw new Error("Research setup requires the verified PSL staged-production build context.");
  }
  for(const args of [
    ["scripts/test-research-accounts-pg.ts","--run-isolated-qa","--environment"],
    ["scripts/bootstrap-research-accounts.ts","--apply-reviewed-public-schema"],
  ]){
    const result=spawnSync(process.execPath,["--import","tsx",...args],{stdio:"inherit",env:process.env});
    if(result.error||result.status!==0)throw new Error("Research-account operator checks failed; do not promote this build.");
  }
}
