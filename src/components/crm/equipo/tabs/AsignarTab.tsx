'use client';
import { useEffect,useState } from 'react';
import { useTranslations,useFormatter } from 'next-intl';
import { Play,Save } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { FormField,EmptyState,clasesBoton } from '@/components/kit';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { Progress } from '@/components/ui/progress';
import type { TeamManagementData,AssignmentSimulation } from '@/lib/services/crm/teamManagementModel';
import type { LeadAssignmentConfig } from '@/lib/services/crm/leadAssignmentConfig';
import { saveEquipo,simulateEquipo } from '../apiEquipo';
import { claveError } from '../../acciones/apiCrm';
import type { CabeceraEquipo } from '../cabeceraEquipo';
export function AsignarTab({data,onSaved,cabecera}:{data:TeamManagementData;onSaved:()=>Promise<void>;cabecera?:CabeceraEquipo}) {
 const t=useTranslations('crm.equipoNuevo'),errors=useTranslations('crm.accionesRapidas.errores'),format=useFormatter();
 const [config,setConfig]=useState<LeadAssignmentConfig>(data.config),[simulation,setSimulation]=useState<AssignmentSimulation|null>(null),[busy,setBusy]=useState<'save'|'simulate'|null>(null),[error,setError]=useState<string|null>(null),[success,setSuccess]=useState(false);
 useEffect(()=>{setConfig(data.config);setSimulation(null);setError(null);},[data]);
 const territories=data.territories.some((territory)=>territory.is_active);
 const strategies=['round_robin','territory','load_balance'] as const;
 function update(next:LeadAssignmentConfig){setConfig(next);setSimulation(null);setError(null);setSuccess(false);}
 async function save(){setBusy('save');setError(null);try{await saveEquipo({kind:'assignment',id:null,expected_updated_at:data.config_updated_at,data:config});setSuccess(true);await onSaved();}catch(cause){setError(errors(claveError(cause)));}finally{setBusy(null);}}
 async function simulate(){setBusy('simulate');setError(null);setSimulation(null);try{setSimulation(await simulateEquipo(config));}catch(cause){setError(errors(claveError(cause)));}finally{setBusy(null);}}
 const acciones=<button type="button" className={clasesBoton()} onClick={()=>void save()} disabled={!data.can_configure||!!busy||config.enabled&&config.strategy==='territory'&&!territories}><Save className="size-4"/>{t('save')}</button>;
 const accionMovil=<button type="button" aria-label={t('save')} className={clasesBoton({variante:'fantasma'})} onClick={()=>void save()} disabled={!data.can_configure||!!busy||config.enabled&&config.strategy==='territory'&&!territories}><Save className="size-5"/></button>;
 return <div className="space-y-4">
  {cabecera?cabecera(acciones,accionMovil):<div className="flex justify-end">{acciones}</div>}
  {error&&<div role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">{error}</div>}
  {success&&<p role="status" className="text-sm text-success-text">{t('saved')}</p>}
  <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
   <section className="space-y-4 rounded-xl border border-line bg-surface p-4">
    <div className="flex items-center justify-between"><h2 className="text-base font-semibold leading-[22px] text-fg">{t('automaticAssignment')}</h2><Switch aria-label={t('automaticAssignment')} checked={config.enabled} onCheckedChange={(enabled)=>update({...config,enabled})} disabled={!data.can_configure||!!busy}/></div>
    <div role="radiogroup" aria-label={t('strategy')} className="space-y-3"><p className="text-xs font-medium text-fg-secondary">{t('strategy')}</p>{strategies.map(key=><label key={key} title={key==='territory'&&!territories?t('territoryDisabled'):undefined} className={`flex min-h-16 items-center gap-3 rounded-lg border p-3 ${config.strategy===key?'border-brand bg-brand-tint':'border-line bg-surface'}`}>
     <input type="radio" name="lead-assignment" className="size-[18px] shrink-0 accent-brand" checked={config.strategy===key} onChange={()=>update({...config,strategy:key})} disabled={!data.can_configure||!!busy||key==='territory'&&!territories}/><span><span className="block text-sm font-medium text-fg">{t(key)}</span><span className="mt-1 block text-xs text-fg-secondary">{t(`${key}Hint`)}</span></span>
    </label>)}</div>
    <FormField etiqueta={t('defaultTeam')}><SelectCrm valor={config.team_id??''} opcionVacia={t('firstTeam')} disabled={!data.can_configure||!!busy} onValorChange={value=>update({...config,team_id:value||null})} opciones={data.teams.filter(team=>team.is_active).map(team=>({valor:team.id,etiqueta:team.name}))} /></FormField>
    <p className="rounded-lg bg-subtle p-3 text-sm text-fg-secondary">{t('assignmentHint')}</p>
    {!data.can_configure&&<p className="text-sm text-fg-secondary">{t('adminConfiguration')}</p>}
   </section>
   <section className="space-y-4 rounded-xl border border-line bg-surface p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-base font-semibold leading-[22px] text-fg">{t('simulation')}</h2><p className="mt-1 text-xs text-fg-secondary">{t('simulationHint')}</p></div><button type="button" className={clasesBoton({variante:'secundario',tamano:'sm',patron:'button'})} onClick={()=>void simulate()} disabled={!data.can_manage||!!busy}><Play className="size-4"/>{busy==='simulate'?t('simulating'):t('simulate')}</button></div>
    {simulation?<><p className="text-sm text-fg-secondary">{t('sampleSummary',{count:simulation.sample_count,preserved:simulation.preserved,unassigned:simulation.unassigned})}</p>{simulation.distribution.length?<ul aria-label={t('distribution')} className="space-y-3">{simulation.distribution.map(row=><li key={row.user_id} className="space-y-1.5"><div className="flex items-center justify-between gap-3 text-[13px] leading-[18px]"><span className="text-fg-secondary">{row.name}</span><span className="shrink-0 tabular-nums text-fg">{format.number(row.proposed)} · {format.number(simulation.sample_count?row.proposed/simulation.sample_count:0,{style:'percent',maximumFractionDigits:0})}</span></div><Progress aria-label={`${row.name}: ${t('proposed')}`} className="h-2 bg-subtle" indicatorClassName="bg-brand" value={simulation.sample_count?row.proposed/simulation.sample_count*100:0}/></li>)}</ul>:<EmptyState compacto titulo={t('noLeads')} descripcion={t('noLeadsHint')}/>}<p className="text-xs text-fg-secondary">{t('current')}: {simulation.distribution.map(row=>format.number(row.current)).join(' / ')}</p><p className="text-xs text-fg-secondary">{t('fallbackSummary',{count:simulation.fallback_count})}</p></>:<EmptyState compacto titulo={t('simulationReady')} descripcion={t('simulationReadyHint')} icono={Play} accion={data.can_manage?{etiqueta:t('simulate'),onClick:()=>void simulate()}:undefined}/>}
   </section>
  </div>
 </div>;
}
