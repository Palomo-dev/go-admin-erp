'use client';
import { useState } from 'react';
import { useTranslations,useFormatter } from 'next-intl';
import { Plus,Users,Pencil,UserPlus,ChevronRight } from 'lucide-react';
import { EmptyState,DataTable,AvatarIniciales,RowActionsMenu,StatusBadge,clasesBoton,type ColumnaTabla } from '@/components/kit';
import { Progress } from '@/components/ui/progress';
import type { CommercialTeam,TeamMember,TeamManagementData } from '@/lib/services/crm/teamManagementModel';
import { TeamEditor } from '../TeamEditor';
import { MemberEditor } from '../MemberEditor';
import type { CabeceraEquipo } from '../cabeceraEquipo';
export function EquiposTab({data,onSaved,cabecera}:{data:TeamManagementData;onSaved:()=>Promise<void>;cabecera?:CabeceraEquipo}) {
 const t=useTranslations('crm.equipoNuevo'),format=useFormatter();
 const [selected,setSelected]=useState(data.teams.find((team)=>team.is_active)?.id??data.teams[0]?.id??''),[editTeam,setEditTeam]=useState<CommercialTeam|null|undefined>(undefined),[editMember,setEditMember]=useState<TeamMember|null|undefined>(undefined);
 const team=data.teams.find((item)=>item.id===selected),members=data.members.filter((member)=>member.sales_team_id===selected);
 const territoryName=(id:string|null)=>data.territories.find((item)=>item.id===id)?.name??t('noTerritory');
 const quotaMembers=members.filter(member=>member.is_active&&member.quota_amount!==null);
 const currency=quotaMembers[0]?.quota_currency;
 const teamQuota=currency&&quotaMembers.every(member=>member.quota_currency===currency)?format.number(quotaMembers.reduce((sum,member)=>sum+Number(member.quota_amount),0),{style:'currency',currency}):t('notAvailable');
 const money=(amount:number|null,quotaCurrency:string)=>amount===null?t('notAvailable'):format.number(amount,{style:'currency',currency:quotaCurrency,notation:'compact',maximumFractionDigits:1});
 const quota=(member:TeamMember)=>member.money_missing?<span className="text-xs text-warning-text">{t('missingRate')}</span>:member.quota_amount===null?<span className="text-xs text-fg-secondary">{t('noQuota')}</span>:<div className="min-w-44 space-y-1.5"><div className="flex items-center justify-between gap-3 text-[13px] leading-[18px]"><span className="text-fg-secondary">{t('visual.quotaAmounts',{achieved:money(member.achieved,member.quota_currency),quota:money(member.quota_amount,member.quota_currency)})}</span><span className="text-xs tabular-nums">{member.quota_pct===null?t('notAvailable'):`${format.number(member.quota_pct)}%`}</span></div>{member.quota_pct!==null&&<Progress aria-label={t('progress')} className="h-2 bg-subtle" indicatorClassName={member.quota_pct<50?'bg-warning':'bg-brand'} value={Math.min(100,member.quota_pct)}/>}</div>;
 const columns:ColumnaTabla<TeamMember>[]=[
  {id:'name',encabezado:t('person'),celda:(member)=><span className="flex items-center gap-2"><AvatarIniciales nombre={member.name} tamano="sm"/><span>{member.name}</span></span>},
  {id:'role',encabezado:t('role'),celda:(member)=><span className="text-[13px] text-fg-secondary">{member.role_name??t('noRole')}</span>},
  {id:'territory',encabezado:t('territory'),celda:(member)=><span className="text-[13px] text-fg-secondary">{territoryName(member.territory_id)}</span>},
  {id:'quota',encabezado:t('monthlyQuota'),celda:quota},
  {id:'status',encabezado:t('status'),celda:(member)=><StatusBadge estado={member.is_active?'active':'inactive'} etiqueta={t(member.is_active?'active':'inactive')} tipografia="figma"/>},
 ];
 const acciones=data.can_manage?<><button type="button" className={clasesBoton({variante:'secundario'})} onClick={()=>setEditTeam(null)}><Plus className="size-4"/>{t('newTeam')}</button><button type="button" className={clasesBoton()} disabled={!team?.is_active} onClick={()=>setEditMember(null)}><UserPlus className="size-4"/>{t('addMember')}</button></>:undefined;
 const accionMovil=data.can_manage?<RowActionsMenu titulo={t('title')} orientacion="horizontal" tamano="md" acciones={[{id:'newTeam',etiqueta:t('newTeam'),icono:Plus,onSelect:()=>setEditTeam(null)},{id:'addMember',etiqueta:t('addMember'),icono:UserPlus,onSelect:()=>setEditMember(null),oculta:!team?.is_active}]}/>:undefined;
 return <div className="space-y-4">
  {cabecera?cabecera(acciones,accionMovil):<div className="flex justify-end gap-2">{acciones}</div>}
  {!data.teams.length?<EmptyState titulo={t('noTeams')} descripcion={t('noTeamsHint')} icono={Users} accion={data.can_manage?{etiqueta:t('newTeam'),onClick:()=>setEditTeam(null)}:undefined}/>:<div className="grid gap-4 lg:grid-cols-[300px_1fr]">
   <aside className="space-y-2">{data.teams.map((item)=><div key={item.id} className={`flex min-h-16 items-center gap-2 rounded-xl border px-3 py-2 ${item.id===selected?'border-line-brand bg-brand-tint':'border-line bg-surface'}`}>
    <button type="button" onClick={()=>setSelected(item.id)} aria-pressed={item.id===selected} className="flex min-w-0 flex-1 items-center gap-3 text-left"><Users aria-hidden="true" className={`size-4 shrink-0 ${item.id===selected?'text-brand':'text-fg-secondary'}`}/><span className="min-w-0"><span className="block truncate text-sm font-medium text-fg">{item.name}</span><span className="mt-0.5 block text-xs text-fg-secondary">{t('memberCount',{count:data.members.filter((member)=>member.sales_team_id===item.id&&member.is_active).length})} · {territoryName(item.territory_id)}</span>{!item.is_active&&<span className="text-xs text-warning-text">{t('inactive')}</span>}</span><ChevronRight aria-hidden="true" className="ml-auto size-4 shrink-0 text-fg-muted"/></button>
    {data.can_manage&&<RowActionsMenu titulo={item.name} acciones={[{id:'edit',etiqueta:t('editTeam'),icono:Pencil,onSelect:()=>setEditTeam(item)}]}/>}
   </div>)}</aside>
   <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3"><h2 className="text-base font-semibold leading-[22px] text-fg">{team?.name}</h2><p className="text-[13px] text-fg-secondary">{t('visual.teamQuota',{amount:teamQuota})}</p></div>
    <DataTable marco="integrado" columnas={columns} filas={members} obtenerId={(member)=>member.id} etiqueta={t('members')} acciones={data.can_manage?(member)=>[{id:'edit',etiqueta:t('editMember'),icono:Pencil,onSelect:()=>setEditMember(member)}]:undefined} vacio={{titulo:t('noMembers'),descripcion:t('noMembersHint'),accion:data.can_manage?{etiqueta:t('addMember'),onClick:()=>setEditMember(null)}:undefined}} tarjetaMovil={(member)=><div className="space-y-2 p-3"><p className="font-medium">{member.name}</p><p className="text-sm text-fg-secondary">{member.role_name??t('noRole')} · {territoryName(member.territory_id)}</p>{quota(member)}</div>}/>
   </div>
  </div>}
  {editTeam!==undefined&&<TeamEditor data={data} team={editTeam} onClose={()=>setEditTeam(undefined)} onSaved={onSaved}/>}
  {editMember!==undefined&&team&&<MemberEditor data={data} teamId={team.id} member={editMember} onClose={()=>setEditMember(undefined)} onSaved={onSaved}/>}
 </div>;
}
