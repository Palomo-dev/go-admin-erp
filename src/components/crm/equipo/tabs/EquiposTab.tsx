'use client';
import { useState } from 'react';
import { useTranslations,useFormatter } from 'next-intl';
import { Plus,Users,Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState,DataTable,AvatarIniciales,RowActionsMenu,type ColumnaTabla } from '@/components/kit';
import { Progress } from '@/components/ui/progress';
import type { CommercialTeam,TeamMember,TeamManagementData } from '@/lib/services/crm/teamManagementModel';
import { TeamEditor } from '../TeamEditor';
import { MemberEditor } from '../MemberEditor';
export function EquiposTab({data,onSaved}:{data:TeamManagementData;onSaved:()=>Promise<void>}) {
 const t=useTranslations('crm.equipoNuevo'),format=useFormatter();
 const [selected,setSelected]=useState(data.teams.find((team)=>team.is_active)?.id??data.teams[0]?.id??''),[editTeam,setEditTeam]=useState<CommercialTeam|null|undefined>(undefined),[editMember,setEditMember]=useState<TeamMember|null|undefined>(undefined);
 const team=data.teams.find((item)=>item.id===selected),members=data.members.filter((member)=>member.sales_team_id===selected);
 const territoryName=(id:string|null)=>data.territories.find((item)=>item.id===id)?.name??t('noTerritory');
 const columns:ColumnaTabla<TeamMember>[]=[
  {id:'name',encabezado:t('person'),celda:(member)=><span className="flex items-center gap-2"><AvatarIniciales nombre={member.name} tamano="sm"/><span>{member.name}</span></span>},
  {id:'role',encabezado:t('role'),celda:(member)=>member.role_name??t('noRole')},
  {id:'territory',encabezado:t('territory'),celda:(member)=>territoryName(member.territory_id)},
  {id:'quota',encabezado:t('monthlyQuota'),variante:'importe',celda:(member)=>member.quota_amount===null?t('notAvailable'):format.number(Number(member.quota_amount),{style:'currency',currency:member.quota_currency})},
  {id:'progress',encabezado:t('progress'),celda:(member)=>member.money_missing?<span className="text-warning-text">{t('missingRate')}</span>:member.quota_pct===null?t('noQuota'):<span className="flex min-w-24 items-center gap-2"><Progress className="h-1.5" value={Math.min(100,member.quota_pct)}/><span className="text-xs tabular-nums">{format.number(member.quota_pct)}%</span></span>},
  {id:'status',encabezado:t('status'),celda:(member)=><span className={member.is_active?'text-success-text':'text-fg-secondary'}>{t(member.is_active?'active':'inactive')}</span>},
 ];
 return <div className="space-y-4">
  <div className="flex justify-end gap-2">{data.can_manage&&<><Button variant="outline" onClick={()=>setEditTeam(null)}><Plus className="size-4"/>{t('newTeam')}</Button><Button disabled={!team?.is_active} onClick={()=>setEditMember(null)}><Plus className="size-4"/>{t('addMember')}</Button></>}</div>
  {!data.teams.length?<EmptyState titulo={t('noTeams')} descripcion={t('noTeamsHint')} icono={Users} accion={data.can_manage?{etiqueta:t('newTeam'),onClick:()=>setEditTeam(null)}:undefined}/>:<div className="grid gap-4 lg:grid-cols-[280px_1fr]">
   <aside className="space-y-2">{data.teams.map((item)=><div key={item.id} className={`flex items-start gap-2 rounded-xl border p-4 ${item.id===selected?'border-line-brand bg-brand-tint':'border-line bg-surface'}`}>
    <button type="button" onClick={()=>setSelected(item.id)} aria-pressed={item.id===selected} className="min-w-0 flex-1 text-left"><span className="block font-semibold text-fg">{item.name}</span><span className="mt-1 block text-xs text-fg-secondary">{t('memberCount',{count:data.members.filter((member)=>member.sales_team_id===item.id&&member.is_active).length})}</span><span className="mt-1 block text-xs text-fg-secondary">{territoryName(item.territory_id)}</span>{!item.is_active&&<span className="text-xs text-warning-text">{t('inactive')}</span>}</button>
    {data.can_manage&&<RowActionsMenu titulo={item.name} acciones={[{id:'edit',etiqueta:t('editTeam'),icono:Pencil,onSelect:()=>setEditTeam(item)}]}/>}
   </div>)}</aside>
   <div className="min-w-0 rounded-xl border border-line bg-surface"><div className="border-b border-line p-4"><h2 className="font-semibold text-fg">{team?.name}</h2><p className="mt-1 text-sm text-fg-secondary">{team?.description??t('teamHint')}</p></div>
    <DataTable columnas={columns} filas={members} obtenerId={(member)=>member.id} etiqueta={t('members')} acciones={data.can_manage?(member)=>[{id:'edit',etiqueta:t('editMember'),icono:Pencil,onSelect:()=>setEditMember(member)}]:undefined} vacio={{titulo:t('noMembers'),descripcion:t('noMembersHint'),accion:data.can_manage?{etiqueta:t('addMember'),onClick:()=>setEditMember(null)}:undefined}} tarjetaMovil={(member)=><div className="space-y-2 p-3"><p className="font-medium">{member.name}</p><p className="text-sm text-fg-secondary">{member.role_name??t('noRole')} · {territoryName(member.territory_id)}</p><p className="text-sm">{member.quota_pct===null?t('noQuota'):`${format.number(member.quota_pct)}%`}</p></div>}/>
   </div>
  </div>}
  {editTeam!==undefined&&<TeamEditor data={data} team={editTeam} onClose={()=>setEditTeam(undefined)} onSaved={onSaved}/>}
  {editMember!==undefined&&team&&<MemberEditor data={data} teamId={team.id} member={editMember} onClose={()=>setEditMember(undefined)} onSaved={onSaved}/>}
 </div>;
}
