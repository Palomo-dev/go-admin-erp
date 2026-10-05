'use client';
import { useCallback,useEffect,useState } from 'react';
import { useTranslations,useFormatter } from 'next-intl';
import { Plus,MapPin,Pencil } from 'lucide-react';
import { EmptyState,RowActionsMenu,clasesBoton,BadgeTono } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import type { TeamTerritory,TeamManagementData } from '@/lib/services/crm/teamManagementModel';
import { readTerritorios } from '../apiEquipo';
import { TerritoryEditor } from '../TerritoryEditor';
import { TerritoryRules } from '../TerritoryRules';
import { ErrorApiCrm } from '../../acciones/apiCrm';
import type { CabeceraEquipo } from '../cabeceraEquipo';
export function TerritoriosTab({data,onSaved,cabecera}:{data:TeamManagementData;onSaved:()=>Promise<void>;cabecera?:CabeceraEquipo}) {
 const t=useTranslations('crm.equipoNuevo'),format=useFormatter();
 const [state,setState]=useState<{loading:boolean;error:unknown;territories:TeamTerritory[];without:number}>({loading:true,error:null,territories:[],without:0}),[editing,setEditing]=useState<TeamTerritory|null|undefined>(undefined),[revision,setRevision]=useState(0);
 useEffect(()=>{const controller=new AbortController();setState({loading:true,error:null,territories:[],without:0});void readTerritorios(controller.signal).then((result)=>{if(!controller.signal.aborted)setState({loading:false,error:null,territories:result.territories,without:result.without_territory});}).catch((error)=>{if(!controller.signal.aborted)setState({loading:false,error,territories:[],without:0});});return()=>controller.abort();},[revision,data]);
 const saved=useCallback(async()=>{await onSaved();setRevision((value)=>value+1);},[onSaved]);
 const acciones=data.can_manage?<button type="button" className={clasesBoton()} onClick={()=>setEditing(null)}><Plus className="size-4"/>{t('newTerritory')}</button>:undefined;
 const accionMovil=data.can_manage?<button type="button" aria-label={t('newTerritory')} className={clasesBoton({variante:'fantasma'})} onClick={()=>setEditing(null)}><Plus className="size-5"/></button>:undefined;
 return <div className="space-y-4">
  {cabecera?cabecera(acciones,accionMovil):<div className="flex justify-end">{acciones}</div>}
  {state.loading?<div aria-busy="true" aria-label={t('loading')} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0,1,2].map((key)=><div key={key} className="flex h-[72px] items-center gap-3 rounded-xl border border-line bg-surface px-3"><Skeleton className="size-12 shrink-0 bg-pressed"/><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-3 w-3/4 bg-pressed"/><Skeleton className="h-2.5 w-1/2 bg-pressed"/></div><Skeleton className="h-3 w-16 bg-pressed"/></div>)}</div>:state.error?<EmptyState variante={state.error instanceof ErrorApiCrm&&state.error.status===403?'forbidden':'error'} onReintentar={()=>setRevision((value)=>value+1)}/>:!state.territories.length?<EmptyState className="min-h-[204px] rounded-xl border border-line bg-surface py-8" titulo={t('noTerritories')} descripcion="" icono={MapPin}/>:<>
   <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{state.territories.map((territory)=><article key={territory.id} className="min-h-[204px] space-y-2 rounded-xl border border-line bg-surface p-4">
    <div className="flex items-center gap-2" title={t('priorityValue',{order:territory.sort_order})}><MapPin className="size-4 shrink-0 text-brand"/><div className="min-w-0 flex-1"><h2 className="text-base font-semibold leading-[22px] text-fg">{territory.name}</h2>{!territory.is_active&&<BadgeTono tono="neutro" tamano="sm">{t('inactive')}</BadgeTono>}</div>{data.can_manage&&<RowActionsMenu titulo={territory.name} acciones={[{id:'edit',etiqueta:t('editTerritory'),icono:Pencil,onSelect:()=>setEditing(territory)}]}/>}</div>
    <TerritoryRules criteria={territory.criteria}/>
    <div className="space-y-2"><p className="text-xs font-medium text-fg-secondary">{t('visual.teamLabel')}</p><div className="flex flex-wrap gap-1">{data.teams.some(team=>team.territory_id===territory.id)?data.teams.filter(team=>team.territory_id===territory.id).map(team=><BadgeTono key={team.id} tono="marca" tamano="sm">{team.name}</BadgeTono>):<span className="text-xs text-fg-secondary">{t('noTeam')}</span>}</div></div>
    <p className="text-xs text-fg-secondary">{t('visual.territoryCounts',{customers:format.number(territory.customer_count),opportunities:format.number(territory.opportunity_count)})}</p>
    {territory.overlap_count>0&&<p className="text-xs text-warning-text">{t('overlapCount',{count:territory.overlap_count})}</p>}
   </article>)}</div>
   <p className="px-3 pt-3 text-[13px] leading-[18px] text-fg-secondary">{t('withoutTerritory',{count:state.without})}</p>
  </>}
  {state.loading&&<Skeleton aria-hidden="true" className="mx-3 mt-3 h-4 max-w-3xl rounded bg-pressed"/>}
  {editing!==undefined&&<TerritoryEditor data={data} territory={editing} onClose={()=>setEditing(undefined)} onSaved={saved}/>}
 </div>;
}
