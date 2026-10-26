import {Buffer} from 'node:buffer';
import {createClient} from '@supabase/supabase-js';
import {verifySnapshot,validateAnswers} from '../../../src/features/submissions/verify.ts';
import {ASSIGNMENT_ID} from '../../../src/features/assignments/assignment.ts';
globalThis.Buffer=Buffer;
const maxBytes=9_000_000;
Deno.serve(async(req:Request)=>{
 const origin=Deno.env.get('ALLOWED_ORIGIN');
 const headers={'Access-Control-Allow-Origin':origin||'null','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Vary':'Origin'};
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
 if(!origin)return reply(503,{error:'Submission origin is not configured'});
 if(req.headers.get('Origin')&&req.headers.get('Origin')!==origin)return reply(403,{error:'Origin is not permitted'});
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return reply(405,{error:'POST required'});
 try{
  if(Number(req.headers.get('Content-Length')||0)>maxBytes)return reply(413,{error:'Payload too large'});
  const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))return reply(401,{error:'Authentication required'});
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data:{user},error:authError}=await admin.auth.getUser(auth.slice(7));if(authError||!user?.email_confirmed_at)return reply(401,{error:'Verified account required'});
  const rate=await admin.rpc('check_submission_rate',{p_student:user.id});if(rate.error)throw rate.error;if(!rate.data)return reply(429,{error:'Too many submission requests. Try again in a minute.'});
  const reader=req.body?.getReader();if(!reader)return reply(400,{error:'Missing body'});let size=0;const chunks:Uint8Array[]=[];
  while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>maxBytes){await reader.cancel();return reply(413,{error:'Payload too large'});}chunks.push(r.value);}
  const bytes=new Uint8Array(size);let pos=0;for(const c of chunks){bytes.set(c,pos);pos+=c.length;}
  const payload=JSON.parse(new TextDecoder().decode(bytes));
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(payload.version!==1||!uuid.test(payload.attemptId)||!uuid.test(payload.idempotencyKey))return reply(400,{error:'Invalid submission version or identifier'});
  const {data:attempt,error}=await admin.from('attempts').select('*').eq('id',payload.attemptId).eq('student_id',user.id).single();if(error||!attempt)return reply(403,{error:'Attempt not authorized'});
  if(attempt.assignment_id!==ASSIGNMENT_ID||attempt.assignment_version!==1)return reply(400,{error:'Unsupported assignment version'});
  if(attempt.status!=='in_progress')return attempt.idempotency_key===payload.idempotencyKey?reply(200,{receipt:attempt.receipt}):reply(409,{error:'Attempt already finalized'});
  const {data:profile,error:profileError}=await admin.from('profiles').select('full_name,department').eq('id',user.id).single();if(profileError)throw profileError;
  const answers=validateAnswers(payload.answers);
  if(!Array.isArray(payload.events)||payload.events.length>1000)return reply(400,{error:'Invalid activity log'});
  const events=payload.events.map((e:Record<string,unknown>,i:number)=>{if(typeof e.command!=='string'||e.command.length>2000||typeof e.output!=='string'||e.output.length>20000||typeof e.success!=='boolean'||typeof e.branch!=='string'||e.branch.length>150||typeof e.head!=='string'||e.head.length>40||typeof e.timestamp!=='string'||!Number.isFinite(Date.parse(e.timestamp)))throw new Error('Invalid activity event');return {sequence:i+1,command:e.command,output:e.output,success:e.success,branch:e.branch,head:e.head,timestamp:e.timestamp};});
  const verified=await verifySnapshot(payload.snapshot,profile);
  const {data:receipt,error:finalizeError}=await admin.rpc('finalize_verified',{p_student:user.id,p_attempt:attempt.id,p_key:payload.idempotencyKey,p_snapshot:payload.snapshot,p_answers:answers,p_events:events,p_results:verified.results,p_score:verified.score});if(finalizeError)throw finalizeError;
  return reply(200,{receipt,gradingState:'pending_instructor_review'});
 }catch(e){console.error('Submission validation failed',e instanceof Error?e.name:'Error');return reply(400,{error:e instanceof Error?e.message:'Submission could not be verified'});}
});
