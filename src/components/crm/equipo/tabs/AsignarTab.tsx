'use client';
import { useEffect,useState } from 'react';
import { useTranslations,useFormatter } from 'next-intl';
import { Shuffle,MapPin,Scale,Play,Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { FormField,DataTable,EmptyState,type ColumnaTabla } from '@/components/kit';
import { Progress } from '@/components/ui/progress';
import type { TeamManagementData,AssignmentSimulation } from '@/lib/services/crm/teamManagementModel';
import type { LeadAssignmentConfig } from '@/lib/services/crm/leadAssignmentConfig';
import { saveEquipo,simulateEquipo } from '../apiEquipo';
import { claveError } from '../../acciones/apiCrm';
const control='h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg';
export function AsignarTab({data,onSaved}:{data:TeamManagementData;onSaved:()=>Promise<void>}) {
 const t=useTranslations('crm.equipoNuevo'),errors=useTranslations('crm.accionesRapidas.errores'),format=useFormatter();
 const [config,setConfig]=useState<LeadAssignmentConfig>(data.config),[simulation,setSimulation]=useState<AssignmentSimulation|null>(null),[busy,setBusy]=useState<'save'|'simulate'|null>(null),[error,setError]=useState<string|null>(null),[success,setSuccess]=useState(false);
 useEffect(()=>{setConfig(data.config);setSimulation(null);setError(null);},[data]);
 const territories=data.territories.some((territory)=>territory.is_active);
 const strategies=[{key:'round_robin' as const,icon:Shuffle},{key:'territory' as const,icon:MapPin},{key:'load_balance' as const,icon:Scale}];
 function update(next:LeadAssignmentConfig){setConfig(next);setSimulation(null);setError(null);setSuccess(false);}
 async function save(){setBusy('save');setError(null);try{await saveEquipo({kind:'assignment',id:null,expected_updated_at:data.config_updated_at,data:config});setSuccess(true);await onSaved();}catch(cause){setError(errors(claveError(cause)));}finally{setBusy(null);}}
 async function simulate(){setBusy('simulate');setError(null);setSimulation(null);try{setSimulation(await simulateEquipo(config));}catch(cause){setError(errors(claveError(cause)));}finally{setBusy(null);}}
 const columns:ColumnaTabla<AssignmentSimulation['distribution'][number]>[]=[
  {id:'name',encabezado:t('person'),celda:(row)=>row.name},
  {id:'current',encabezado:t('current'),variante:'importe',celda:(row)=>format.number(row.current)},
  {id:'proposed',encabezado:t('proposed'),celda:(row)=><div className="flex items-center gap-2"><Progress className="h-1.5" value={simulation?.sample_count?row.proposed/simulation.sample_count*100:0}/><span className="tabular-nums">{format.number(row.proposed)}</span></div>},
 ];
 return <div className="space-y-4">
  <div className="flex justify-end"><Button onClick={()=>void save()} disabled={!data.can_configure||!!busy||config.enabled&&config.strategy==='territory'&&!territories}><Save className="size-4"/>{t('save')}</Button></div>
  {error&&<div role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">{error}</div>}
  {success&&<p role="status" className="text-sm text-success-text">{t('saved')}</p>}
  <div className="grid gap-4 lg:grid-cols-2">
   <section className="space-y-4 rounded-xl border border-line bg-surface p-5">
    <div className="flex items-center justify-between"><h2 className="font-semibold text-fg">{t('automaticAssignment')}</h2><Switch aria-label={t('automaticAssignment')} checked={config.enabled} onCheckedChange={(enabled)=>update({...config,enabled})} disabled={!data.can_configure||!!busy}/></div>
    <div role="radiogroup" aria-label={t('strategy')} className="space-y-2">{strategies.map(({key,icon:Icon})=><label key={key} title={key==='territory'&&!territories?t('territoryDisabled'):undefined} className={`flex gap-3 rounded-lg border p-4 ${config.strategy===key?'border-line-brand bg-brand-tint':'border-line bg-surface'}`}>
     <input type="radio" name="lead-assignment" checked={config.strategy===key} onChange={()=>update({...config,strategy:key})} disabled={!data.can_configure||!!busy||key==='territory'&&!territories}/><Icon className="mt-0.5 size-4 shrink-0 text-brand"/><span><span className="block text-sm font-medium text-fg">{t(key)}</span><span className="mt-1 block text-xs text-fg-secondary">{t(`${key}Hint`)}</span></span>
    </label>)}</div>
    <FormField etiqueta={t('defaultTeam')}><select className={control} value={config.team_id??''} disabled={!data.can_configure||!!busy} onChange={(event)=>update({...config,team_id:event.target.value||null})}><option value="">{t('firstTeam')}</option>{data.teams.filter((team)=>team.is_active).map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}</select></FormField>
    <p className="rounded-lg bg-subtle p-3 text-sm text-fg-secondary">{t('assignmentHint')}</p>
    {!data.can_configure&&<p className="text-sm text-fg-secondary">{t('adminConfiguration')}</p>}
   </section>
   <section className="space-y-4 rounded-xl border border-line bg-surface p-5">
    <div className="flex items-center justify-between gap-2"><div><h2 className="font-semibold text-fg">{t('simulation')}</h2><p className="mt-1 text-xs text-fg-secondary">{t('simulationHint')}</p></div><Button variant="outline" onClick={()=>void simulate()} disabled={!data.can_manage||!!busy}><Play className="size-4"/>{busy==='simulate'?t('simulating'):t('simulate')}</Button></div>
    {simulation?<><p className="text-sm text-fg-secondary">{t('sampleSummary',{count:simulation.sample_count,preserved:simulation.preserved,unassigned:simulation.unassigned})}</p><DataTable columnas={columns} filas={simulation.distribution} obtenerId={(row)=>row.user_id} etiqueta={t('distribution')} vacio={{titulo:t('noLeads'),descripcion:t('noLeadsHint')}}/><p className="text-xs text-fg-secondary">{t('fallbackSummary',{count:simulation.fallback_count})}</p></>:<EmptyState compacto titulo={t('simulationReady')} descripcion={t('simulationReadyHint')} icono={Play} accion={data.can_manage?{etiqueta:t('simulate'),onClick:()=>void simulate()}:undefined}/>}
   </section>
  </div>
 </div>;
}
