'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, HeartPulse, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from '@/components/ui/use-toast';
import { healthScoreService } from '@/lib/services/crm/healthScoreService';
import type { HealthScoreResult, HealthSnapshot } from '@/lib/services/crm/healthScoreService';
import { HealthGauge } from './HealthGauge';
import { HealthTrend } from './HealthTrend';
import { HealthAlerts } from './HealthAlerts';
import { HealthDimensions } from './HealthDimensions';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';

/**
 * Detalle de salud de un cliente (F11): gauge + alertas + dimensiones
 * configurables + tendencia. Lee por el servicio existente (RPC con RLS);
 * «Medir ahora» (r2) va por `POST /api/crm/health/[id]/snapshot` con sesión:
 * mismo score que la lista y el cron; el punto de tendencia solo se añade si
 * cambió el score o venció el intervalo.
 */
export interface HealthDetailDrawerProps {
  customerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HealthDetailDrawer({ customerId, open, onOpenChange }: HealthDetailDrawerProps) {
  // Sheet de Radix abierto por estado, sin SheetTrigger: sin esto el foco cae al body al cerrar.
  const onCloseAutoFocus = useReturnFocus(open);
  const [score, setScore] = useState<HealthScoreResult | null>(null);
  const [history, setHistory] = useState<HealthSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (id: string) => {
    const [scoreData, historyData] = await Promise.all([
      healthScoreService.getCustomerHealthScore(id),
      healthScoreService.getHealthHistory(id, 20),
    ]);
    setScore(scoreData);
    setHistory(historyData);
  }, []);

  useEffect(() => {
    if (!customerId || !open) return;
    let cancelled = false;
    setLoading(true);
    load(customerId)
      .catch((err) => console.error('Error cargando detalle de salud:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [customerId, open, load]);

  const handleSnapshot = async () => {
    if (!customerId) return;
    setSaving(true);
    try {
      const r = await healthScoreService.snapshotHealthScore(customerId);
      await load(customerId);
      toast({
        title: r.snapshot_written ? 'Medición guardada' : 'Medición al día',
        description: r.snapshot_written ? `Score ${r.score}: se añadió un punto a la tendencia.` : `Score ${r.score}: sin cambios desde la última medición; no se añadió un punto repetido.`,
      });
    } catch (err) {
      toast({ title: 'No se pudo guardar la medición', description: err instanceof Error ? err.message : 'Inténtalo de nuevo en unos segundos.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        onCloseAutoFocus={onCloseAutoFocus}
        className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 w-full sm:max-w-lg overflow-y-auto"
      >
        <SheetHeader className="pb-4 text-left">
          <SheetTitle className="text-gray-900 dark:text-white flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            Detalle de salud
          </SheetTitle>
          <SheetDescription className="text-gray-600 dark:text-gray-400">
            Score, alertas y tendencia del cliente según la configuración de tu organización.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="space-y-4" aria-busy="true" aria-live="polite">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : !score ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
              <HeartPulse className="h-6 w-6 text-gray-500" aria-hidden="true" />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Este cliente aún no tiene datos de salud. Pulsa «Medir ahora» para calcularlos.</p>
            <Button size="sm" className="mt-3 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSnapshot} disabled={saving}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${saving ? 'animate-spin' : ''}`} aria-hidden="true" />
              Medir ahora
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pb-6">
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="p-4 sm:p-5 flex items-center gap-4">
                <HealthGauge score={score.score} band={score.band} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{score.customer_name}</p>
                  <div className="mt-2">
                    <HealthAlerts alerts={score.alerts ?? []} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {score.indicators.length > 0 && (
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardHeader className="pb-2 px-4"><CardTitle className="text-sm text-gray-900 dark:text-white">Dimensiones</CardTitle></CardHeader>
                <CardContent className="px-4 pb-4"><HealthDimensions indicators={score.indicators} /></CardContent>
              </Card>
            )}

            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader className="pb-2 px-4"><CardTitle className="text-sm text-gray-900 dark:text-white">Historial</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4"><HealthTrend snapshots={history} band={score.band} /></CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" asChild>
                <a href={`/app/crm/clientes/${customerId}`} target="_blank" rel="noopener noreferrer">
                  <FileText className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  Ver ficha 360
                </a>
              </Button>
              <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSnapshot} disabled={saving}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${saving ? 'animate-spin' : ''}`} aria-hidden="true" />
                Medir ahora
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default HealthDetailDrawer;
