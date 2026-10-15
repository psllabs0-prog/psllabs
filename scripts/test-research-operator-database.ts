import assert from "node:assert/strict";
import { researchOperatorConnection, operatorErrorCode } from "./research-accounts-operator-database";

const pooled="postgresql://operator:p%40ss@ep-test-safe-123-pooler.us-east-2.aws.neon.tech/research?sslmode=require&channel_binding=require";
const direct=pooled.replace("-pooler.",".");
let checks=0;
const derived=researchOperatorConnection({DATABASE_URL:pooled});
assert.equal(derived.connectionString,direct);checks++;
assert.equal(derived.connectionMode,"same-endpoint-unpooled-host");checks++;
assert.equal(researchOperatorConnection({DATABASE_URL:direct}).connectionString,direct);checks++;
assert.equal(researchOperatorConnection({DATABASE_URL:pooled,POSTGRES_URL_NON_POOLING:direct}).source,"POSTGRES_URL_NON_POOLING");checks++;
for(const bad of [direct.replace("ep-test-safe-123.","ep-other-123."),direct.replace("/research?","/other?"),direct.replace("operator:","other:"),pooled,direct.replace("sslmode=require","sslmode=disable"),direct.replace(".neon.tech/",".example.test/")]){
  assert.throws(()=>researchOperatorConnection({DATABASE_URL:pooled,POSTGRES_URL_NON_POOLING:bad}));checks++;
}
for(const bad of ["",direct.replace("sslmode=require","sslmode=prefer"),direct.replace("postgresql:","https:"),direct.replace(".neon.tech/",".example.test/")]){
  assert.throws(()=>researchOperatorConnection({DATABASE_URL:bad}));checks++;
}
assert.equal(operatorErrorCode({code:"08P01",message:pooled}),"08P01");checks++;
assert.equal(operatorErrorCode({code:"ENOTFOUND",message:pooled}),"ENOTFOUND");checks++;
assert.equal(operatorErrorCode({code:pooled}),null);checks++;
assert.equal(operatorErrorCode(new Error(pooled)),null);checks++;
console.log(`Operator database selection: ${checks} checks passed; same endpoint/database/role and TLS preserved, no real connection or secret output.`);
