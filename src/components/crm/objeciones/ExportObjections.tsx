'use client';
import {useState} from 'react';
import {useTranslations,useFormatter} from 'next-intl';
import {Download} from 'lucide-react';
import {clasesBoton} from '@/components/kit';
import {filasACsv} from '@/lib/utils/csv';
import type {LibraryRow} from './objectionLibraryModel';
export function ExportObjections({rows,disabled}:{rows:LibraryRow[];disabled:boolean}){
 const t=useTranslations('crm.objecionesNuevo'),format=useFormatter();const[error,setError]=useState(false);
 const download=()=>{setError(false);let url:string|null=null;try{
  const text=filasACsv([t('titleField'),t('category'),t('visual.frequencyHeader'),t('visual.advancedHeader')],rows.map(({objection,calls,advancedRate})=>[objection.title,t.has(`categories.${objection.category}`)?t(`categories.${objection.category}`):objection.category,calls,advancedRate===null?'':format.number(advancedRate,{style:'percent',maximumFractionDigits:0})]));
  url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='objeciones-vista.csv';document.body.appendChild(link);link.click();link.remove();
 }catch{setError(true);}finally{if(url)URL.revokeObjectURL(url);}};
 return <div><button type="button" className={clasesBoton({variante:'secundario'})} disabled={disabled||!rows.length} onClick={download}><Download className="size-4"/>{t('visual.export')}</button>{error&&<p role="alert" className="mt-1 text-xs text-danger-text">{t('visual.exportError')}</p>}</div>;
}
