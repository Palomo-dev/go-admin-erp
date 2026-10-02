/** @jest-environment jsdom */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import es from '../../../../../messages/es.json'; import en from '../../../../../messages/en.json'; import fr from '../../../../../messages/fr.json'; import pt from '../../../../../messages/pt.json';
import * as api from '@/components/crm/email/emailApi';
import { waApi } from '@/components/crm/whatsapp/api';
import { TemplateList } from '../TemplateList';
import { TemplateEditorPage } from '../TemplateEditorPage';
import { useTemplateEditor, type TemplateForm } from '../useTemplateEditor';
import { useTemplatePreview, type TemplateContextIds } from '../useTemplatePreview';
import { HsmEditorDialog } from '@/components/crm/whatsapp/HsmEditorDialog';
import { WhatsAppTemplatesTab } from '@/components/crm/whatsapp/WhatsAppTemplatesTab';
import { emptyDocument } from '@/lib/services/crm/email/blocks';
import { emptyContext } from '@/lib/services/crm/email/variables';
import type { Template } from '@/lib/services/crm/email/types';
import type { WhatsAppTemplate } from '@/lib/services/crm/whatsapp/types';
let mockOrg=120;
const mockRouter={push:jest.fn(),replace:jest.fn()};
jest.mock('next/navigation',()=>({useRouter:()=>mockRouter}));
jest.mock('@/lib/hooks/useOrganization',()=>({useOrganization:()=>({organization:{id:mockOrg}})}));
jest.mock('@/lib/context/OrganizationTimezoneContext',()=>({useOrgTimezone:()=>({timezone:'America/Bogota'}),useFormatDate:()=>({formatDate:(value:string)=>`TZ:${value}`,formatDateTime:(value:string)=>`TZ:${value}`})}));
jest.mock('@/components/crm/email/emailApi',()=>({listTemplates:jest.fn(),getTemplate:jest.fn(),getVariables:jest.fn(),previewEmail:jest.fn(),createTemplate:jest.fn(),updateTemplate:jest.fn(),duplicateTemplate:jest.fn(),deleteTemplate:jest.fn(),restoreTemplates:jest.fn(),testSendTemplate:jest.fn()}));
jest.mock('@/components/crm/whatsapp/api',()=>({waApi:{templates:jest.fn(),channels:jest.fn(),createTemplate:jest.fn(),updateTemplate:jest.fn(),submitTemplate:jest.fn(),syncTemplates:jest.fn(),deleteTemplate:jest.fn()},ApiError:class extends Error{}}));
jest.mock('@/components/crm/email/editor/EmailBlockEditor',()=>({EmailBlockEditor:()=>null}));
const catalogs={es,en,fr,pt},id='11111111-1111-4111-8111-111111111111';
const row={id,organization_id:120,name:'Plantilla ejemplo',channel:'email',kind:'transactional',version:7,engine:'html',body_html:'Contenido',subject:'Asunto propio',is_active:true,metadata:{},updated_at:'2026-10-02T03:00:00Z'} as Template;
const hsm={id,organization_id:120,name:'plantilla_ejemplo',body:'Hola {{nombre}}, gracias.',description:'Descripción propia',is_active:true,created_at:row.updated_at,updated_at:row.updated_at,meta:{status:'APPROVED',category:'utility',language:'es',provider:'meta',components:[{type:'BODY',text:'Hola {{nombre}}, gracias.'}],variable_map:{nombre:'contact.first_name'},examples:{nombre:'Contacto'},meta_template_id:'external-existing'}} as WhatsAppTemplate;
const form:TemplateForm={name:'Plantilla',kind:'transactional',subject:'Asunto',preheader:'',description:'',is_active:true,engine:'html',doc:emptyDocument(),html:'Contenido'};
function mount(node:React.ReactNode,locale:keyof typeof catalogs='es',onError=jest.fn()){return render(<NextIntlClientProvider locale={locale} messages={catalogs[locale]} onError={onError}>{node}</NextIntlClientProvider>)}
const wrapper=({children}:{children:React.ReactNode})=><NextIntlClientProvider locale="es" messages={es}>{children}</NextIntlClientProvider>;
function Probe(){const t=useTranslations('crm.plantillas');return <aside>{Object.keys(es.crm.plantillas).map(key=><span key={key}>{t(key,{p0:'A',p1:'B'})}</span>)}</aside>}
beforeAll(()=>Object.defineProperty(window,'matchMedia',{writable:true,value:jest.fn(()=>({matches:true,addEventListener:jest.fn(),removeEventListener:jest.fn()}))}));
beforeEach(()=>{
 jest.clearAllMocks();mockOrg=120;
 (api.listTemplates as jest.Mock).mockResolvedValue({data:[row],total:1,can_manage:false});
 (api.getTemplate as jest.Mock).mockResolvedValue({data:row,can_manage:false});
 (api.getVariables as jest.Mock).mockResolvedValue({data:{values:emptyContext(),sample:true}});
 (api.previewEmail as jest.Mock).mockResolvedValue({data:{html:'Contenido',text:'Contenido',subject:'Asunto',preheader:'',missing_variables:[]}});
 (waApi.templates as jest.Mock).mockResolvedValue({data:[hsm],can_manage:false});(waApi.channels as jest.Mock).mockResolvedValue({data:[],can_manage:false});
});
afterEach(()=>{cleanup();jest.useRealTimers();jest.restoreAllMocks();});
it.each(['es','en','fr','pt'] as const)('lista, editor y catálogo realIntl sin mutaciones en %s',async locale=>{
 const onError=jest.fn();mount(<><Probe/><TemplateList/><TemplateEditorPage templateId={id}/></>,locale,onError);
 await waitFor(()=>expect(screen.getByText('Asunto propio')).toBeTruthy());
 expect(screen.getByRole('table')).toBeTruthy();for(const control of screen.getAllByRole('switch') as HTMLButtonElement[]){expect(control.disabled||control.closest('fieldset')?.disabled).toBe(true);fireEvent.click(control);}
 expect(api.updateTemplate).not.toHaveBeenCalled();expect(api.restoreTemplates).not.toHaveBeenCalled();
 expect(screen.queryByRole('button',{name:{es:'Guardar',en:'Save',fr:'Enregistrer',pt:'Salvar'}[locale]})).toBeNull();
 expect(onError).not.toHaveBeenCalled();
 expect(screen.getByText(/Meta exige|Meta requires|Meta exige|La Meta/)).toBeTruthy();
});
it('una vista previa antigua no reaparece después de fallar nuevas variables y el spinner queda cerrado',async()=>{
 jest.useFakeTimers();let finish:(value:unknown)=>void=()=>{};
 (api.previewEmail as jest.Mock).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const rendered=renderHook(({ids})=>useTemplatePreview(form,false,ids,'120'),{wrapper,initialProps:{ids:{} as TemplateContextIds}});
 await act(async()=>{await Promise.resolve();});await act(async()=>{jest.advanceTimersByTime(601);});expect(rendered.result.current.previewLoading).toBe(true);
 (api.getVariables as jest.Mock).mockRejectedValueOnce(new Error('lookup_failed'));
 rendered.rerender({ids:{customer_id:id}});await act(async()=>{await Promise.resolve();});
 expect(api.getVariables).toHaveBeenLastCalledWith({customer_id:id});expect(rendered.result.current.contextError).toBe('lookup_failed');
 await act(async()=>{finish({data:{html:'Old',text:'Old',subject:'Old',preheader:'',missing_variables:[]}});});
 expect(rendered.result.current.preview).toBeNull();expect(rendered.result.current.context).toBeNull();expect(rendered.result.current.previewLoading).toBe(false);
 act(()=>rendered.result.current.retryContext());await act(async()=>{await Promise.resolve();});await act(async()=>{jest.advanceTimersByTime(601);});
 expect(api.previewEmail).toHaveBeenLastCalledWith(expect.objectContaining({context_ids:{customer_id:id}}));expect(rendered.result.current.contextError).toBeNull();
});
it('save único envía la versión real; un409 conserva los cambios del borrador',async()=>{
 (api.getTemplate as jest.Mock).mockResolvedValue({data:row,can_manage:true});let fail:(error:Error)=>void=()=>{};
 (api.updateTemplate as jest.Mock).mockImplementation(()=>new Promise((_resolve,reject)=>{fail=reject;}));
 const state=renderHook(()=>useTemplateEditor(id),{wrapper});await waitFor(()=>expect(state.result.current.loading).toBe(false));
 act(()=>state.result.current.patch({subject:'Borrador nuevo'}));act(()=>{void state.result.current.save();void state.result.current.save();});
 expect(api.updateTemplate).toHaveBeenCalledTimes(1);expect(api.updateTemplate).toHaveBeenCalledWith(id,expect.objectContaining({expected_version:7,subject:'Borrador nuevo'}));
 await act(async()=>fail(Object.assign(new Error('conflict'),{status:409,code:'CONFLICT'})));
 expect(state.result.current.form.subject).toBe('Borrador nuevo');expect(state.result.current.dirty).toBe(true);expect(state.result.current.saving).toBe(false);
});
it('read-only en WhatsApp no permite crear, sincronizar o mutar aunque el contenedor pase canEdit',async()=>{
 mount(<WhatsAppTemplatesTab canEdit/>);await waitFor(()=>expect(screen.getByText('plantilla_ejemplo')).toBeTruthy());
 expect(screen.queryByRole('button',{name:'Sincronizar'})).toBeNull();expect(screen.queryByRole('button',{name:'Nueva plantilla'})).toBeNull();expect(waApi.syncTemplates).not.toHaveBeenCalled();
});
it('permisos de plantillas conservan sus acciones y no conceden configurar canales',async()=>{
 (waApi.templates as jest.Mock).mockResolvedValue({data:[hsm],can_manage:true});
 mount(<WhatsAppTemplatesTab/>);await waitFor(()=>expect(screen.getByRole('button',{name:'Nueva plantilla'})).toBeTruthy());
 expect(screen.queryByRole('link',{name:'Conectar WhatsApp'})).toBeNull();
 expect((screen.getByRole('button',{name:'Nueva plantilla'}) as HTMLButtonElement).disabled).toBe(true);
 expect(waApi.createTemplate).not.toHaveBeenCalled();
});
it.each(['APPROVED','PENDING','REJECTED'] as const)('%s preserva todos los campos del original y no expone guardar ni submit',status=>{
 mount(<HsmEditorDialog open template={{...hsm,meta:{...hsm.meta,status}}} channels={[]} canManage onClose={jest.fn()} onSaved={jest.fn()}/>);
 const field=screen.getByLabelText('Nombre (a-z, 0-9, _)') as HTMLInputElement;expect(field.closest('fieldset')?.disabled).toBe(true);
 expect(screen.queryByRole('button',{name:'Guardar borrador'})).toBeNull();expect(screen.queryByRole('button',{name:'Enviar a aprobación'})).toBeNull();
 expect(waApi.updateTemplate).not.toHaveBeenCalled();expect(waApi.submitTemplate).not.toHaveBeenCalled();
});
it.each(['es','en','fr','pt'] as const)('editor WhatsApp usa Intl real y conserva literales de variables en %s',locale=>{
 const onError=jest.fn();mount(<HsmEditorDialog open template={hsm} canManage channels={[]} onClose={jest.fn()} onSaved={jest.fn()}/>,locale,onError);
 expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.getAllByText(/Hola \{\{nombre\}\}, gracias\./).length).toBeGreaterThan(0);
 expect(screen.getByRole('img',{name:{es:'Vista previa',en:'Preview',fr:'Aperçu',pt:'Pré-visualização'}[locale]})).toBeTruthy();
 expect(onError).not.toHaveBeenCalled();expect(waApi.submitTemplate).not.toHaveBeenCalled();
});
it('corregir rechazada crea un nuevo draft y retry de submit conserva su ID',async()=>{
 const rejected={...hsm,meta:{...hsm.meta,status:'REJECTED' as const}};const created={...hsm,id:'22222222-2222-4222-8222-222222222222',meta:{...hsm.meta,status:'DRAFT'}};
 (waApi.createTemplate as jest.Mock).mockResolvedValue({data:created});(waApi.updateTemplate as jest.Mock).mockResolvedValue({data:created});
 (waApi.submitTemplate as jest.Mock).mockRejectedValueOnce(new Error('provider_unavailable')).mockResolvedValueOnce({data:{...created,meta:{...created.meta,status:'PENDING'}}});
 const done=jest.fn();mount(<HsmEditorDialog open template={rejected} clone canManage channels={[]} onClose={jest.fn()} onSaved={done}/>);
 fireEvent.click(screen.getByRole('button',{name:'Enviar a aprobación'}));await waitFor(()=>expect(waApi.submitTemplate).toHaveBeenCalledTimes(1));
 expect(waApi.createTemplate).toHaveBeenCalledTimes(1);expect(waApi.createTemplate).toHaveBeenCalledWith(expect.objectContaining({name:'plantilla_ejemplo_copy',examples:{nombre:'Contacto'}}));expect(done).not.toHaveBeenCalled();
 await waitFor(()=>expect((screen.getByRole('button',{name:'Enviar a aprobación'}) as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Enviar a aprobación'}));
 await waitFor(()=>expect(done).toHaveBeenCalled());expect(waApi.createTemplate).toHaveBeenCalledTimes(1);expect(waApi.updateTemplate).toHaveBeenCalledWith(created.id,expect.any(Object));expect(waApi.submitTemplate).toHaveBeenLastCalledWith(created.id,null);
});
it('no pide aprobación cuando falta el ejemplo de una variable',()=>{
 mount(<HsmEditorDialog open template={{...hsm,meta:{...hsm.meta,status:'DRAFT',examples:{}}}} canManage channels={[]} onClose={jest.fn()} onSaved={jest.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Enviar a aprobación'}));expect(waApi.createTemplate).not.toHaveBeenCalled();expect(waApi.updateTemplate).not.toHaveBeenCalled();expect(waApi.submitTemplate).not.toHaveBeenCalled();
});
