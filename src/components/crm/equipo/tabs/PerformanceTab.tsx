'use client';
import { useTranslations,useFormatter } from 'next-intl';
import { ChartNoAxesCombined,Phone,Calendar,Target } from 'lucide-react';
import { DataTable,StatCard,EmptyState,type ColumnaTabla } from '@/components/kit';
import { Progress } from '@/components/ui/progress';
import type { TeamManagementData,TeamPerformance } from '@/lib/services/crm/teamManagementModel';
export function PerformanceTab({data}:{data:TeamManagementData}) {
 const t=useTranslations('crm.equipoNuevo'),format=useFormatter();
 const own=data.performance.find((row)=>row.user_id===data.current_user);
 const money=(value:number|null,currency:string)=>value===null?t('notAvailable'):format.number(value,{style:'currency',currency});
 const columns:ColumnaTabla<TeamPerformance>[]=[
  {id:'name',encabezado:t('person'),celda:(row)=>row.name},
  {id:'won',encabezado:t('won'),variante:'importe',celda:(row)=>row.money_missing?t('missingRate'):money(row.won,row.currency)},
  {id:'quota',encabezado:t('quota'),celda:(row)=>row.quota_pct===null?t('noQuota'):<span className="flex items-center gap-2"><Progress className="h-1.5" value={Math.min(100,row.quota_pct)}/><span className="text-xs">{format.number(row.quota_pct)}%</span></span>},
  {id:'calls',encabezado:t('calls'),variante:'importe',celda:(row)=>format.number(row.calls)},
  {id:'meetings',encabezado:t('meetings'),variante:'importe',celda:(row)=>format.number(row.meetings)},
  {id:'conversion',encabezado:t('conversion'),variante:'importe',celda:(row)=>format.number(row.conversion/100,{style:'percent',maximumFractionDigits:1})},
  {id:'cycle',encabezado:t('cycle'),variante:'importe',celda:(row)=>row.cycle_days===null?t('notAvailable'):t('days',{count:Math.round(row.cycle_days)})},
 ];
 return <div className="space-y-5">
  <p className="text-sm text-fg-secondary">{t('period',{start:data.period_start,end:data.period_end,timezone:data.timezone})}</p>
  {own&&<><div className="rounded-xl border border-line-brand bg-brand-tint p-5"><p className="text-sm font-medium text-brand-deep">{t('yourQuota')}</p><p className="mt-2 text-3xl font-semibold tabular-nums text-fg">{own.quota_pct===null?t('noQuota'):`${format.number(own.quota_pct)}%`}</p><Progress className="mt-4 h-2" value={Math.min(100,own.quota_pct??0)}/><p className="mt-3 text-sm text-fg-secondary">{own.money_missing?t('missingRate'):t('achieved',{amount:money(own.won,own.currency)})}</p></div>
   <div className="grid grid-cols-3 gap-3"><StatCard etiqueta={t('calls')} valor={format.number(own.calls)} icono={Phone}/><StatCard etiqueta={t('meetings')} valor={format.number(own.meetings)} icono={Calendar}/><StatCard etiqueta={t('conversion')} valor={format.number(own.conversion/100,{style:'percent',maximumFractionDigits:1})} icono={Target}/></div></>}
  {data.performance.length?<div className="rounded-xl border border-line bg-surface"><DataTable columnas={columns} filas={[...data.performance,...(data.performance_average?[{...data.performance_average,user_id:'average',name:t('average')}]:[])]} obtenerId={(row)=>row.user_id} etiqueta={t('performance')} tarjetaMovil={(row)=><div className="p-4"><p className="font-semibold">{row.name}</p><p className="mt-1 text-sm text-fg-secondary">{t('callsCount',{count:row.calls})} · {t('meetingsCount',{count:row.meetings})}</p></div>}/></div>:<EmptyState titulo={t('noPerformance')} descripcion={t('noPerformanceHint')} icono={ChartNoAxesCombined}/>}
  {data.ranking_enabled&&data.ranking.length>0&&<section className="rounded-xl border border-line bg-surface p-4"><h2 className="font-semibold text-fg">{t('ranking')}</h2><p className="mt-1 text-xs text-fg-secondary">{t('rankingHint')}</p><ol className="mt-4 space-y-3">{data.ranking.map((row,index)=><li key={row.user_id} className={`flex items-center gap-3 rounded-lg p-2 ${row.user_id===data.current_user?'bg-brand-tint text-brand-deep':'text-fg'}`}><span className="w-6 text-sm tabular-nums">{index+1}</span><span className="flex-1 text-sm">{row.name}{row.user_id===data.current_user?` · ${t('you')}`:''}</span><span className="text-sm font-semibold tabular-nums">{row.quota_pct===null?t('noQuota'):`${format.number(row.quota_pct)}%`}</span></li>)}</ol></section>}
 </div>;
}
