'use client';

/**
 * Sección «Mi panel de ventas» de /app/inicio (F13): cuota vigente,
 * comisiones del mes, ranking (solo si el servidor lo envía) y mi pipeline.
 *
 * NO está cableada en `src/app/app/inicio/page.tsx` (WIP del dueño). Para
 * montarla, el dueño añade en `page.tsx`:
 *   import SellerSection from '@/components/inicio/sections/SellerSection';
 *   …y dentro del JSX, donde quiera la sección:  <SellerSection />
 */

import { RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useOrgCurrency } from '@/lib/hooks/useOrgCurrency';
import { CommissionsWidget, MyPipelineWidget, QuotaProgressWidget, SellerLeaderboardWidget, useSellerDashboard } from '../widgets';

export default function SellerSection() {
  const { data, loading, error, reload } = useSellerDashboard();
  const orgCurrency = useOrgCurrency();
  const currency = data?.currency || orgCurrency;

  return (
    <section id="mi-panel" aria-labelledby="seller-section-title" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="seller-section-title" className="text-base font-semibold text-gray-900 dark:text-white">
          Mi panel de ventas
        </h2>
        <Button variant="ghost" size="sm" onClick={() => reload()} disabled={loading} aria-label="Actualizar mi panel" className="h-8">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>No se pudo cargar tu panel</AlertTitle>
          <AlertDescription>
            {error}{' '}
            <button type="button" onClick={() => reload()} className="underline">Reintentar</button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <QuotaProgressWidget quota={data?.quota} currency={currency} loading={loading && !data} error={error} index={0} />
        <CommissionsWidget commissions={data?.commissions} others={data?.commissions_others} currency={currency} loading={loading && !data} error={error} index={1} />
        <SellerLeaderboardWidget leaderboard={data?.leaderboard} currency={currency} loading={loading && !data} error={error} index={2} />
        <MyPipelineWidget opportunities={data?.opportunities} tasks={data?.tasks_today} currency={currency} loading={loading && !data} error={error} index={3} />
      </div>
    </section>
  );
}
