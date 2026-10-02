'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';
import { Dialogo,FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ConditionBuilder } from '../shared/ConditionBuilder';
import { CAMPOS_SEGMENTO,normalizarFiltroSegmento } from '@/lib/services/crm/segmentosLogica';
import type { TeamTerritory,TeamManagementData } from '@/lib/services/crm/teamManagementModel';
import type { TeamMutation } from '@/lib/services/crm/teamManagementService';
import { saveEquipo } from './apiEquipo';
import { pedirCrm,claveError } from '../acciones/apiCrm';
const control='h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg';
export function TerritoryEditor({data,territory,onClose,onSaved}:{data:TeamManagementData;territory:TeamTerritory|null;onClose:()=>void;onSaved:()=>Promise<void>}) {
 const t=useTranslations('crm.equipoNuevo'),errors=useTranslations('crm.accionesRapidas.errores');
 const [name,setName]=useState(territory?.name??''),[owner,setOwner]=useState(territory?.criteria.assigned_user_id??''),[order,setOrder]=useState(territory?.sort_order??data.territories.length),[active,setActive]=useState(territory?.is_active??true),[filter,setFilter]=useState<unknown>(territory?.criteria.filter??{op:'and',rules:[{field:'customer.city',operator:'eq',value:''}]}),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[confirmed,setConfirmed]=useState<string|null>(null),[overlap,setOverlap]=useState<number|null>(null);
 const legacy=!!territory?.criteria.rules&&!territory.criteria.filter;
 async function save(){setBusy(true);setError(null);try{
  const criteria=normalizarFiltroSegmento(filter);if(!legacy&&!criteria.rules.length){setError(t('rulesRequired'));return;}
  const body:TeamMutation={kind:'territory',id:territory?.id??null,expected_updated_at:territory?.updated_at??null,data:{name:name.trim(),criteria:{...(legacy?{rules:territory!.criteria.rules as NonNullable<Extract<TeamMutation,{kind:'territory'}>['data']['criteria']['rules']>}:{filter:criteria as unknown as Record<string,unknown>}),...(owner?{assigned_user_id:owner}:{})},is_active:active,sort_order:order}};
  const signature=JSON.stringify(body);
  if(confirmed!==signature){const preview=await pedirCrm<TeamTerritory>('/api/crm/territories/preview',{method:'POST',cuerpo:body});setOverlap(preview.data.overlap_count);if(preview.data.overlap_count>0){setConfirmed(signature);return;}}
  await saveEquipo(body);onClose();await onSaved();
 }catch(cause){setError(errors(claveError(cause)));}finally{setBusy(false);}}
 return <Dialogo abierto onAbiertoChange={(open)=>!open&&onClose()} titulo={territory?t('editTerritory'):t('newTerritory')} ancho={672} icono={MapPin} primario={{etiqueta:confirmed?t('confirmSave'):t('save'),onClick:()=>void save(),cargando:busy,deshabilitada:!name.trim()||!Number.isInteger(order)||order<0||order>100000}}>
  {error&&<p role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">{error}</p>}
  {legacy&&<p role="status" className="text-sm text-warning-text">{t('legacyCriteria')}</p>}
  {overlap!==null&&overlap>0&&<p role="alert" className="rounded-lg bg-warning-subtle p-3 text-sm text-warning-text">{t('overlapWarning',{count:overlap})}</p>}
  <FormField etiqueta={t('name')} obligatorio><Input maxLength={120} value={name} onChange={(event)=>setName(event.target.value)}/></FormField>
  <FormField etiqueta={t('priority')} ayuda={t('priorityHint')}><Input type="number" min={0} max={100000} value={order} onChange={(event)=>setOrder(Number(event.target.value))}/></FormField>
  <FormField etiqueta={t('responsible')}><select className={control} value={owner} onChange={(event)=>setOwner(event.target.value)}><option value="">{t('roundRobinFallback')}</option>{data.people.map((person)=><option key={person.id} value={person.id}>{person.name}</option>)}</select></FormField>
  <ConditionBuilder value={filter} onChange={setFilter} label={t('criteria')} disabled={busy||legacy} allowedFields={CAMPOS_SEGMENTO}/>
  <label className="flex items-center justify-between text-sm text-fg"><span>{t('active')}</span><Switch checked={active} onCheckedChange={setActive}/></label>
 </Dialogo>;
}
