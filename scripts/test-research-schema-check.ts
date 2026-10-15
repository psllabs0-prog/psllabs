import assert from "node:assert/strict";
import { assertReviewedQualificationConstraints } from "./research-accounts-schema-check";

const reviewed=[
  {expression:'("ageConfirmed" = true)',validated:true},
  {expression:'("researchUseConfirmed" = true)',validated:true},
  {expression:'("researchStatus" = ANY (ARRAY[\'academic_institutional\'::text, \'commercial_laboratory\'::text, \'independent_researcher\'::text]))',validated:true},
];
assert.doesNotThrow(()=>assertReviewedQualificationConstraints(reviewed));
let checks=1;
for (const replacement of [
  {index:0,expression:'("ageConfirmed" = false)'},
  {index:0,expression:'("ageConfirmed" = true OR true)'},
  {index:1,expression:'("researchUseConfirmed" IS NOT NULL)'},
  {index:2,expression:'("researchStatus" <> \'patient\'::text)'},
  {index:2,expression:'("researchStatus" = ANY (ARRAY[\'academic_institutional\'::text, \'commercial_laboratory\'::text, \'independent_researcher\'::text, \'patient\'::text]))'},
  {index:2,expression:'("researchStatus" = ANY (ARRAY[\'academic_institutional\'::text, \'commercial_laboratory\'::text, \'independent_ researcher\'::text]))'},
  {index:2,expression:'("researchStatus" = ANY (ARRAY[\'academic_institutional\'::text, \'commercial_laboratory\'::text, \'independent_researcher()\'::text]))'},
]){
  assert.throws(()=>assertReviewedQualificationConstraints(reviewed.map((row,index)=>index===replacement.index?{...row,expression:replacement.expression}:row)));checks++;
}
for (let index=0;index<reviewed.length;index++){
  assert.throws(()=>assertReviewedQualificationConstraints(reviewed.map((row,i)=>i===index?{...row,validated:false}:row)));checks++;
}
assert.throws(()=>assertReviewedQualificationConstraints(reviewed.slice(1)));checks++;
console.log(`Research qualification schema checks: ${checks} passed; weak, unvalidated and expanded-role CHECKs rejected offline.`);
