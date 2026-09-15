'use client';

import { useState, useEffect, useCallback } from 'react';
import { HeartPulse } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { healthScoreService } from '@/lib/services/crm/healthScoreService';
import type { HealthScoreResult, HealthSnapshot } from '@/lib/services/crm/healthScoreService';
import { HealthGauge } from './HealthGauge';
import { HealthTrend } from './HealthTrend';
import { HealthAlerts } from './HealthAlerts';
import { HealthDimensions } from './HealthDimensions';

/**
 * Tarjeta de salud en la ficha del cliente (F11): gauge + alertas +
 * dimensiones configurables + tendencia, sobre `fn_customer_health` con la
 * config de la organización (mismo cálculo que /app/crm/salud).
 */
interface ClientHealthCardProps {
  customerId: string;
  customerName: string;
  /** `customers.lifecycle_stage`: la RPC solo mide `customer`; un lead con facturas recibe un mensaje verdadero. */
  lifecycleStage?: string | null;
}

/** Texto honesto cuando no hay score (F11 r2): la salud se mide solo para clientes. */
export function noHealthMessage(input: { customerName: string; lifecycleStage: string | null | undefined; invoices: number }): string {
  const stage = input.lifecycleStage ?? null;
  if (stage && stage !== 'customer') {
    const n = input.invoices;
    const facturas = n === 1 ? '1 factura' : `${n} facturas`;
    const etapa = stage === 'lead' ? 'un lead' : stage === 'prospect' ? 'un prospecto' : `«${stage}»`;
    return n > 0
      ? `La salud se mide solo para clientes; esta ficha es ${etapa} con ${facturas}. Cámbialo a cliente para medirlo.`
      : `La salud se mide solo para clientes; esta ficha es ${etapa} sin facturas.`;
  }
  return `Sin datos de salud para ${input.customerName}: aún no tiene facturas ni actividad medibles.`;
}

export function ClientHealthCard({ customerId, customerName, lifecycleStage }: ClientHealthCardProps) {
  const [score, setScore] = useState<HealthScoreResult | null>(null);
  const [history, setHistory] = useState<HealthSnapshot[]>([]);
  const [invoices, setInvoices] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [scoreData, historyData] = await Promise.all([
        healthScoreService.getCustomerHealthScore(customerId),
        healthScoreService.getHealthHistory(customerId, 20),
      ]);
      setScore(scoreData);
      setHistory(historyData);
      if (!scoreData && lifecycleStage && lifecycleStage !== 'customer') setInvoices(await healthScoreService.countInvoices(customerId));
    } catch (err) {
      console.error('Error cargando health card:', err);
    } finally {
      setLoading(false);
    }
  }, [customerId, lifecycleStage]);

  useEffect(() => { void loadData(); }, [loadData]);

  if (loading) {
    return (
      <Card className="p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700" aria-busy="true">
        <Skeleton className="h-5 w-32 mb-3" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-[88px] w-[88px] rounded-full" />
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
        </div>
      </Card>
    );
  }

  if (!score) {
    return (
      <Card className="p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-gray-500" aria-hidden="true" />
          <p className="text-xs text-gray-600 dark:text-gray-400">{noHealthMessage({ customerName, lifecycleStage, invoices })}</p>
        </div>
      </Card>
    );
  }

  const topAlerts = (score.alerts ?? []).slice(0, 3);

  return (
    <Card className="p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate flex items-center gap-1.5">
          <HeartPulse className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />
          Salud del cliente
        </h3>
      </div>

      <div className="flex items-start gap-4">
        <HealthGauge score={score.score} band={score.band} size="md" />
        <div className="flex-1 min-w-0">
          <HealthAlerts alerts={topAlerts} />
        </div>
      </div>

      {score.indicators.length > 0 && (
        <div className="mt-3">
          <HealthDimensions indicators={score.indicators.slice(0, 4)} />
        </div>
      )}

      <div className="mt-3">
        <HealthTrend snapshots={history} band={score.band} />
      </div>
    </Card>
  );
}

export default ClientHealthCard;
