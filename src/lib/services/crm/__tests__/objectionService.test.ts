/// <reference types="jest" />
import type { SupabaseClient } from '@supabase/supabase-js';
import { NOTES_MAX,ObjectionValidationError,addOpportunityObjection,resolveOpportunityObjection,createObjection,updateObjection,deleteObjection,getObjections } from '../objectionService';
const rpc=jest.fn();const sb={rpc} as unknown as SupabaseClient;
beforeEach(()=>rpc.mockReset().mockResolvedValue({data:{id:'linked'},error:null}));
test('note maximum is 280; 281 characters fail before any RPC',async()=>{
 expect(NOTES_MAX).toBe(280);await expect(addOpportunityObjection(120,'op','ob',{notes:'x'.repeat(281)},sb)).rejects.toBeInstanceOf(ObjectionValidationError);expect(rpc).not.toHaveBeenCalled();
});
test.each(['y','é'])('280 %s characters and surrounding spaces are trimmed and preserved',async(char)=>{
 const notes=char.repeat(280);await addOpportunityObjection(120,'op','ob',{notes:` ${notes} `,detected_by:'ia'},sb);
 expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith('crm_objection_register',{p_org:120,p_opportunity:'op',p_objection:'ob',p_resolve:null,p_notes:notes});
});
test('blank notes become null; runtime non-text notes fail without SQL',async()=>{
 await addOpportunityObjection(120,'op','ob',{notes:' '},sb);expect(rpc.mock.calls[0][1].p_notes).toBeNull();rpc.mockClear();await expect(addOpportunityObjection(120,'op','ob',{notes:42 as never},sb)).rejects.toBeInstanceOf(ObjectionValidationError);expect(rpc).not.toHaveBeenCalled();
});
test('resolve binds both the link and its route opportunity',async()=>{await resolveOpportunityObjection('link',120,sb,'route');expect(rpc).toHaveBeenCalledWith('crm_objection_register',{p_org:120,p_opportunity:'route',p_objection:null,p_resolve:'link',p_notes:null});});
test('catalog create, versioned patch and archive use the one audited writer',async()=>{
 await createObjection(120,{title:'Price',category:'precio'},sb);await updateObjection('ob',120,{is_active:false,title:undefined},sb,'2026-10-01T00:00:00Z');await deleteObjection('ob',120,sb);
 expect(rpc.mock.calls).toEqual([
 ['crm_objection_catalog_write',{p_org:120,p_id:null,p_expected:null,p_data:{title:'Price',category:'precio'},p_archive:false}],
 ['crm_objection_catalog_write',{p_org:120,p_id:'ob',p_expected:'2026-10-01T00:00:00Z',p_data:{is_active:false},p_archive:false}],
 ['crm_objection_catalog_write',{p_org:120,p_id:'ob',p_expected:null,p_data:{},p_archive:true}],
 ]);
});
test.each([{code:'42501',message:'sin_permiso'},{code:'P0002',message:'objecion_no_encontrada'},{code:'40001',message:'conflicto_version'}])('SQL errors propagate intact %s',async(error)=>{rpc.mockResolvedValue({data:null,error});await expect(addOpportunityObjection(120,'op','ob',{},sb)).rejects.toBe(error);});
test('a catalog query failure is never reported as an empty list',async()=>{
 const error={message:'connection_failed'};const chain={select:()=>chain,eq:()=>chain,order:()=>Promise.resolve({data:null,error})};await expect(getObjections(120,{from:()=>chain} as unknown as SupabaseClient)).rejects.toBe(error);
});
