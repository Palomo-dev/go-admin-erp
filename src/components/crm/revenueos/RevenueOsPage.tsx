'use client';

/**
 * /app/crm/pronostico — panel Revenue OS (FASE 14, brief UX §1–§5).
 *
 * Cinco pestañas sobre una sola carga (`/api/crm/revenue/dashboard`):
 * Resumen (KPIs + tendencia), Embudo, Forecast (el pronóstico existente de
 * `pronostico/*` + escenarios), Cohortes y Matemática comercial. Toda la
 * lógica vive en `revenueOsService` y sus módulos puros; aquí solo hay
 * presentación. El rango por defecto lo decide el servidor en la zona
 * horaria de la organización.
 *
 * Ronda 2: la moneda sale de `dashboard.currency` (moneda base de la
 * organización; sin ella se avisa y las cifras van sin símbolo); los nombres
 * de pipeline de `dashboard.pipeline_names`; y cuando una recarga falla el
 * panel anterior se VACÍA (queda el error y el control de rango): no se deja
 * a la vista una cifra que ya no corresponde a lo pedido.
 */

import { useState } from 'react';
import { MotionConfig } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadErrorState } from '@/components/common/LoadErrorState';
import { ForecastDashboard } from '@/components/crm/pronostico';
import { useRevenueDashboard, type DashboardRange } from './useRevenueDashboard';
import { RevenueRangeControl } from './RevenueRangeControl';
import { KpiTiles } from './KpiTiles';
import { RevenueTrendChart } from './RevenueTrendChart';
import { FunnelPanel } from './FunnelPanel';
import { CohortTable } from './CohortTable';
import { RevenueMathPanel } from './RevenueMathPanel';
import { fmtMonth, SIN_MONEDA } from './formatters';
import { addMonthsPlain } from '@/lib/services/crm/revenueOs/dateRange';

const TABS = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'embudo', label: 'Embudo' },
  { value: 'forecast', label: 'Forecast' },
  { value: 'cohortes', label: 'Cohortes' },
  { value: 'matematica', label: 'Matemática comercial' },
] as const;

function PanelSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando panel">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

const PANEL = 'mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800';

export function RevenueOsPage() {
  const [range, setRange] = useState<DashboardRange>({ start: null, end: null });
  const { data, lastPeriod, canEditInputs, loading, error, reload } = useRevenueDashboard(range);
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('resumen');
  // Con error el hook vacía `data`: el panel anterior no se pinta (sus cifras no corresponden a lo pedido).

  const currency = data?.currency ?? null;
  const periodLabel = data
    ? `${fmtMonth(data.period.start)} – ${fmtMonth(addMonthsPlain(data.period.end, -1))} · zona ${data.period.timezone}`
    : null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen space-y-4 bg-gray-50 p-3 dark:bg-gray-900 sm:p-4 md:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">Revenue OS</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Pronóstico, embudo, cohortes y matemática comercial de la organización.
              {periodLabel && (
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  Periodo: {periodLabel}
                  {currency ? ` · moneda ${currency}` : ''}
                </span>
              )}
            </p>
            {data && !currency && (
              <p role="note" className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                {SIN_MONEDA}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <RevenueRangeControl
              key={lastPeriod ? `${lastPeriod.start}-${lastPeriod.end}` : 'init'}
              current={lastPeriod}
              onApply={(r) => setRange(r)}
              disabled={loading}
            />
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void reload()} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Actualizar
            </Button>
          </div>
        </header>

        {error && (
          <LoadErrorState title="No se pudo cargar el panel Revenue OS" message={error} onRetry={() => void reload()} isRetrying={loading} />
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1" aria-label="Secciones de Revenue OS">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="text-xs sm:text-sm">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="resumen" className="mt-4 space-y-4">
            {!data && loading && !error ? (
              <PanelSkeleton />
            ) : data ? (
              <>
                <KpiTiles summary={data.summary} funnel={data.pipeline_funnel} currency={currency} />
                <RevenueTrendChart rows={data.revenue_metrics} currency={currency} />
              </>
            ) : null}
          </TabsContent>

          <TabsContent value="embudo" className={PANEL}>
            {!data && loading && !error ? (
              <Skeleton className="h-64 w-full" />
            ) : data ? (
              <FunnelPanel funnel={data.pipeline_funnel} pipelineNames={data.pipeline_names} currency={currency} />
            ) : null}
          </TabsContent>

          <TabsContent value="forecast" className="mt-4">
            {data ? <ForecastDashboard currency={currency} /> : null}
          </TabsContent>

          <TabsContent value="cohortes" className={PANEL}>
            {!data && loading && !error ? (
              <Skeleton className="h-48 w-full" />
            ) : data ? (
              <CohortTable rows={data.cohort_retention} today={data.period.today} />
            ) : null}
          </TabsContent>

          <TabsContent value="matematica" className="mt-4">
            {!data && loading && !error ? (
              <Skeleton className="h-64 w-full" />
            ) : data ? (
              <RevenueMathPanel
                key={data.inputs.updated_at ?? 'none'}
                math={data.math}
                inputs={data.inputs}
                canEdit={canEditInputs}
                onSaved={() => void reload()}
                currency={currency}
              />
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </MotionConfig>
  );
}
