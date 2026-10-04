'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { readEquipo } from './apiEquipo';
import type { TeamManagementData } from '@/lib/services/crm/teamManagementModel';
import { EVENTO_CAMBIO_CRM } from '../acciones/apiCrm';
export function useEquipo() {
 const [data,setData]=useState<TeamManagementData|null>(null),[error,setError]=useState<unknown>(null),[loading,setLoading]=useState(true);
 const pending=useRef<AbortController|null>(null);
 const reload=useCallback(async()=>{
  pending.current?.abort();const controller=new AbortController();pending.current=controller;
  setLoading(true);setError(null);
  try{const result=await readEquipo(controller.signal);if(!controller.signal.aborted)setData(result);}
  catch(cause){if(!controller.signal.aborted){setError(cause);setData(null);}}
  finally{if(!controller.signal.aborted)setLoading(false);}
 },[]);
 useEffect(()=>{
  void reload();const refresh=()=>{setData(null);void reload();};
  window.addEventListener('organization-changed',refresh);window.addEventListener(EVENTO_CAMBIO_CRM,refresh);
  return()=>{pending.current?.abort();window.removeEventListener('organization-changed',refresh);window.removeEventListener(EVENTO_CAMBIO_CRM,refresh);};
 },[reload]);
 return {data,error,loading,reload};
}
