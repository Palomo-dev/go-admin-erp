'use client';
import { useTranslations,useFormatter } from 'next-intl';
import { ChartNoAxesCombined,Calendar,Trophy,Users } from 'lucide-react';
import { DataTable,StatCard,EmptyState,AvatarIniciales,BadgeTono,type ColumnaTabla } from '@/components/kit';
import {PerformanceExport} from '../PerformanceExport';
import { Progress } from '@/components/ui/progress';
import type { TeamManagementData,TeamPerformance } from '@/lib/services/crm/teamManagementModel';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { CabeceraEquipo } from '../cabeceraEquipo';

/** Las métricas de dinero y conversión proceden del servicio, sin convertir monedas aquí. */
export function PerformanceTab({data,cabecera}:{data:TeamManagementData;cabecera?:CabeceraEquipo}) {
 const t=useTranslations('crm.equipoNuevo'),format=useFormatter();
 const dates=useFormatDate();
 const own=data.performance.find(row=>row.user_id===data.current_user);
 const money=(value:number|null,currency:string)=>value===null?t('notAvailable'):format.number(value,{style:'currency',currency});
 const percent=(value:number|null)=>value===null?t('notAvailable'):format.number(value/100,{style:'percent',maximumFractionDigits:1});
 const date=(value:string)=>dates.formatPlain(value);
 const comparable=data.performance.length>0&&data.performance.every(row=>!row.money_missing&&row.won!==null&&row.currency===data.base_currency);
 const won=comparable?data.performance.reduce((sum,row)=>sum+row.won!,0):null;
 const calls=data.performance.reduce((sum,row)=>sum+row.calls,0),meetings=data.performance.reduce((sum,row)=>sum+row.meetings,0);
 const average=data.performance_average??(data.performance.length===1?data.performance[0]:null);
 const ownQuotas=data.members.filter(member=>member.user_id===data.current_user&&member.is_active&&member.quota_amount!==null);
 const ownQuota=own&&ownQuotas.length===1&&ownQuotas[0].quota_currency===own.currency?ownQuotas[0].quota_amount:null;
 const rank=new Map(data.ranking.map((row,index)=>[row.user_id,index+1]));
 const rows=data.ranking_enabled?[...data.performance].sort((a,b)=>(rank.get(a.user_id)??Infinity)-(rank.get(b.user_id)??Infinity)):data.performance;
 const columns:ColumnaTabla<TeamPerformance>[]=[
  {id:'name',encabezado:t('person'),celda:row=><span className="flex items-center gap-2">{row.user_id!=='average'&&<>{data.ranking_enabled&&<span className="w-3 text-xs text-fg-muted">{rank.get(row.user_id)??'—'}</span>}<AvatarIniciales nombre={row.name} tamano="sm"/></>}<span className="font-medium">{row.name}</span>{data.ranking_enabled&&rank.get(row.user_id)===1&&<Trophy aria-hidden="true" className="size-4 text-warning"/>}</span>},
  {id:'won',encabezado:t('won'),variante:'importe',celda:row=>row.money_missing?t('missingRate'):money(row.won,row.currency)},
  {id:'quota',encabezado:t('quota'),celda:row=>row.quota_pct===null?<span className="text-xs text-fg-secondary">{t('noQuota')}</span>:<BadgeTono tono={row.quota_pct>=90?'exito':row.quota_pct>=50?'advertencia':'peligro'} tamano="sm">{percent(row.quota_pct)}</BadgeTono>},
  {id:'calls',encabezado:t('calls'),celda:row=><span className="text-[13px] text-fg-secondary">{format.number(row.calls)}</span>},
  {id:'meetings',encabezado:t('meetings'),celda:row=><span className="text-[13px] text-fg-secondary">{format.number(row.meetings)}</span>},
  {id:'conversion',encabezado:t('conversion'),celda:row=><span className="text-[13px] text-fg-secondary">{percent(row.conversion)}</span>},
  {id:'cycle',encabezado:t('cycle'),celda:row=><span className="text-[13px] text-fg-secondary">{row.cycle_days===null?t('notAvailable'):t('days',{count:Math.round(row.cycle_days)})}</span>},
 ];
 return <div>
  {cabecera?.(<PerformanceExport rows={rows} start={data.period_start} end={data.period_end}/>) }
  <div className="flex flex-col gap-4 lg:mt-4">
  <div className="hidden gap-2 lg:flex"><span className="inline-flex h-10 w-80 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg"><Users aria-hidden="true" className="size-4 text-fg-secondary"/>{t('visual.allTeams')}</span><span className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg-secondary"><Calendar aria-hidden="true" className="size-4"/>{t('period',{start:date(data.period_start),end:date(data.period_end),timezone:data.timezone})}</span></div>
  {data.performance.length>0&&<div className="hidden gap-4 sm:grid-cols-2 lg:grid lg:grid-cols-4">
   <StatCard etiqueta={t('won')} valor={won===null?t('notAvailable'):format.number(won,{style:'currency',currency:data.base_currency,notation:'compact',maximumFractionDigits:1})} detalle={!comparable?t('missingRate'):average?.quota_pct!==null&&average?.quota_pct!==undefined?`${t('quota')}: ${percent(average.quota_pct)} · ${t('average')}`:t('noQuota')} tono={!comparable?'advertencia':'neutro'}/>
   <StatCard etiqueta={t('calls')} valor={format.number(calls)}/>
   <StatCard etiqueta={t('meetings')} valor={format.number(meetings)}/>
   <StatCard etiqueta={t('visual.teamConversion')} valor={percent(average?.conversion??null)} detalle={t('average')}/>
  </div>}
  {own&&<div className="space-y-3 lg:hidden">
   <div className="space-y-2 rounded-xl border border-line bg-surface p-4">
    <p className="text-xs font-medium text-fg-secondary">{t('visual.quotaForPeriod')}</p>
    <p className="text-[28px] font-semibold leading-9 tracking-[-0.4px] tabular-nums text-fg">{own.money_missing?t('missingRate'):money(own.won,own.currency)}</p>
    <div className="flex items-center justify-between gap-2 text-[13px] text-fg-secondary"><span>{t('visual.quotaOf',{amount:money(ownQuota,own.currency)})}</span><span className="text-xs text-fg">{percent(own.quota_pct)}</span></div>
    {own.quota_pct!==null&&<Progress aria-label={t('quota')} className="h-2 bg-subtle" indicatorClassName="bg-brand" value={Math.min(100,own.quota_pct)}/>}
    {own.quota_pct!==null&&<p className={`text-xs leading-4 ${own.quota_pct>=100?'text-success-text':'text-fg-secondary'}`}>{t(own.quota_pct>=100?'visual.quotaReached':'visual.quotaProgress')}{data.ranking_enabled&&rank.has(own.user_id)?` · ${t('visual.rankPosition',{rank:rank.get(own.user_id)!,count:data.ranking.length})}`:''}</p>}
   </div>
   <div className="grid grid-cols-3 gap-2"><StatCard tamano="sm" etiqueta={t('calls')} valor={format.number(own.calls)}/><StatCard tamano="sm" etiqueta={t('meetings')} valor={format.number(own.meetings)}/><StatCard tamano="sm" etiqueta={t('conversion')} valor={percent(own.conversion)}/></div>
  </div>}
  {data.ranking_enabled&&data.ranking.length>0&&<section aria-label={t('ranking')} className="overflow-hidden rounded-xl border border-line bg-surface lg:hidden">
   <h2 className="sr-only">{t('ranking')}</h2>
   <ol>{data.ranking.map((row,index)=><li key={row.user_id} className={`flex min-h-11 items-center gap-2 px-3 py-2 ${row.user_id===data.current_user?'bg-brand-tint':'text-fg'}`}><span className="w-3 text-xs tabular-nums text-fg-muted">{index+1}</span><span className="min-w-0 flex-1 truncate text-sm">{row.name}{row.user_id===data.current_user?` (${t('you')})`:''}</span><span className="text-sm tabular-nums">{row.quota_pct===null?t('noQuota'):percent(row.quota_pct)}</span></li>)}</ol>
  </section>}
  {data.performance.length?<div className="hidden lg:block"><DataTable columnas={columns} filas={[...rows,...(data.performance_average?[{...data.performance_average,user_id:'average',name:t('average')}]:[])]} obtenerId={row=>row.user_id} etiqueta={t('performance')}/></div>:<EmptyState titulo={t('noPerformance')} descripcion={t('noPerformanceHint')} icono={ChartNoAxesCombined}/>}
  </div>
 </div>;
}
