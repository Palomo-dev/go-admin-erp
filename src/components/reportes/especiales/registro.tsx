'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { ComponenteReporte } from '@/lib/services/reportes/types';

function Cargando() {
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-4" aria-busy>
      {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
    </div>
  );
}

// next/dynamic exige que las opciones sean un objeto literal en cada llamada:
// una variable compartida rompe `next build` («options must be an object literal»).

/**
 * Componente propio de cada informe que el visor no pinta con la tabla
 * genérica. Son los mismos componentes que antes vivían en Finanzas: dentro
 * del visor (`ProveedorVisorInforme`) ocultan su encabezado y toman el periodo
 * de la barra de filtros. El cálculo no cambia: cada uno sigue llamando su
 * servicio o su RPC.
 */
export const COMPONENTES_REPORTE: Record<ComponenteReporte, ComponentType> = {
  'estado-resultados': dynamic(() => import('@/components/finanzas/contabilidad/estado-resultados/EstadoResultadosPage').then((m) => m.EstadoResultadosPage), { loading: Cargando }),
  'balance-general': dynamic(() => import('@/components/finanzas/contabilidad/balance-general/BalanceGeneralPage').then((m) => m.BalanceGeneralPage), { loading: Cargando }),
  'flujo-efectivo': dynamic(() => import('@/components/finanzas/contabilidad/estados/FlujoEfectivoPage').then((m) => m.FlujoEfectivoPage), { loading: Cargando }),
  'cambios-patrimonio': dynamic(() => import('@/components/finanzas/contabilidad/estados/CambiosPatrimonioPage').then((m) => m.CambiosPatrimonioPage), { loading: Cargando }),
  notas: dynamic(() => import('@/components/finanzas/contabilidad/estados/NotasEstadosPage').then((m) => m.NotasEstadosPage), { loading: Cargando }),
  certificacion: dynamic(() => import('@/components/finanzas/contabilidad/estados/CertificacionPage').then((m) => m.CertificacionPage), { loading: Cargando }),
  indicadores: dynamic(() => import('@/components/finanzas/contabilidad/estados/IndicadoresPage').then((m) => m.IndicadoresPage), { loading: Cargando }),
  libros: dynamic(() => import('@/components/finanzas/contabilidad/estados/LibrosContablesPage').then((m) => m.LibrosContablesPage), { loading: Cargando }),
  'mayor-contable': dynamic(() => import('@/components/finanzas/contabilidad/mayor-contable/MayorContablePage').then((m) => m.MayorContablePage), { loading: Cargando }),
  'libro-diario': dynamic(() => import('@/components/finanzas/contabilidad/libro-diario/LibroDiarioPage').then((m) => m.LibroDiarioPage), { loading: Cargando }),
  'auxiliar-tercero': dynamic(() => import('@/components/finanzas/contabilidad/auxiliar-tercero/AuxiliarTerceroPage').then((m) => m.AuxiliarTerceroPage), { loading: Cargando }),
};
