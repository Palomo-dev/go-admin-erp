'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useTranslations} from 'next-intl';
import {Phone,Copy} from 'lucide-react';
import {SearchInput,EmptyState,clasesBoton,BadgeTono} from '@/components/kit';
import {useSoftphone} from '@/components/voice';
import {CallLinkPanel} from '@/components/voice/CallLinkPanel';
import type {Objection} from '@/lib/services/crm/objectionService';
import {filterObjections,EMPTY_FILTERS} from '@/lib/services/crm/objectionModel';
import {pedirCrm} from '../acciones/apiCrm';

export function LiveObjectionContext({objections}:{objections:Objection[]}){
 const sp=useSoftphone(),t=useTranslations('crm.objecionesNuevo');
 const active=sp.available&&sp.callStatus==='connected'?sp.activeCall:null,callId=sp.available?sp.activeCallId:null;
 const callSid=active?.callSid,connected=!!active;
 const[now,setNow]=useState(Date.now()),[linked,setLinked]=useState<string|null>(null);
 const[query,setQuery]=useState(''),[selected,setSelected]=useState<string|null>(null);
 const[state,setState]=useState<'idle'|'saving'|'done'|'error'>('idle');
 const revision=useRef(0),organizationEpoch=useRef(0),mounted=useRef(true),pending=useRef(new Set<string>());
 const[,refreshPending]=useState(0);
 const candidates=useMemo(()=>filterObjections(objections.filter(row=>row.is_active),{...EMPTY_FILTERS,query}),[objections,query]);
 const row=candidates.find(row=>row.id===selected)??candidates[0]??null;
 const call=callId??callSid??'',opportunity=linked??active?.opportunityId;
 const intention=`${organizationEpoch.current}/${call}/${opportunity??''}/${row?.id??''}`;
 const currentIntention=useRef(intention),currentCall=useRef(call);currentIntention.current=intention;currentCall.current=call;
 useEffect(()=>{revision.current++;setState('idle');},[intention]);
 useEffect(()=>{mounted.current=true;const switched=()=>{organizationEpoch.current++;revision.current++;setLinked(null);setState('idle');setQuery('');setSelected(null);};window.addEventListener('organization-changed',switched);return()=>{mounted.current=false;window.removeEventListener('organization-changed',switched);};},[]);
 useEffect(()=>{revision.current++;setLinked(null);setState('idle');setQuery('');setSelected(null);if(!connected)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[callSid,callId,connected]);
 if(!active)return null;
 const elapsed=Math.max(0,Math.floor((now-(active.connectedAt??now))/1000));
 const reloadLink=async()=>{if(!callId)return;const epoch=organizationEpoch.current,callAtStart=call;const current=()=>mounted.current&&epoch===organizationEpoch.current&&callAtStart===currentCall.current;try{const result=await pedirCrm<{opportunity_id:string|null}>(`/api/crm/calls/${callId}`);if(current()){revision.current++;setLinked(result.data.opportunity_id);setState('idle');}}catch{if(current())setState('error');}};
 const register=async()=>{
  if(!opportunity||!row||pending.current.has(intention)||state==='done')return;
  const requested=intention,version=revision.current,epoch=organizationEpoch.current;
  const current=()=>mounted.current&&version===revision.current&&epoch===organizationEpoch.current&&requested===currentIntention.current;
  pending.current.add(requested);setState('saving');
  try{await pedirCrm(`/api/crm/objections/opportunity/${opportunity}`,{method:'POST',cuerpo:{objection_id:row.id}});if(current())setState('done');}
  catch{if(current())setState('error');}
  finally{pending.current.delete(requested);if(mounted.current)refreshPending(value=>value+1);}
 };
 const copy=async()=>{if(!row?.recommended_response)return;try{await navigator.clipboard.writeText(row.recommended_response);}catch{setState('error');}};
 const select=(id:string|null)=>{revision.current++;setSelected(id);setState('idle');};
 const search=(value:string)=>{setQuery(value);select(null);};
 const category=row?(row.category?(t.has(`categories.${row.category}`)?t(`categories.${row.category}`):row.category):t('noCategory')):null;
 return <section className="space-y-3 lg:rounded-xl lg:border lg:border-line-brand lg:bg-brand-tint lg:p-4">
  <p className="flex items-center gap-2 rounded-lg bg-brand-tint px-3 py-2 text-xs text-brand-deep"><Phone className="size-4"/>
   {t('inCall',{name:active.displayName??active.number,time:`${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`})}
  </p>
  <SearchInput value={query} onChange={search} onValueChange={search} etiqueta={t('quickConsult')} placeholder={t('searchHint')} tamano="sm" pistaAtajo={false}/>
  {row?<article className="rounded-xl border border-line bg-surface p-3">
   <div className="flex items-start justify-between gap-2"><h2 className="text-sm font-medium leading-5 text-fg">{row.title}</h2><BadgeTono tono={row.category==='precio'?'advertencia':'neutro'} tamano="sm">{category}</BadgeTono></div>
   <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[18px] text-fg">{row.recommended_response??t('noResponse')}</p>
   <div className="mt-2 flex flex-wrap gap-2"><button type="button" className={clasesBoton({variante:'secundario',tamano:'sm',patron:'button'})} disabled={!row.recommended_response} onClick={()=>void copy()}><Copy className="size-4"/>{t('copy')}</button>
    <button type="button" className={clasesBoton({variante:'primario',tamano:'sm',patron:'button'})} disabled={!opportunity||pending.current.has(intention)||state==='done'} onClick={()=>void register()}>{t(state==='done'?'registered':'register')}</button>
   </div>
  </article>:<EmptyState compacto titulo={t('noResults')} descripcion={t('noResultsHint')} accion={query?{etiqueta:t('clearFilters'),onClick:()=>search('')}:undefined}/>}
  {candidates.filter(candidate=>candidate.id!==row?.id).slice(0,6).map(candidate=><button key={candidate.id} type="button" onClick={()=>select(candidate.id)}
   className="block w-full rounded-xl border border-line bg-surface p-3 text-left hover:bg-subtle"><span className="block text-sm font-medium leading-5 text-fg">{candidate.title}</span><span className="mt-2 block line-clamp-3 text-[13px] leading-[18px] text-fg-secondary">{candidate.recommended_response??t('noResponse')}</span></button>)}
  {!opportunity&&<><p className="text-xs text-fg-secondary">{t('linkOpportunity')}</p>{callId&&<CallLinkPanel callId={callId} customerId={active.customerId} opportunityId={null} phoneNumber={active.number} customerName={active.displayName} onLinked={()=>void reloadLink()}/>}</>}
  {state==='error'&&<p role="alert" className="text-sm text-danger">{t('actionError')}</p>}
 </section>;
}
