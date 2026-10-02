'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Users,MapPin,Shuffle,ChartNoAxesCombined } from 'lucide-react';
import { PageHeader,SegmentedControl,EmptyState } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorApiCrm } from '../acciones/apiCrm';
import { useEquipo } from './useEquipo';
import { EquiposTab } from './tabs/EquiposTab';
import { TerritoriosTab } from './tabs/TerritoriosTab';
import { AsignarTab } from './tabs/AsignarTab';
import { PerformanceTab } from './tabs/PerformanceTab';
type Tab='equipos'|'territorios'|'asignar'|'performance';
export function EquipoPage() {
 const t=useTranslations('crm.equipoNuevo');const [tab,setTab]=useState<Tab>('equipos');
 const {data,error,loading,reload}=useEquipo();
 return <div className="space-y-5 p-4 lg:p-6">
  <PageHeader titulo={t('title')} subtitulo={t('subtitle')} icono={Users} cargando={loading}
   debajo={<div className="w-full min-w-0 overflow-x-auto lg:w-auto"><SegmentedControl valor={tab} onValorChange={setTab} etiqueta={t('views')} opciones={[
    {valor:'equipos',etiqueta:t('teams'),icono:Users},{valor:'territorios',etiqueta:t('territories'),icono:MapPin},
    {valor:'asignar',etiqueta:t('assignment'),icono:Shuffle},{valor:'performance',etiqueta:t('performance'),icono:ChartNoAxesCombined},
   ]}/></div>}/>
  {loading?<div aria-busy="true" aria-label={t('loading')} className="grid gap-4 lg:grid-cols-[280px_1fr]"><Skeleton className="h-60"/><Skeleton className="h-60"/></div>:
   error?<EmptyState variante={error instanceof ErrorApiCrm&&error.status===403?'forbidden':'error'} onReintentar={()=>void reload()}/>:
   data?<>
    {tab==='equipos'&&<EquiposTab data={data} onSaved={reload}/>}
    {tab==='territorios'&&<TerritoriosTab data={data} onSaved={reload}/>}
    {tab==='asignar'&&<AsignarTab data={data} onSaved={reload}/>}
    {tab==='performance'&&<PerformanceTab data={data}/>}
   </>:null}
 </div>;
}
