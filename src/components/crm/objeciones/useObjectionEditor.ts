'use client';
import {useEffect,useState} from 'react';
import {useTranslations} from 'next-intl';
import type {Objection,ObjectionInput} from '@/lib/services/crm/objectionService';
import {objectionToForm,formToPayload,validateForm} from '@/lib/services/crm/objectionModel';

export function useObjectionEditor({open,row,onSave,onSaved}:{
  open:boolean;row:Objection|null;onSave:(data:ObjectionInput,id?:string)=>Promise<unknown>;onSaved:()=>void;
}) {
  const t=useTranslations('crm.objecionesNuevo');
  const [form,setForm]=useState(()=>objectionToForm(row));
  const [saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null);
  useEffect(()=>{if(open){setForm(objectionToForm(row));setError(null);}},[open,row]);
  const submit=async()=>{
    if(saving)return;
    const problems=validateForm(form);
    if(problems.length){setError(t(problems[0].field==='title'?'invalidTitle':'invalidCategory'));document.getElementById(`objection-${problems[0].field}`)?.focus();return;}
    setSaving(true);setError(null);
    try{await onSave(formToPayload(form),row?.id);onSaved();}
    catch{setError(t('saveError'));}
    finally{setSaving(false);}
  };
  const appendResponse=(text:string)=>{
    const response=text.trim();if(!response||form.recommended_response.includes(response))return false;
    const next=[form.recommended_response.trim(),response].filter(Boolean).join('\n\n');
    if(next.length>5000){setError(t('saveError'));return false;}
    setForm({...form,recommended_response:next});return true;
  };
  const dirty=JSON.stringify(form)!==JSON.stringify(objectionToForm(row));
  return{form,setForm,saving,error,submit,appendResponse,dirty};
}
