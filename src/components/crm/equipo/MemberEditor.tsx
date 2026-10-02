'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { UserRound } from 'lucide-react';
import { Dialogo,FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { TeamMember,TeamManagementData } from '@/lib/services/crm/teamManagementModel';
import { saveEquipo } from './apiEquipo';
import { claveError } from '../acciones/apiCrm';
const control='h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg';
export function MemberEditor({data,teamId,member,onClose,onSaved}:{data:TeamManagementData;teamId:string;member:TeamMember|null;onClose:()=>void;onSaved:()=>Promise<void>}) {
 const t=useTranslations('crm.equipoNuevo'),errors=useTranslations('crm.accionesRapidas.errores');
 const [user,setUser]=useState(member?.user_id??''),[role,setRole]=useState(member?.sales_role_id??''),[territory,setTerritory]=useState(member?.territory_id??''),[quota,setQuota]=useState(member?.quota_amount===null||member?.quota_amount===undefined?'':String(member.quota_amount)),[active,setActive]=useState(member?.is_active??true),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const currency=member?.quota_currency??data.base_currency;
 const used=new Set(data.members.filter((item)=>item.sales_team_id===teamId&&item.id!==member?.id).map((item)=>item.user_id));
 const validQuota=quota===''||Number.isFinite(Number(quota))&&Number(quota)>=0&&Number(quota)<=1e15;
 async function save(){setBusy(true);setError(null);try{await saveEquipo({kind:'member',id:member?.id??null,expected_updated_at:member?.updated_at??null,data:{sales_team_id:teamId,user_id:user,sales_role_id:role||null,territory_id:territory||null,quota_amount:quota===''?null:Number(quota),quota_currency:currency,is_active:active}});onClose();await onSaved();}catch(cause){setError(errors(claveError(cause)));}finally{setBusy(false);}}
 return <Dialogo abierto onAbiertoChange={(open)=>!open&&onClose()} titulo={member?t('editMember'):t('addMember')} icono={UserRound} primario={{etiqueta:t('save'),onClick:()=>void save(),cargando:busy,deshabilitada:!user||!validQuota}}>
  {error&&<p role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">{error}</p>}
  <FormField etiqueta={t('person')} obligatorio><select className={control} value={user} onChange={(event)=>setUser(event.target.value)}><option value="">{t('selectPerson')}</option>{data.people.filter((person)=>!used.has(person.id)).map((person)=><option key={person.id} value={person.id}>{person.name}</option>)}</select></FormField>
  <FormField etiqueta={t('role')}><select className={control} value={role} onChange={(event)=>setRole(event.target.value)}><option value="">{t('noRole')}</option>{data.roles.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>
  <FormField etiqueta={t('territory')}><select className={control} value={territory} onChange={(event)=>setTerritory(event.target.value)}><option value="">{t('noTerritory')}</option>{data.territories.filter((item)=>item.is_active).map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>
  <FormField etiqueta={t('quotaCurrency',{currency})} ayuda={t('quotaHint')} error={!validQuota?t('invalidQuota'):null}><Input type="number" min={0} max={1e15} step="any" value={quota} onChange={(event)=>setQuota(event.target.value)}/></FormField>
  <label className="flex items-center justify-between text-sm text-fg"><span>{t('active')}</span><Switch checked={active} onCheckedChange={setActive}/></label>
  {!active&&<p className="text-sm text-warning-text">{t('inactiveHint')}</p>}
 </Dialogo>;
}
