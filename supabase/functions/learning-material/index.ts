import {createClient} from '@supabase/supabase-js';
import {handleMaterial} from './handler.ts';
import {PPTX_MIME} from '../../../src/features/learning/materials.ts';
Deno.serve((req:Request)=>{
 const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const admin=createClient(url,key,{auth:{persistSession:false}});
 return handleMaterial(req,Deno.env.get('ALLOWED_ORIGIN'),{
  authorize:async(token)=>{
   const {data:{user},error}=await admin.auth.getUser(token);
   if(error||!user?.email_confirmed_at)return null;
   const caller=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false}});
   const r=await caller.rpc('is_instructor');return !r.error&&r.data?user.id:null;
  },
  upload:async(path,bytes)=>{const r=await admin.storage.from('learning-presentations').upload(path,bytes,{contentType:PPTX_MIME,upsert:false});if(r.error)throw r.error;},
  register:async(actor,id,item,name,size)=>{const r=await admin.rpc('register_learning_material',{p_actor:actor,p_id:id,p_item:item,p_name:name,p_bytes:size});if(r.error)throw r.error;},
  remove:async(path)=>{const r=await admin.storage.from('learning-presentations').remove([path]);if(r.error)throw r.error;},
 });
});
