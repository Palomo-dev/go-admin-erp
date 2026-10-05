'use client';
import {useFormatter,useTranslations} from 'next-intl';
import {Pencil,TriangleAlert,Eye,Search,Plus,Power} from 'lucide-react';
import {DataTable,EmptyState,BadgeTono,type ColumnaTabla} from '@/components/kit';
import {ObjectionLibrarySkeleton} from './ObjectionLibrarySkeleton';
import type {Objection} from '@/lib/services/crm/objectionService';
import type {LibraryRow} from './objectionLibraryModel';
export function ObjectionLibrary({rows,canManage,busy,onOpen,onEdit,onToggle,onClear,onCreate,query='',filtered,loading=false}:{rows:LibraryRow[];canManage:boolean;busy:string|null;onOpen:(row:Objection)=>void;onEdit:(row:Objection)=>void;onToggle:(row:Objection)=>void;onClear:()=>void;onCreate?:()=>void;query?:string;filtered:boolean;loading?:boolean}){
 const t=useTranslations('crm.objecionesNuevo'),format=useFormatter();
 if(loading)return <ObjectionLibrarySkeleton label={t('loading')}/>;
 const category=(value:string|null)=>value?(t.has(`categories.${value}`)?t(`categories.${value}`):value):'—';
 const pct=(rate:number|null)=>rate===null?'—':format.number(rate,{style:'percent',maximumFractionDigits:0});
 const peak=Math.max(1,...rows.map(row=>row.calls??0));
 if(!loading&&!rows.length)return <div className="min-h-[392px] rounded-xl border border-line bg-surface">
  <EmptyState titulo={t(filtered?'noResults':'noObjections')} descripcion={t(filtered?'visual.createSearchHint':'noObjectionsHint')}
   icono={filtered?Search:TriangleAlert} className="min-h-[392px]"
   accion={canManage&&onCreate?{etiqueta:query.trim()?t('visual.createFromSearch',{query:query.trim()}):t('new'),icono:Plus,onClick:onCreate}:undefined}
   accionSecundaria={filtered?{etiqueta:t('clearFilters'),onClick:onClear}:undefined}/>
 </div>;
 const columns:ColumnaTabla<LibraryRow>[]=[
  {id:'title',encabezado:t('titleField'),celda:({objection:row})=><div className="min-w-0"><button type="button" className="text-left font-medium leading-5 text-fg hover:text-brand" onClick={()=>onOpen(row)}>{row.title}</button><p className="mt-0.5 max-w-lg truncate text-xs leading-4 text-fg-secondary">{row.detection_signals?.slice(0,2).join(' · ')}</p>{!row.is_active&&<span className="text-xs text-fg-secondary">{t('inactive')}</span>}</div>},
  {id:'category',encabezado:t('category'),ancho:146,celda:({objection:row})=><BadgeTono tono={row.category==='precio'?'advertencia':'neutro'} tamano="sm">{category(row.category)}</BadgeTono>},
  {id:'frequency',encabezado:t('visual.frequencyHeader'),ancho:284,celda:(row)=><div className="flex items-center gap-2.5"><div className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-subtle">{row.calls!==null&&<div className={`h-full rounded-full ${row.objection.category==='precio'?'bg-warning':'bg-brand'}`} style={{width:`${Math.min(100,row.calls/peak*100)}%`}}/>}</div><span className="min-w-[60px] shrink-0 whitespace-nowrap text-xs font-medium leading-4 tabular-nums text-fg-secondary">{row.calls===null?'—':`${format.number(row.calls)} · ${pct(row.share)}`}</span></div>},
  {id:'advanced',encabezado:t('visual.advancedHeader'),ancho:114,celda:row=><span className="text-[13px] leading-[18px] tabular-nums text-fg-secondary">{pct(row.advancedRate)}</span>},
 ];
 const card=({objection:row,calls,advancedRate}:LibraryRow)=><div className="space-y-2 p-4"><button type="button" className="font-medium text-fg" onClick={()=>onOpen(row)}>{row.title}</button><p className="text-xs text-fg-secondary">{category(row.category)} · {calls===null?'—':t('callCount',{count:calls})} · {pct(advancedRate)}</p><p className="text-sm text-fg-secondary">{row.recommended_response??t('noResponse')}</p></div>;
 return <DataTable columnas={columns} filas={rows} obtenerId={row=>row.objection.id} etiqueta={t('title')} densidad="comoda" estado={loading?'cargando':'listo'} filasEsqueleto={7} mostrarCabeceraCargando={false} altoFilaEsqueleto={48} varianteEsqueleto="figma"
  className="[&_tbody_td]:py-3" tarjetaMovil={card} acciones={({objection:row})=>[{id:'detail',etiqueta:t('detail'),icono:Eye,onSelect:()=>onOpen(row)},...(canManage?[
   {id:'edit',etiqueta:t('editTitle',{title:row.title}),icono:Pencil,onSelect:()=>onEdit(row),deshabilitada:busy===row.id},
   {id:'status',etiqueta:t(row.is_active?'deactivate':'activate',{title:row.title}),icono:Power,onSelect:()=>onToggle(row),deshabilitada:busy===row.id},
  ]:[])]}/>;
}
