'use client';
import {useEffect,useMemo,useState} from 'react';
import {useTranslations,useFormatter,useLocale} from 'next-intl';
import {TriangleAlert,Plus,RefreshCw,List,CheckCircle,XCircle} from 'lucide-react';
import {StaggerList} from '@/components/shared/motion';
import {PageHeader,EmptyState,RowActionsMenu,clasesBoton} from '@/components/kit';
import type {AccionFila} from '@/components/kit/acciones';
import {useSoftphone} from '@/components/voice';
import type {Objection} from '@/lib/services/crm/objectionService';
import {EMPTY_FILTERS,filterObjections,type ObjectionFilters} from '@/lib/services/crm/objectionModel';
import {ObjectionEditor} from './ObjectionEditor';
import {ObjectionDetail} from './ObjectionDetail';
import {LiveObjectionContext} from './LiveObjectionContext';
import {useObjections} from './useObjections';
import {useObjectionInsights} from './useObjectionInsights';
import {libraryRows,orderLibraryRows,type ObjectionOrder} from './objectionLibraryModel';
import {ObjectionStats} from './ObjectionStats';
import {ObjectionLibrary} from './ObjectionLibrary';
import {ExportObjections} from './ExportObjections';
import {ObjectionLibraryToolbar} from './ObjectionLibraryToolbar';

export function ObjecionesPage(){
 const t=useTranslations('crm.objecionesNuevo'),format=useFormatter(),locale=useLocale();
 const{objections,loading,error,reload,save,toggle,canManage}=useObjections(),insights=useObjectionInsights(),phone=useSoftphone();
 const[filters,setFilters]=useState<ObjectionFilters>(EMPTY_FILTERS),[order,setOrder]=useState<ObjectionOrder>('frequency');
 const[editor,setEditor]=useState<{row:Objection|null;initialTitle?:string}|null>(null),[detail,setDetail]=useState<Objection|null>(null);
 const[busy,setBusy]=useState<string|null>(null),[actionError,setActionError]=useState(false);
 const availableInsights=!insights.loading&&!insights.error?insights.data:null;
 const allRows=useMemo(()=>libraryRows(objections,availableInsights),[objections,availableInsights]);
 const shown=useMemo(()=>{const ids=new Set(filterObjections(objections,filters).map(row=>row.id));return orderLibraryRows(allRows.filter(row=>ids.has(row.objection.id)),order,locale);},[allRows,objections,filters,order,locale]);
 const inCall=phone.available&&phone.callStatus==='connected';
 const onToggle=async(row:Objection)=>{setBusy(row.id);setActionError(false);try{await toggle(row);}catch{setActionError(true);}finally{setBusy(null);}};
 useEffect(()=>{const switched=()=>{setEditor(null);setDetail(null);setBusy(null);setActionError(false);};window.addEventListener('organization-changed',switched);return()=>window.removeEventListener('organization-changed',switched);},[]);
 const currentDetail=detail&&objections.find(row=>row.id===detail.id);
 if(currentDetail&&!loading&&!error)return <>
  <ObjectionDetail key={currentDetail.id} canManage={canManage} objection={currentDetail} busy={busy===currentDetail.id}
   onClose={()=>setDetail(null)} onEdit={row=>setEditor({row})} onSave={save} onToggle={()=>onToggle(currentDetail)} metrics={allRows.find(row=>row.objection.id===currentDetail.id)}/>
  {actionError&&<p role="alert" className="mx-4 text-sm text-danger-text lg:mx-6">{t('actionError')}</p>}
  <ObjectionEditor open={!!editor} row={editor?.row??null} onClose={()=>setEditor(null)} onSave={save}/>
 </>;
 const newButton=<button type="button" className={clasesBoton({variante:'primario'})} disabled={!canManage||loading||!!error} onClick={()=>setEditor({row:null})}><Plus className="size-4"/>{t('new')}</button>;
 const menu:AccionFila[]=[
  {id:'refresh',etiqueta:t('refresh'),icono:RefreshCw,onSelect:()=>{void reload();void insights.reload();}},
  {id:'all',etiqueta:t('allStates'),icono:List,onSelect:()=>setFilters({...filters,status:'all'})},
  {id:'active',etiqueta:t('active'),icono:CheckCircle,onSelect:()=>setFilters({...filters,status:'active'})},
  {id:'inactive',etiqueta:t('inactive'),icono:XCircle,onSelect:()=>setFilters({...filters,status:'inactive'})},
 ];
 return <div className="p-4 lg:p-6">
  <PageHeader titulo={t('title')} subtitulo={t('subtitle')} icono={TriangleAlert} cargando={loading}
   migas={[{etiqueta:'CRM',href:'/app/crm'},{etiqueta:t('title')}]}
   movil={{accion:<RowActionsMenu titulo={t('title')} acciones={[
    {id:'new',etiqueta:t('new'),icono:Plus,onSelect:()=>setEditor({row:null}),deshabilitada:!canManage||loading||!!error},...menu,
   ]}/>}}
   acciones={<div className="flex gap-2">
    <ExportObjections rows={shown} disabled={loading||!!error||insights.loading||!!insights.error}/>
    {newButton}
    <RowActionsMenu titulo={t('title')} acciones={menu} orientacion="horizontal" tamano="md"/>
   </div>}/>
  <div className={inCall?'lg:mt-4':'hidden'}><LiveObjectionContext objections={objections}/></div>
  <div className={inCall?'hidden space-y-4 lg:mt-4 lg:block':'space-y-4 lg:mt-4'}>
   {error?<EmptyState variante="error" onReintentar={()=>void reload()}/>:<>
    <StaggerList><ObjectionStats rows={allRows} insights={availableInsights} loading={loading||insights.loading}/></StaggerList>
    <ObjectionLibraryToolbar filters={filters} onFiltersChange={setFilters} order={order} onOrderChange={setOrder} rows={shown}
     exportDisabled={loading||!!error||insights.loading||!!insights.error}/>
    {insights.error&&<p role="alert" className="text-sm text-warning-text">{t('frequencyUnavailable')} <button type="button" className="underline" onClick={()=>void insights.reload()}>{t('retry')}</button></p>}
    {actionError&&<p role="alert" className="text-sm text-danger-text">{t('actionError')}</p>}
    {loading?<div aria-busy="true" aria-label={t('loading')}><ObjectionLibrary rows={[]} canManage={false} busy={null} onOpen={()=>{}} onEdit={()=>{}} onToggle={()=>{}} onClear={()=>{}} filtered={false} loading/></div>:
     <ObjectionLibrary rows={shown} canManage={canManage} busy={busy} onOpen={setDetail} onEdit={row=>setEditor({row})} onToggle={row=>void onToggle(row)}
      onClear={()=>setFilters(EMPTY_FILTERS)} filtered={!!objections.length} query={filters.query}
      onCreate={canManage?()=>setEditor({row:null,initialTitle:filters.query.trim()}):undefined}/>}
    {!loading&&<p className="text-xs text-fg-secondary" aria-live="polite">{t('resultCount',{count:shown.length,total:format.number(objections.length)})}</p>}
   </>}
  </div>
  <ObjectionEditor open={!!editor} row={editor?.row??null} initialTitle={editor?.initialTitle} onClose={()=>setEditor(null)} onSave={save}/>
 </div>;
}
