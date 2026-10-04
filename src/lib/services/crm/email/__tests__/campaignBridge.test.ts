/** Proveedores y BD simulados: comprueba el motor nativo, no hace envíos. */
const mockSend = jest.fn();
const mockBatchSend = jest.fn();
const mockWait = jest.fn(async () => undefined);
const mockResolveSender = jest.fn();
jest.mock('../resendClient', () => ({ getResendClient: () => ({ emails: { send: mockSend }, batch: { send: mockBatchSend } }), getResendRateLimiter: () => ({ wait: mockWait }) }));
jest.mock('../domainsService', () => ({ resolveSender: (...args: unknown[]) => mockResolveSender(...args) }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('Sin proveedor real'); } }));
import { buildResendPayload, deliver, resendPayloadHash } from '../sendService';
import { sendPendingBatch } from '../batchService';
import { EmailError, type EmailMessage } from '../types';
import type { ResolvedSender } from '../domainsService';
import { fakeSupabase } from './fakeSupabase';
const campaign='10000000-0000-4000-8000-000000000001', contact='20000000-0000-4000-8000-000000000001', token='30000000-0000-4000-8000-000000000001';
const sender: ResolvedSender = { mode:'global',domain:null,from:'Organización vía GO <test@example.invalid>',fromEmail:'test@example.invalid',replyTo:null,apiKey:'fake-provider',notice:null,receivingDomain:'example.invalid',tracking:false };
const message=():EmailMessage=>{const row:EmailMessage=({ id:'40000000-0000-4000-8000-000000000001',organization_id:7,provider:'resend',provider_message_id:null,template_id:null,to_email:'private@example.invalid',to_customer_id:'50000000-0000-4000-8000-000000000001',cc:null,bcc:null,from_email:sender.fromEmail,subject:'Prueba privada',body_html_snapshot:'<p>Contenido</p>',related_type:'customer',related_id:'50000000-0000-4000-8000-000000000001',sequence_step_run_id:null,status:'pending',scheduled_at:null,sent_at:null,delivered_at:null,first_opened_at:null,open_count:0,first_clicked_at:null,click_count:0,bounced_at:null,bounce_type:null,complained_at:null,unsubscribed_at:null,idempotency_key:'email/40000000-0000-4000-8000-000000000001',cost_amount:null,metadata:{sender_mode:'global',email_domain_id:null,sender_from_snapshot:sender.from,sender_receiving_domain_snapshot:'example.invalid',sender_key_fingerprint:resendPayloadHash(sender.apiKey),campaign_id:campaign,campaign_contact_id:contact,kind:'marketing',from_user_id:'60000000-0000-4000-8000-000000000001'},created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z' });row.metadata.campaign_payload_hash=resendPayloadHash(buildResendPayload(row,sender,[]));return row;};
function db(options:{gate?:Record<string,unknown>; receiptOrg?:number; receiptError?:boolean}={}) {
 const row=message(),actions:Record<string,unknown>[]=[];
 const {client,calls}=fakeSupabase(call=>({data:call.table==='email_messages'?[row]:null,error:null}),async(name,args)=>{
  if(name==='fn_can_contact')throw new Error('El contacto de campaña se comprueba atómicamente en begin');
  if(name!=='crm_email_campaign_dispatch')throw new Error(`RPC no esperada ${name}`);
  actions.push(args);
  if(args.p_action==='begin')return {data:options.gate??{allowed:true,token,message:row},error:null};
  if(options.receiptError&&args.p_action==='sent')return {data:null,error:{message:'BD temporalmente no disponible'}};
  if(args.p_action==='sent'){row.provider_message_id=String(args.p_provider_id);row.status='sent';}
  if(args.p_action==='failed')row.status='failed';
  return {data:{applied:true,message:{...row,organization_id:options.receiptOrg??row.organization_id}},error:null};
 });return {row,client,calls,actions};
}
beforeEach(()=>{jest.clearAllMocks();mockSend.mockResolvedValue({data:{id:'provider-one'},error:null});mockResolveSender.mockResolvedValue(sender);});
describe('Puente de campañas: proveedor nativo y recibos',()=>{
 it.each([false,true])('correo regular (asociado a campaña: %s) conserva su espera nativa sin compuerta',async(linked)=>{
  jest.useFakeTimers();
  try {
   const row=message();row.metadata={kind:'transactional',...(linked?{campaign_id:campaign}:{})};let resolve!:(value:unknown)=>void;mockSend.mockReturnValue(new Promise(r=>{resolve=r;}));
   const {client}=fakeSupabase(call=>{if(call.op==='update')Object.assign(row,call.args[0]);return {data:row,error:null};},async()=>{throw new Error('Correo regular no llama al puente');});
   const pending=deliver(row,sender,[],client);await Promise.resolve();await Promise.resolve();expect(mockSend).toHaveBeenCalledTimes(1);expect(jest.getTimerCount()).toBe(0);jest.advanceTimersByTime(16000);
   resolve({data:{id:'regular-provider'},error:null});expect(await pending).toMatchObject({status:'sent',provider_message_id:'regular-provider'});
  } finally {jest.useRealTimers();}
 });
 it.each([false,true])('lote manual asociado a campaña conserva consentimiento actual (%s) y el escritor nativo',async(consent)=>{
  const row=message();row.metadata={campaign_id:campaign,kind:'marketing'};
  const rpc=jest.fn(async(name:string)=>{if(name!=='fn_can_contact')throw new Error(`El correo manual no llama al puente: ${name}`);return {data:consent,error:null};});
  const {client}=fakeSupabase(call=>{if(call.op==='update')Object.assign(row,call.args[0]);return {data:call.op==='select'?[row]:row,error:null};},rpc);
  mockBatchSend.mockResolvedValue({data:{data:[{id:'legacy-batch-provider'}]},error:null});
  const result=await sendPendingBatch(7,[row.id],client);
  expect(rpc).toHaveBeenCalledWith('fn_can_contact',expect.objectContaining({p_org:7,p_customer:row.to_customer_id,p_purpose:'marketing'}));expect(mockSend).not.toHaveBeenCalled();
  if(consent){expect(result.sent).toEqual([row.id]);expect(mockBatchSend).toHaveBeenCalledTimes(1);expect(row.provider_message_id).toBe('legacy-batch-provider');}
  else{expect(result.skipped).toEqual([{email_message_id:row.id,reason:'opted_out'}]);expect(mockBatchSend).not.toHaveBeenCalled();expect(row.status).toBe('failed');}
 });
 it('resuelve fallback nativo y envía individual con la clave estable, sin segundo batch writer',async()=>{
  const d=db();const result=await sendPendingBatch(7,[d.row.id],d.client);
  expect(result).toEqual({sent:[d.row.id],failed:[],skipped:[]});expect(mockBatchSend).not.toHaveBeenCalled();
  expect(mockResolveSender).toHaveBeenCalledWith(7,{domainId:null,userId:d.row.metadata.from_user_id,kind:'marketing'},d.client);
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({from:sender.from,to:[d.row.to_email]}),{idempotencyKey:`email/${d.row.id}`});
  expect(d.actions.map(a=>a.p_action)).toEqual(['begin','sent']);expect(d.actions[1]).toMatchObject({p_token:token,p_provider_id:'provider-one'});
  expect(d.calls.every(c=>c.op==='select')).toBe(true);
 });
 it.each(['inactive','in_flight','email_consent_changed','email_recipient_changed','email_reconciliation_required'])('la compuerta %s no inicia el proveedor',async(reason)=>{
  const d=db({gate:{allowed:false,reason}});await expect(deliver(d.row,sender,[],d.client)).rejects.toMatchObject({code:'CAMPAIGN_NOT_READY'});expect(mockSend).not.toHaveBeenCalled();expect(d.actions).toHaveLength(1);
 });
 it('un recibo ya confirmado reutiliza la fila sin otro efecto',async()=>{
  const confirmed={...message(),provider_message_id:'already',status:'delivered' as const};const d=db({gate:{allowed:false,reason:'already_sent',message:confirmed}});
  expect(await deliver(d.row,sender,[],d.client)).toEqual(confirmed);expect(mockSend).not.toHaveBeenCalled();
 });
 it('abortado antes de reservar/proveer produce cero efectos',async()=>{const d=db(),ctl=new AbortController();ctl.abort();await expect(sendPendingBatch(7,[d.row.id],d.client,{signal:ctl.signal})).rejects.toMatchObject({code:'DELIVERY_ABORTED'});expect(d.calls).toHaveLength(0);expect(mockSend).not.toHaveBeenCalled();});
 it('un timeout conserva recibo; el acuse tardío confirma la misma fila',async()=>{
  const d=db();let resolve!:(v:unknown)=>void;mockSend.mockReturnValue(new Promise(r=>{resolve=r;}));
  await expect(deliver(d.row,sender,[],d.client,undefined,{timeoutMs:5})).rejects.toMatchObject({code:'PROVIDER_TIMEOUT'});
  expect(d.actions.map(a=>a.p_action)).toEqual(['begin']);resolve({data:{id:'late-provider'},error:null});await new Promise(r=>setTimeout(r,0));
  expect(d.actions.map(a=>a.p_action)).toEqual(['begin','sent']);expect(d.actions[1]).toMatchObject({p_token:token,p_provider_id:'late-provider'});expect(d.row.provider_message_id).toBe('late-provider');
 });
 it.each([429,500,503])('error %s conserva la incertidumbre sin marcar failed',async(statusCode)=>{const d=db();mockSend.mockResolvedValue({data:null,error:{name:'provider',message:'Retry',statusCode}});await expect(deliver(d.row,sender,[],d.client)).rejects.toMatchObject({code:'PROVIDER_RETRYABLE'});expect(d.actions.map(a=>a.p_action)).toEqual(['begin']);});
 it('statusCode null es transporte incierto, no un rechazo definitivo',async()=>{const d=db();mockSend.mockResolvedValue({data:null,error:{name:'transport',message:'Timeout',statusCode:null}});await expect(deliver(d.row,sender,[],d.client)).rejects.toMatchObject({code:'PROVIDER_RETRYABLE'});expect(d.actions.map(a=>a.p_action)).toEqual(['begin']);});
 it('409 de idempotencia pausa para conciliación y nunca marca failed',async()=>{const d=db();mockSend.mockResolvedValue({data:null,error:{name:'idempotency',message:'Incompatible',statusCode:409}});await expect(deliver(d.row,sender,[],d.client)).rejects.toMatchObject({code:'PROVIDER_RETRYABLE'});expect(d.actions.map(a=>a.p_action)).toEqual(['begin','blocked']);expect(d.actions[1]).toMatchObject({p_error:'email_idempotency_conflict'});expect(d.row.status).toBe('pending');});
 it('cambio de remitente/configuración congela la campaña antes del proveedor',async()=>{const d=db();await expect(deliver(d.row,{...sender,fromEmail:'changed@example.invalid'},[],d.client)).rejects.toMatchObject({code:'CAMPAIGN_NOT_READY',message:'email_sender_changed'});expect(d.actions).toEqual([expect.objectContaining({p_action:'blocked',p_error:'email_sender_changed'})]);expect(mockSend).not.toHaveBeenCalled();});
 it('payload alterado exige conciliación; cambio sólo de nombre preserva el snapshot',async()=>{const d=db();d.row.body_html_snapshot='<p>Cambiado</p>';await expect(deliver(d.row,sender,[],d.client)).rejects.toMatchObject({code:'CAMPAIGN_NOT_READY',message:'email_payload_changed'});expect(mockSend).not.toHaveBeenCalled();const fresh=db();await deliver(fresh.row,{...sender,from:'Nombre nuevo <test@example.invalid>'},[],fresh.client);expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({from:sender.from}),{idempotencyKey:`email/${fresh.row.id}`});});
 it('error definitivo 422 usa failed con el mismo testigo',async()=>{const d=db();mockSend.mockResolvedValue({data:null,error:{name:'validation',message:'Rechazado',statusCode:422}});await expect(deliver(d.row,sender,[],d.client)).rejects.toMatchObject({code:'PROVIDER'});expect(d.actions[1]).toMatchObject({p_action:'failed',p_token:token});expect(d.row.status).toBe('failed');});
 it('BD falla tras el efecto: resultado recuperable, nunca enviado ficticio',async()=>{const d=db({receiptError:true});const result=await sendPendingBatch(7,[d.row.id],d.client);expect(result.sent).toEqual([]);expect(result.failed).toEqual([expect.objectContaining({email_message_id:d.row.id,retryable:true})]);expect(d.row.status).toBe('pending');expect(mockSend.mock.calls[0][1]).toEqual({idempotencyKey:`email/${d.row.id}`});});
 it('rechaza recibo de otro tenant, aunque el proveedor haya confirmado',async()=>{const d=db({receiptOrg:8});await expect(deliver(d.row,sender,[],d.client)).rejects.toMatchObject({code:'DB'});expect(d.actions[1]).toMatchObject({p_action:'sent',p_org:7});});
 it('si desaparece el remitente, pausa sin borrar el mensaje ni entrar en bucle de reintento',async()=>{const d=db();mockResolveSender.mockRejectedValue(new EmailError('NO_SENDER','Sin remitente',422));const result=await sendPendingBatch(7,[d.row.id],d.client);expect(result.failed).toEqual([]);expect(result.skipped).toEqual([{email_message_id:d.row.id,reason:'email_sender_unavailable'}]);expect(d.actions.map(a=>a.p_action)).toEqual(['blocked']);expect(mockSend).not.toHaveBeenCalled();expect(d.row.status).toBe('pending');});
});
