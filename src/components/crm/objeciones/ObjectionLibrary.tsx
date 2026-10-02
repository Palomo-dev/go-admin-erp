'use client';
import {useFormatter,useTranslations} from 'next-intl';
import {Pencil,TriangleAlert,Eye} from 'lucide-react';
import {DataTable,type ColumnaTabla} from '@/components/kit';
import {Switch} from '@/components/ui/switch';
import type {Objection} from '@/lib/services/crm/objectionService';
import type {LibraryRow} from './objectionLibraryModel';
export function ObjectionLibrary({rows,canManage,busy,onOpen,onEdit,onToggle,onClear,filtered,loading=false}:{rows:LibraryRow[];canManage:boolean;busy:string|null;onOpen:(row:Objection)=>void;onEdit:(row:Objection)=>void;onToggle:(row:Objection)=>void;onClear:()=>void;filtered:boolean;loading?:boolean}){
 const t=useTranslations('crm.objecionesNuevo'),format=useFormatter();
 const category=(value:string|null)=>value?(t.has(`categories.${value}`)?t(`categories.${value}`):value):'—';
 const pct=(rate:number|null)=>rate===null?'—':format.number(rate,{style:'percent',maximumFractionDigits:0});
 const columns:ColumnaTabla<LibraryRow>[]=[
  {id:'title',encabezado:t('title'),celda:({objection:row})=><div className="min-w-0"><button type="button" className="text-left font-medium text-fg hover:text-brand" onClick={()=>onOpen(row)}>{row.title}</button><p className="mt-1 max-w-96 truncate text-xs text-fg-secondary">{row.detection_signals?.slice(0,2).join(' · ')}</p>{!row.is_active&&<span className="text-xs text-fg-secondary">{t('inactive')}</span>}</div>},
  {id:'category',encabezado:t('category'),celda:({objection:row})=><span className="rounded-full border border-line bg-subtle px-2 py-0.5 text-xs font-medium text-fg-secondary">{category(row.category)}</span>},
  {id:'frequency',encabezado:t('visual.frequencyHeader'),celda:(row)=><div className="flex items-center gap-2"><div className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-subtle">{row.share!==null&&<div className="h-full rounded-full bg-brand" style={{width:`${Math.min(100,row.share*100)}%`}}/>}</div><span className="whitespace-nowrap text-xs tabular-nums text-fg-secondary">{row.calls===null?'—':`${format.number(row.calls)} · ${pct(row.share)}`}</span></div>},
  {id:'advanced',encabezado:t('visual.advancedHeader'),variante:'importe',celda:row=>pct(row.advancedRate)},
 ];
 const card=({objection:row,calls,advancedRate}:LibraryRow)=><div className="space-y-2 p-4"><button type="button" className="font-medium text-fg" onClick={()=>onOpen(row)}>{row.title}</button><p className="text-xs text-fg-secondary">{category(row.category)} · {calls===null?'—':t('callCount',{count:calls})} · {pct(advancedRate)}</p><p className="text-sm text-fg-secondary">{row.recommended_response??t('noResponse')}</p></div>;
 return <DataTable columnas={columns} filas={rows} obtenerId={row=>row.objection.id} etiqueta={t('title')} densidad="comoda" estado={loading?'cargando':'listo'}
  tarjetaMovil={card} accionesRapidas={({objection:row})=><Switch aria-label={t(row.is_active?'deactivate':'activate',{title:row.title})} checked={row.is_active} disabled={!canManage||busy===row.id} onCheckedChange={()=>onToggle(row)}/>}
  acciones={({objection:row})=>[{id:'detail',etiqueta:t('detail'),icono:Eye,onSelect:()=>onOpen(row)},...(canManage?[{id:'edit',etiqueta:t('editTitle',{title:row.title}),icono:Pencil,onSelect:()=>onEdit(row)}]:[])]}
  vacio={{titulo:t(filtered?'noResults':'noObjections'),descripcion:t(filtered?'noResultsHint':'noObjectionsHint'),icono:TriangleAlert,accion:filtered?{etiqueta:t('clearFilters'),onClick:onClear}:undefined}}/>;
}
