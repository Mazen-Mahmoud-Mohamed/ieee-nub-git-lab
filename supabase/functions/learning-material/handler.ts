import { MAX_PRESENTATION_BYTES, PPTX_MIME, validatePresentation } from '../../../src/features/learning/materials.ts';
export type UploadServices = {
 authorize:(token:string)=>Promise<string|null>;
 upload:(path:string,bytes:Uint8Array)=>Promise<void>;
 register:(actor:string,id:string,item:string,name:string,size:number)=>Promise<void>;
 remove:(path:string)=>Promise<void>;
};
export async function handleMaterial(req:Request,origin:string|undefined,services:UploadServices) {
 const headers={'Access-Control-Allow-Origin':origin||'null','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}});
 if(!origin)return reply(503,{error:'Upload origin is not configured.'});
 if(req.headers.get('Origin')&&req.headers.get('Origin')!==origin)return reply(403,{error:'Origin is not permitted.'});
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return reply(405,{error:'POST required.'});
 try {
  const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if(!token)return reply(401,{error:'Sign in before uploading.'});
  const actor=await services.authorize(token);
  if(!actor)return reply(403,{error:'Verified instructor authorization required.'});
  const max=MAX_PRESENTATION_BYTES+65536;
  if(Number(req.headers.get('Content-Length')||0)>max)return reply(413,{error:'Presentation must be at most 25 MiB.'});
  const reader=req.body?.getReader();if(!reader)return reply(400,{error:'Choose a presentation.'});
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>max){await reader.cancel();return reply(413,{error:'Presentation must be at most 25 MiB.'});}chunks.push(r.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  const data=await new Response(bytes,{headers:{'Content-Type':req.headers.get('Content-Type')||''}}).formData();
  const item=String(data.get('itemId')||''),file=data.get('file');
  if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(item)||!(file instanceof File))return reply(400,{error:'Save a session and choose its presentation.'});
  const content=new Uint8Array(await file.arrayBuffer());
  validatePresentation(file.name,file.type,content);
  const name=file.name.replace(/[^\p{L}\p{N} ._()-]/gu,'_').slice(-180),id=crypto.randomUUID(),path=item+'/'+id+'.pptx';
  await services.upload(path,content);
  try{await services.register(actor,id,item,name,content.length);}catch{await services.remove(path).catch(()=>{});return reply(409,{error:'The session changed or upload registration failed. Refresh before retrying.'});}
  return reply(201,{id,name,bytes:content.length,type:PPTX_MIME});
 }catch(e){return reply(400,{error:e instanceof Error&&/PowerPoint|PPTX|presentation|archive|package/.test(e.message)?e.message:'The presentation could not be uploaded. Your saved session is unchanged.'});}
}
