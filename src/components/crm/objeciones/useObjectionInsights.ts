'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import type { ObjectionInsights } from '@/lib/services/crm/objectionInsightsService';
import { pedirCrm } from '../acciones/apiCrm';
export function useObjectionInsights(id:string|null=null){
 const [data,setData]=useState<ObjectionInsights|null>(null),[error,setError]=useState<unknown>(null),[loading,setLoading]=useState(true);
 const current=useRef<AbortController|null>(null);
 const reload=useCallback(async()=>{current.current?.abort();const controller=new AbortController();current.current=controller;setLoading(true);setError(null);
  try{const result=await pedirCrm<ObjectionInsights>(`/api/crm/objections/insights${id?`?id=${encodeURIComponent(id)}`:''}`,{signal:controller.signal});if(!controller.signal.aborted)setData(result.data);}
  catch(error){if(!controller.signal.aborted)setError(error);}
  finally{if(!controller.signal.aborted)setLoading(false);}
 },[id]);
 useEffect(()=>{setData(null);void reload();const switched=()=>{setData(null);void reload();};window.addEventListener('organization-changed',switched);return()=>{current.current?.abort();window.removeEventListener('organization-changed',switched);};},[reload]);
 return{data,error,loading,reload};
}
