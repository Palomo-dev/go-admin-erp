'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Users } from 'lucide-react';
import { Dialogo,FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import type { CommercialTeam,TeamManagementData } from '@/lib/services/crm/teamManagementModel';
import { saveEquipo } from './apiEquipo';
import { claveError } from '../acciones/apiCrm';
const control='h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg';
export function TeamEditor({data,team,onClose,onSaved}:{data:TeamManagementData;team:CommercialTeam|null;onClose:()=>void;onSaved:()=>Promise<void>}) {
 const t=useTranslations('crm.equipoNuevo'),errors=useTranslations('crm.accionesRapidas.errores');
 const [name,setName]=useState(team?.name??''),[description,setDescription]=useState(team?.description??''),[territory,setTerritory]=useState(team?.territory_id??''),[active,setActive]=useState(team?.is_active??true),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 async function save(){setBusy(true);setError(null);try{await saveEquipo({kind:'team',id:team?.id??null,expected_updated_at:team?.updated_at??null,data:{name:name.trim(),description:description.trim()||null,territory_id:territory||null,is_active:active}});onClose();await onSaved();}catch(cause){setError(errors(claveError(cause)));}finally{setBusy(false);}}
 return <Dialogo abierto onAbiertoChange={(open)=>!open&&onClose()} titulo={team?t('editTeam'):t('newTeam')} icono={Users} primario={{etiqueta:t('save'),onClick:()=>void save(),cargando:busy,deshabilitada:!name.trim()||name.length>120}}>
  {error&&<p role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">{error}</p>}
  <FormField etiqueta={t('name')} obligatorio><Input maxLength={120} value={name} onChange={(event)=>setName(event.target.value)}/></FormField>
  <FormField etiqueta={t('description')}><Textarea maxLength={1000} value={description} onChange={(event)=>setDescription(event.target.value)}/></FormField>
  <FormField etiqueta={t('territory')}><select className={control} value={territory} onChange={(event)=>setTerritory(event.target.value)}><option value="">{t('noTerritory')}</option>{data.territories.filter((item)=>item.is_active).map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>
  <label className="flex items-center justify-between text-sm text-fg"><span>{t('active')}</span><Switch checked={active} onCheckedChange={setActive}/></label>
  {!active&&<p className="text-sm text-warning-text">{t('disableTeamHint')}</p>}
 </Dialogo>;
}
