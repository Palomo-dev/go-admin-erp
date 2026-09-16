'use client';

import { useCallback, useEffect, useState } from 'react';
import { CloudOff, Download, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/utils/Utils';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { isDesktop } from '@/lib/utils/desktop';
import { toast } from 'sonner';
import {
  OUTBOX_CHANGED_EVENT,
  exportOutboxSale,
  listOutboxSales,
  type OutboxSaleRecord,
  type OutboxSaleStatus,
} from '@/lib/offline/salesOutbox';
import { retryOutboxSale, syncPendingSales } from '@/lib/offline/salesSync';

/**
 * Bandeja de ventas hechas sin conexión (Desktop fase 4B).
 *
 * Lista los sobres `pending`/`syncing`/`needs_review` (y los `synced` de los
 * últimos 7 días) con su error, y ofrece «Reintentar» y «Exportar sobre»
 * (JSON completo para soporte). Solo se renderiza dentro de Go Admin
 * Desktop: en navegador devuelve null.
 */

const STATUS_LABEL: Record<OutboxSaleStatus, string> = {
  pending: 'Pendiente',
  syncing: 'Sincronizando',
  synced: 'Sincronizada',
  needs_review: 'Requiere revisión',
};

function statusVariant(status: OutboxSaleStatus): 'warning' | 'destructive' | 'secondary' | 'outline' {
  if (status === 'needs_review') return 'destructive';
  if (status === 'synced') return 'secondary';
  if (status === 'syncing') return 'outline';
  return 'warning';
}

function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function VentasPendientesDialog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<OutboxSaleRecord[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const { formatDateTime } = useFormatDate();

  const reload = useCallback(async () => {
    try {
      setRows(await listOutboxSales());
    } catch (err) {
      console.warn('[VentasPendientes] No se pudo leer el outbox:', err);
    }
  }, []);

  useEffect(() => {
    if (!isDesktop()) return;
    void reload();
    const onChange = () => void reload();
    window.addEventListener(OUTBOX_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(OUTBOX_CHANGED_EVENT, onChange);
  }, [reload]);

  if (!isDesktop()) return null;

  const pending = rows.filter((r) => r.status === 'pending' || r.status === 'syncing');
  const review = rows.filter((r) => r.status === 'needs_review');
  const synced = rows.filter((r) => r.status === 'synced');
  const attention = pending.length + review.length;

  const handleRetry = async (id: string) => {
    setBusyId(id);
    try {
      const result = await retryOutboxSale(id);
      if (result.synced > 0) toast.success('Venta sincronizada.');
      else if (result.needsReview > 0) toast.error('La venta sigue fallando: quedó en revisión.');
      else if (result.skipped > 0) toast.warning('Sin conexión: se reintentará al volver la red.');
      else toast.warning('No se pudo sincronizar. Revisa el error en la bandeja.');
    } catch (err) {
      toast.error('Error al reintentar: ' + ((err as Error)?.message || String(err)));
    } finally {
      setBusyId(null);
      void reload();
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const result = await syncPendingSales({ force: true });
      if (result.synced > 0) toast.success(`${result.synced} venta${result.synced !== 1 ? 's' : ''} sincronizada${result.synced !== 1 ? 's' : ''}.`);
      else if (result.skipped > 0 && result.failed === 0) toast.warning('Sin conexión: se reintentará al volver la red.');
      else if (result.failed > 0 || result.needsReview > 0) toast.warning('Algunas ventas no se pudieron sincronizar.');
      else toast.info('No hay ventas pendientes.');
    } catch (err) {
      toast.error('Error al sincronizar: ' + ((err as Error)?.message || String(err)));
    } finally {
      setSyncingAll(false);
      void reload();
    }
  };

  const handleExport = (record: OutboxSaleRecord) => {
    downloadJson(`venta-offline-${record.receipt_number_local}-${record.id}.json`, exportOutboxSale(record));
  };

  const renderRow = (record: OutboxSaleRecord) => {
    const { envelope } = record;
    const total = envelope.totals.total;
    const itemCount = envelope.checkout.cart.items.length;
    const isBusy = busyId === record.id || record.status === 'syncing';
    return (
      <li
        key={record.id}
        className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2 bg-white dark:bg-gray-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-gray-900 dark:text-white">{record.receipt_number_local}</span>
            <Badge variant={statusVariant(record.status)}>{STATUS_LABEL[record.status]}</Badge>
          </div>
          <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(total)}</span>
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
          <span>{formatDateTime(record.created_at)}</span>
          <span>{itemCount} ítem{itemCount !== 1 ? 's' : ''}</span>
          <span>{envelope.checkout.payments.map((p) => `${p.method}: ${formatCurrency(p.amount)}`).join(' · ')}</span>
          {record.attempts > 0 && <span>Intentos: {record.attempts}</span>}
          <span className="font-mono truncate max-w-full" title={record.id}>{record.id}</span>
        </div>
        {record.last_error && (
          <p className="text-xs rounded bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 px-2 py-1 break-words">
            {record.last_error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {record.status !== 'synced' && (
            <Button
              size="sm"
              variant="outline"
              disabled={isBusy || syncingAll}
              onClick={() => handleRetry(record.id)}
              aria-label={`Reintentar la venta ${record.receipt_number_local}`}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isBusy ? 'animate-spin' : ''}`} aria-hidden="true" />
              Reintentar
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleExport(record)}
            aria-label={`Exportar el sobre de la venta ${record.receipt_number_local}`}
          >
            <Download className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            Exportar sobre
          </Button>
        </div>
      </li>
    );
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={review.length > 0 ? 'destructive' : 'outline'}
        onClick={() => setOpen(true)}
        title="Ventas hechas sin conexión"
        aria-label={`Ventas sin conexión: ${attention} pendiente${attention !== 1 ? 's' : ''}`}
        className={attention === 0 ? 'hidden lg:inline-flex' : undefined}
      >
        {review.length > 0 ? (
          <AlertTriangle className="h-4 w-4 mr-1" aria-hidden="true" />
        ) : (
          <CloudOff className="h-4 w-4 mr-1" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">Sin conexión</span>
        {attention > 0 && (
          <Badge variant={review.length > 0 ? 'secondary' : 'warning'} className="ml-1 px-1.5 py-0 text-xs">
            {attention}
          </Badge>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CloudOff className="h-5 w-5" aria-hidden="true" />
              Ventas pendientes de sincronizar
            </DialogTitle>
            <DialogDescription>
              Ventas cobradas sin conexión en este equipo. Se envían solas al volver la red; si una falla
              cinco veces queda aquí para revisión con su error y el sobre completo. Nunca se borran.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {pending.length} pendiente{pending.length !== 1 ? 's' : ''} · {review.length} en revisión ·{' '}
              {synced.length} sincronizada{synced.length !== 1 ? 's' : ''} (últimos 7 días)
            </p>
            <Button size="sm" onClick={handleSyncAll} disabled={syncingAll || pending.length === 0}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncingAll ? 'animate-spin' : ''}`} aria-hidden="true" />
              Sincronizar ahora
            </Button>
          </div>

          {review.length > 0 && (
            <section aria-labelledby="ventas-revision" className="space-y-2">
              <h3 id="ventas-revision" className="text-sm font-semibold text-red-700 dark:text-red-300 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Requieren revisión
              </h3>
              <ul className="space-y-2">{review.map(renderRow)}</ul>
            </section>
          )}

          <section aria-labelledby="ventas-pendientes" className="space-y-2">
            <h3 id="ventas-pendientes" className="text-sm font-semibold text-gray-900 dark:text-white">
              Pendientes
            </h3>
            {pending.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No hay ventas pendientes.</p>
            ) : (
              <ul className="space-y-2">{pending.map(renderRow)}</ul>
            )}
          </section>

          {synced.length > 0 && (
            <section aria-labelledby="ventas-sincronizadas" className="space-y-2">
              <h3 id="ventas-sincronizadas" className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" /> Sincronizadas
              </h3>
              <ul className="space-y-2">{synced.map(renderRow)}</ul>
            </section>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
