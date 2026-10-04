jest.mock('../sendService',()=>({sendEmail:jest.fn()}));
jest.mock('../batchService',()=>({sendPendingBatch:jest.fn()}));
jest.mock('@/lib/supabase/server-service',()=>({getServiceClient:()=>{throw new Error('Sin BD real');}}));
import { runEmailCampaignBatch } from '../campaignBatch';
import { rowToCampaign } from '../../whatsapp/campaignStore';
import { EmailError, type EmailMessage } from '../types';
import type { Campaign } from '../../whatsapp/types';
import type { sendEmail } from '../sendService';
import type { sendPendingBatch } from '../batchService';
import { fakeSupabase } from './fakeSupabase';
const id='10000000-0000-4000-8000-000000000001', contact='20000000-0000-4000-8000-000000000001',customer='30000000-0000-4000-8000-000000000001',token='40000000-0000-4000-8000-000000000001',msg='50000000-0000-4000-8000-000000000001';
function campaign():Campaign{return rowToCampaign({id,organization_id:7,name:'Prueba privada',channel:'email',status:'sending',created_by:'60000000-0000-4000-8000-000000000001',content:'Hola <contacto>\nContenido',statistics:{purpose:'marketing'},created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'});}
function setup(options:{rows?:Record<string,unknown>[];claimOrg?:number;prepareError?:EmailError;sendError?:Error;afterPrepare?:()=>void}={}) {
 const c=campaign(),calls:Record<string,unknown>[]=[];
 const prepare=jest.fn<ReturnType<typeof sendEmail>,Parameters<typeof sendEmail>>(async()=>{if(options.prepareError)throw options.prepareError;options.afterPrepare?.();return {message:{id:msg,organization_id:7,to_customer_id:customer,metadata:{campaign_id:id}} as EmailMessage,scheduled:false,warnings:[],missing:[]};});
 const sendBatch=jest.fn<ReturnType<typeof sendPendingBatch>,Parameters<typeof sendPendingBatch>>(async()=>{if(options.sendError)throw options.sendError;return {sent:[msg],failed:[],skipped:[]};});
 const rows=options.rows??[{id:contact,customer_id:customer,metadata:{claim_token:token,recipient:'private@example.invalid'}}];
 const {client}=fakeSupabase(()=>{throw new Error('El adaptador no escribe por REST');},async(name,args)=>{
  calls.push({name,...args});
  if(name==='crm_claim_email_campaign_batch')return {data:{rows,campaign:{...c,organization_id:options.claimOrg??7}},error:null};
  if(name==='crm_finish_campaign_contact')return {data:{applied:true},error:null};
  if(name==='crm_email_campaign_batch_progress')return {data:{finished:false,next_batch_no:2},error:null};
  throw new Error(`RPC no esperada ${name}`);
 });return {c,calls,client,prepare,sendBatch};
}
describe('Runner email de campaign_batch',()=>{
 it('prepara con renderizador canónico/claim y envía su fila por lote nativo',async()=>{const d=setup();const r=await runEmailCampaignBatch({campaign_id:id},d.client,{expectedOrgId:7,prepare:d.prepare,sendBatch:d.sendBatch},d.c);expect(r).toMatchObject({claimed:1,prepared:1,sent:1,next_batch_no:2});expect(d.prepare).toHaveBeenCalledWith(7,{userId:d.c.created_by},expect.objectContaining({prepare_only:true,campaign_claim:{contact_id:contact,token},campaign_id:id,client_request_id:`campaign:${id}:${customer}`,kind:'marketing',content:expect.objectContaining({html:'<p>Hola &lt;contacto&gt;<br />Contenido</p>'})}),d.client);expect(d.sendBatch).toHaveBeenCalledWith(7,[msg],d.client,expect.objectContaining({deadlineAt:expect.any(Number)}));});
 it('recupera un mensaje preparado sin crear otro',async()=>{const d=setup({rows:[{id:contact,customer_id:customer,metadata:{claim_token:token,email_message_id:msg}}]});const r=await runEmailCampaignBatch({campaign_id:id},d.client,{expectedOrgId:7,prepare:d.prepare,sendBatch:d.sendBatch},d.c);expect(r).toMatchObject({prepared:0,sent:1});expect(d.prepare).not.toHaveBeenCalled();expect(d.sendBatch.mock.calls[0][1]).toEqual([msg]);});
 it('tenant del job discordante falla antes de reservar',async()=>{const d=setup();await expect(runEmailCampaignBatch({campaign_id:id},d.client,{expectedOrgId:8,prepare:d.prepare},d.c)).rejects.toMatchObject({code:'VALIDATION'});expect(d.calls).toEqual([]);expect(d.prepare).not.toHaveBeenCalled();});
 it('respuesta de reserva ajena falla cerrada',async()=>{const d=setup({claimOrg:8});await expect(runEmailCampaignBatch({campaign_id:id},d.client,{expectedOrgId:7,prepare:d.prepare},d.c)).rejects.toMatchObject({code:'DB'});expect(d.prepare).not.toHaveBeenCalled();});
 it.each(['draft','paused','canceled'])('estado %s no reserva ni envía',async(status)=>{const d=setup();d.c.effective_status=status as Campaign['effective_status'];expect(await runEmailCampaignBatch({campaign_id:id},d.client,{expectedOrgId:7,prepare:d.prepare},d.c)).toMatchObject({finished:true,reason:`status_${status}`});expect(d.calls).toEqual([]);});
 it('fecha futura sólo programa el mismo trabajo',async()=>{const d=setup();d.c.scheduled_at='2099-01-01T10:00:00.000Z';await runEmailCampaignBatch({campaign_id:id},d.client,{expectedOrgId:7,prepare:d.prepare},d.c);expect(d.calls).toEqual([expect.objectContaining({name:'crm_email_campaign_batch_progress',p_not_before:d.c.scheduled_at})]);expect(d.prepare).not.toHaveBeenCalled();});
 it('abort antes del claim sólo concilia progreso',async()=>{const d=setup(),ctl=new AbortController();ctl.abort();await runEmailCampaignBatch({campaign_id:id},d.client,{expectedOrgId:7,prepare:d.prepare,signal:ctl.signal},d.c);expect(d.calls.map(c=>c.name)).toEqual(['crm_email_campaign_batch_progress']);expect(d.prepare).not.toHaveBeenCalled();});
 it('abort después de preparar no inicia proveedor ni renueva la fila',async()=>{const ctl=new AbortController(),d=setup({afterPrepare:()=>ctl.abort()});await runEmailCampaignBatch({campaign_id:id},d.client,{expectedOrgId:7,prepare:d.prepare,sendBatch:d.sendBatch,signal:ctl.signal},d.c);expect(d.prepare).toHaveBeenCalledTimes(1);expect(d.sendBatch).not.toHaveBeenCalled();expect(d.calls.some(c=>c.name==='crm_finish_campaign_contact')).toBe(false);});
 it.each([['CONTACT_OPTED_OUT','skip'],['MISSING_VARIABLES','fail'],['NO_SENDER','pause'],['DB','release']])('preparación %s termina con %s conservando el claim',async(code,action)=>{const d=setup({prepareError:new EmailError(code,'Fallo simulado',503)});await runEmailCampaignBatch({campaign_id:id},d.client,{expectedOrgId:7,prepare:d.prepare,sendBatch:d.sendBatch},d.c);expect(d.calls).toContainEqual(expect.objectContaining({name:'crm_finish_campaign_contact',p_action:action,p_token:token,p_org:7,p_contact:contact}));expect(d.sendBatch).not.toHaveBeenCalled();});
 it('fallo del servicio batch no declara éxito; el job conserva el mismo mensaje para retry',async()=>{const d=setup({sendError:new EmailError('DB','Offline',503)});await expect(runEmailCampaignBatch({campaign_id:id},d.client,{expectedOrgId:7,prepare:d.prepare,sendBatch:d.sendBatch},d.c)).rejects.toMatchObject({code:'DB'});expect(d.sendBatch.mock.calls[0][1]).toEqual([msg]);expect(d.calls.some(c=>c.name==='crm_email_campaign_batch_progress')).toBe(false);});
});
