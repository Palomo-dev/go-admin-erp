'use client';

/**
 * /app/crm/pronostico — Pronóstico del trimestre por categorías (Figma CRM
 * 1431:19 y siguientes; ver `PronosticoPantalla`). El antiguo panel Revenue
 * OS (resumen, embudo, forecast por pipeline, cohortes y matemática comercial)
 * ya no es una página del CRM: son reportes del módulo Reportes (grupo
 * «Clientes y CRM», `reportes/modulos/crmIngresosReports.ts`), enlazados desde
 * «⋯ › Ver en Reportes» de la cabecera.
 */

import { Suspense } from 'react';
import { PronosticoPantalla } from '@/components/crm/pronostico/trimestre/PronosticoPantalla';

// El vendedor y la vista viven en la URL (useSearchParams necesita Suspense).
export default function PronosticoPage() {
  return (
    <Suspense fallback={null}>
      <PronosticoPantalla />
    </Suspense>
  );
}
