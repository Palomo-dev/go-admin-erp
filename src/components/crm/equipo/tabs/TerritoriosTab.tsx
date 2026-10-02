'use client';
import { useCallback,useEffect,useState } from 'react';
import { useTranslations,useFormatter } from 'next-intl';
import { Plus,MapPin,Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState,RowActionsMenu } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import type { TeamTerritory,TeamManagementData } from '@/lib/services/crm/teamManagementModel';
import { readTerritorios } from '../apiEquipo';
import { TerritoryEditor } from '../TerritoryEditor';
import { TerritoryRules } from '../TerritoryRules';
import { ErrorApiCrm } from '../../acciones/apiCrm';
export function TerritoriosTab({data,onSaved}:{data:TeamManagementData;onSaved:()=>Promise<void>}) {
 const t=useTranslations('crm.equipoNuevo'),format=useFormatter();
 const [state,setState]=useState<{loading:boolean;error:unknown;territories:TeamTerritory[];without:number}>({loading:true,error:null,territories:[],without:0}),[editing,setEditing]=useState<TeamTerritory|null|undefined>(undefined),[revision,setRevision]=useState(0);
 useEffect(()=>{const controller=new AbortController();setState({loading:true,error:null,territories:[],without:0});void readTerritorios(controller.signal).then((result)=>{if(!controller.signal.aborted)setState({loading:false,error:null,territories:result.territories,without:result.without_territory});}).catch((error)=>{if(!controller.signal.aborted)setState({loading:false,error,territories:[],without:0});});return()=>controller.abort();},[revision,data]);
 const saved=useCallback(async()=>{await onSaved();setRevision((value)=>value+1);},[onSaved]);
 return <div className="space-y-4">
  <div className="flex justify-end">{data.can_manage&&<Button onClick={()=>setEditing(null)}><Plus className="size-4"/>{t('newTerritory')}</Button>}</div>
  {state.loading?<div aria-busy="true" aria-label={t('loading')} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0,1,2].map((key)=><Skeleton key={key} className="h-48"/>)}</div>:state.error?<EmptyState variante={state.error instanceof ErrorApiCrm&&state.error.status===403?'forbidden':'error'} onReintentar={()=>setRevision((value)=>value+1)}/>:!state.territories.length?<EmptyState titulo={t('noTerritories')} descripcion={t('noTerritoriesHint')} icono={MapPin} accion={data.can_manage?{etiqueta:t('newTerritory'),onClick:()=>setEditing(null)}:undefined}/>:<>
   <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{state.territories.map((territory)=><article key={territory.id} className="space-y-4 rounded-xl border border-line bg-surface p-4">
    <div className="flex items-start gap-2"><MapPin className="size-5 shrink-0 text-brand"/><div className="min-w-0 flex-1"><h2 className="font-semibold text-fg">{territory.name}</h2><p className="mt-1 text-xs text-fg-secondary">{t('priorityValue',{order:territory.sort_order})} · {t(territory.is_active?'active':'inactive')}</p></div>{data.can_manage&&<RowActionsMenu titulo={territory.name} acciones={[{id:'edit',etiqueta:t('editTerritory'),icono:Pencil,onSelect:()=>setEditing(territory)}]}/>}</div>
    <TerritoryRules criteria={territory.criteria}/>
    <p className="text-sm text-fg-secondary">{data.teams.filter((team)=>team.territory_id===territory.id).map((team)=>team.name).join(' · ')||t('noTeam')}</p>
    <div className="grid grid-cols-2 gap-2 border-t border-line pt-3"><div><p className="text-xs text-fg-secondary">{t('customers')}</p><p className="mt-1 text-lg font-semibold tabular-nums">{format.number(territory.customer_count)}</p></div><div><p className="text-xs text-fg-secondary">{t('opportunities')}</p><p className="mt-1 text-lg font-semibold tabular-nums">{format.number(territory.opportunity_count)}</p></div></div>
    {territory.overlap_count>0&&<p className="text-xs text-warning-text">{t('overlapCount',{count:territory.overlap_count})}</p>}
   </article>)}</div>
   <p className="rounded-lg border border-line bg-subtle p-3 text-sm text-fg-secondary">{t('withoutTerritory',{count:state.without})}</p>
  </>}
  {editing!==undefined&&<TerritoryEditor data={data} territory={editing} onClose={()=>setEditing(undefined)} onSaved={saved}/>}
 </div>;
}
