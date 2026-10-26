import {Buffer} from 'node:buffer';
import {createClient} from '@supabase/supabase-js';
import {verifyAssessment} from '../../../src/features/assessments/verify.ts';
globalThis.Buffer=Buffer;
const maxBytes=9_000_000;
Deno.serve(async(req:Request)=>{
 const origin=Deno.env.get('ALLOWED_ORIGIN');const headers={'Access-Control-Allow-Origin':origin||'null','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Vary':'Origin'};
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
 if(!origin)return reply(503,{error:'Submission origin is not configured'});if(req.headers.get('Origin')&&req.headers.get('Origin')!==origin)return reply(403,{error:'Origin is not permitted'});if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='POST')return reply(405,{error:'POST required'});
 try{
  if(Number(req.headers.get('Content-Length')||0)>maxBytes)return reply(413,{error:'Payload too large'});
  const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))return reply(401,{error:'Authentication required'});
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data:{user},error:authError}=await admin.auth.getUser(auth.slice(7));if(authError||!user?.email_confirmed_at)return reply(401,{error:'Verified account required'});
  const rate=await admin.rpc('check_submission_rate',{p_student:user.id});if(rate.error)throw rate.error;if(!rate.data)return reply(429,{error:'Too many requests. Autosave retries shortly.'});
  const reader=req.body?.getReader();if(!reader)return reply(400,{error:'Missing body'});let size=0;const chunks:Uint8Array[]=[];while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>maxBytes){await reader.cancel();return reply(413,{error:'Payload too large'});}chunks.push(r.value);}const bytes=new Uint8Array(size);let pos=0;for(const c of chunks){bytes.set(c,pos);pos+=c.length;}const payload=JSON.parse(new TextDecoder().decode(bytes));
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(payload.version!==2||!uuid.test(payload.attemptId)||!uuid.test(payload.idempotencyKey)||!['checkpoint','submit'].includes(payload.action)||!Number.isInteger(payload.revision)||payload.revision<0)return reply(400,{error:'Invalid submission envelope'});
  const {data:context,error}=await admin.rpc('assessment_verification_context',{p_attempt:payload.attemptId,p_student:user.id});if(error)throw error;
  if(context.attempt.status!=='in_progress')return context.attempt.idempotency_key===payload.idempotencyKey||context.attempt.auto_submitted?reply(200,{receipt:context.attempt.receipt,status:context.attempt.status,revision:context.attempt.checkpoint_revision}):reply(409,{error:'Attempt already finalized'});
  const verified=await verifyAssessment(context.definition,payload,context.identity,context.keys);
  const {data:result,error:saveError}=await admin.rpc('accept_assessment_checkpoint',{p_student:user.id,p_attempt:payload.attemptId,p_revision:payload.revision,p_payload:verified.payload,p_outcomes:verified.outcomes,p_grades:verified.grades,p_practical:verified.practicalScore,p_objective:verified.objectiveScore,p_finalize:payload.action==='submit',p_key:payload.idempotencyKey});if(saveError)throw saveError;
  return reply(200,result);
 }catch(e){const message=e instanceof Error?e.message:(e as {message?:string})?.message||'Assessment request could not be verified';return reply(message.includes('conflict')?409:400,{error:message});}
});
