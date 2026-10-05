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
import type { CabeceraEquipo } from './cabeceraEquipo';
type Tab='equipos'|'territorios'|'asignar'|'performance';
export function EquipoPage() {
 const t=useTranslations('crm.equipoNuevo');const [tab,setTab]=useState<Tab>('equipos');
 const {data,error,loading,reload}=useEquipo();
 const icono={equipos:Users,territorios:MapPin,asignar:Shuffle,performance:ChartNoAxesCombined}[tab];
 const subtitulo={equipos:'teamsSubtitle',territorios:'territoriesSubtitle',asignar:'assignmentSubtitle',performance:'performanceSubtitle'}[tab];
 const cabecera:CabeceraEquipo=(acciones,accionMovil)=><PageHeader titulo={t(tab==='performance'?'visual.performanceTitle':'title')} subtitulo={t(`visual.${subtitulo}`)} icono={icono} cargando={loading}
  migas={[{etiqueta:'CRM',href:'/app/crm'},{etiqueta:t('title')}]}
  acciones={acciones} movil={{accion:accionMovil,...(tab==='performance'?{titulo:t('visual.personalTitle'),subtitulo:''}:{})}}
  volverA={tab==='performance'?'/app/crm/equipo':undefined} onVolver={tab==='performance'?()=>setTab('equipos'):undefined}
  debajo={tab==='performance'?undefined:<div className={`w-full min-w-0 overflow-x-auto lg:w-auto`}><SegmentedControl valor={tab} onValorChange={setTab} etiqueta={t('views')} opciones={[
   {valor:'equipos',etiqueta:t('teams')},{valor:'territorios',etiqueta:t('territories')},
   {valor:'asignar',etiqueta:t('assignment')},{valor:'performance',etiqueta:t('performance')},
  ]}/></div>}/>;
 return <div className="space-y-4 p-4 lg:p-6">
  {loading?<>{cabecera()}<div aria-busy="true" aria-label={t('loading')} className="grid gap-4 lg:grid-cols-[300px_1fr]"><Skeleton className="h-60"/><Skeleton className="h-60"/></div></>:
   error?<>{cabecera()}<EmptyState variante={error instanceof ErrorApiCrm&&error.status===403?'forbidden':'error'} onReintentar={()=>void reload()}/></>:
   data?<>
    {tab==='equipos'&&<EquiposTab data={data} onSaved={reload} cabecera={cabecera}/>}
    {tab==='territorios'&&<TerritoriosTab data={data} onSaved={reload} cabecera={cabecera}/>}
    {tab==='asignar'&&<AsignarTab data={data} onSaved={reload} cabecera={cabecera}/>}
    {tab==='performance'&&<PerformanceTab data={data} cabecera={cabecera}/>}
   </>:null}
 </div>;
}
