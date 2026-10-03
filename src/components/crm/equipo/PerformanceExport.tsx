'use client';
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {Download} from 'lucide-react';
import {clasesBoton} from '@/components/kit';
import {filasACsv} from '@/lib/utils/csv';
import type {TeamPerformance} from '@/lib/services/crm/teamManagementModel';
export function PerformanceExport({rows,start,end}:{rows:TeamPerformance[];start:string;end:string}){
 const t=useTranslations('crm.equipoNuevo'),[error,setError]=useState(false);
 const download=()=>{let url:string|null=null;setError(false);try{
  const csv=filasACsv([t('person'),t('won'),t('visual.currency'),t('quota'),t('calls'),t('meetings'),t('conversion'),t('cycle')],rows.map(row=>[row.name,row.money_missing?null:row.won,row.currency,row.quota_pct,row.calls,row.meetings,row.conversion,row.cycle_days]));
  url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`equipo-${start}-${end}.csv`;document.body.appendChild(link);link.click();link.remove();
 }catch{setError(true);}finally{if(url)URL.revokeObjectURL(url);}};
 return <div><button type="button" className={clasesBoton({variante:'secundario',patron:'button'})} disabled={!rows.length} onClick={download}><Download className="size-4" aria-hidden/>{t('visual.export')}</button>{error&&<p role="alert" className="mt-1 text-xs text-danger-text">{t('visual.exportError')}</p>}</div>;
}
