import { deleteTemplate, duplicateTemplate, updateTemplate } from '../templatesService';
import { zTemplateUpdate } from '../schemas';
import type { Template } from '../types';
import { fakeSupabase, eqValue } from './fakeSupabase';
const id='11111111-1111-4111-8111-111111111111';
const current={id,organization_id:120,name:'Plantilla ejemplo',channel:'email',version:7,engine:'html',body_html:'Contenido',metadata:{},subject:'Asunto',is_active:true} as Template;
it('CAS toma la versión leída y filtra organización, id, canal y versión sin persistir expected_version',async()=>{
 const {client,calls}=fakeSupabase(call=>({data:call.op==='update'?{...current,version:8}:current,error:null}));
 const result=await updateTemplate(120,null,id,{is_active:false,expected_version:7},client);
 expect(result.version).toBe(8);const write=calls.find(call=>call.op==='update')!;
 expect(['organization_id','id','channel','version'].map(col=>eqValue(write,col))).toEqual([120,id,'email',7]);
 expect(write.args[0]).toMatchObject({version:8,is_active:false});expect(write.args[0]).not.toHaveProperty('expected_version');
});
it('versión obsoleta y carrera tras lectura devuelven409 sin guardar un borrador encima',async()=>{
 const first=fakeSupabase(()=>({data:current,error:null}));
 await expect(updateTemplate(120,null,id,{subject:'Draft',expected_version:6},first.client)).rejects.toMatchObject({status:409,code:'CONFLICT'});
 expect(first.calls.some(call=>call.op==='update')).toBe(false);
 const raced=fakeSupabase(call=>({data:call.op==='update'?null:current,error:null}));
 await expect(updateTemplate(120,null,id,{subject:'Draft',expected_version:7},raced.client)).rejects.toMatchObject({status:409,code:'CONFLICT'});
});
it('rechaza versión inválida y plantillas de otro canal antes de mutar',async()=>{
 expect(zTemplateUpdate.safeParse({expected_version:0}).success).toBe(false);
 const invalid=fakeSupabase(()=>({data:current,error:null}));
 await expect(updateTemplate(120,null,id,{expected_version:-1},invalid.client)).rejects.toMatchObject({status:400});expect(invalid.calls).toEqual([]);
 const foreign=fakeSupabase(()=>({data:{...current,channel:'whatsapp'},error:null}));
 await expect(updateTemplate(120,null,id,{subject:'Draft'},foreign.client)).rejects.toMatchObject({status:404});
 await expect(duplicateTemplate(120,null,id,undefined,foreign.client)).rejects.toMatchObject({status:404});
 await expect(deleteTemplate(120,id,foreign.client)).rejects.toMatchObject({status:404});expect(foreign.calls.every(call=>call.op==='select')).toBe(true);
});
