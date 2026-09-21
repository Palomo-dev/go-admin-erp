'use client';

import { useCallback, useEffect, useState } from 'react';
import { CloudOff, Download, RefreshCw, AlertTriangle, CheckCircle2, ShoppingCart, Users, Wallet } from 'lucide-react';
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
  exportOutboxSale,
  listOutboxSales,
  type OutboxSaleRecord,
  type OutboxSaleStatus,
} from '@/lib/offline/salesOutbox';
import { retryOutboxSale } from '@/lib/offline/salesSync';
import { exportOutboxCustomer, listOutboxCustomers, type OutboxCustomerRecord } from '@/lib/offline/customersOutbox';
import { retryOutboxCustomer } from '@/lib/offline/customersSync';
import { exportCashOutboxRecord, listCashOutbox, type CashOutboxRecord } from '@/lib/offline/cashOutbox';
import { retryCashOutboxRecord } from '@/lib/offline/cashSync';
import { OUTBOX_CHANGED_EVENTS } from '@/lib/offline/outboxCounts';
import { runSyncStages } from '@/lib/offline/syncOrchestrator';
import { registerDefaultSyncStages } from '@/lib/offline/syncStages';

/**
 * Bandeja unificada de lo hecho sin conexión (Desktop, fases 4B/4D/4F):
 * ventas, clientes y operaciones de caja (apertura, movimientos, cierre)
 * `pending`/`syncing`/`needs_review`, y las sincronizadas de los últimos
 * 7 días. Por fila: «Reintentar» y «Exportar» (JSON íntegro para soporte).
 * «Sincronizar ahora» ejecuta las etapas del orquestador en orden
 * (clientes → caja: aperturas → ventas → caja: movimientos y cierres).
 * Sustituye a `VentasPendientesDialog` con la misma UX. Solo se renderiza
 * dentro de Go Admin Desktop: en navegador devuelve null.
 */

type Status = OutboxSaleStatus;

const STATUS_LABEL: Record<Status, string> = {
  pending: 'Pendiente',
  syncing: 'Sincronizando',
  synced: 'Sincronizado',
  needs_review: 'Requiere revisión',
};

function statusVariant(status: Status): 'warning' | 'destructive' | 'secondary' | 'outline' {
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

/** Fila homogénea para las tres bandejas. */
interface TrayRow {
  key: string;
  kind: 'sale' | 'customer' | 'cash';
  id: string;
  title: string;
  amount: number | null;
  status: Status;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  details: string[];
  exportName: string;
  exportContent: string;
}

function saleRow(r: OutboxSaleRecord): TrayRow {
  const { envelope } = r;
  const itemCount = envelope.checkout.cart.items.length;
  return {
    key: `sale:${r.id}`,
    kind: 'sale',
    id: r.id,
    title: r.receipt_number_local,
    amount: envelope.totals.total,
    status: r.status,
    createdAt: r.created_at,
    attempts: r.attempts,
    lastError: r.last_error,
    details: [`${itemCount} ítem${itemCount !== 1 ? 's' : ''}`, envelope.checkout.payments.map((p) => `${p.method}: ${formatCurrency(p.amount)}`).join(' · ')],
    exportName: `venta-offline-${r.receipt_number_local}-${r.id}.json`,
    exportContent: exportOutboxSale(r),
  };
}

function customerRow(r: OutboxCustomerRecord): TrayRow {
  const p = r.payload;
  const name = p.customer_type === 'company' ? p.company_name || `${p.first_name} ${p.last_name}` : `${p.first_name} ${p.last_name}`.trim();
  return {
    key: `customer:${r.id}`,
    kind: 'customer',
    id: r.id,
    title: name || 'Cliente sin nombre',
    amount: null,
    status: r.status,
    createdAt: r.created_at,
    attempts: r.attempts,
    lastError: r.last_error,
    details: [p.identification_number ? `${p.identification_type ?? 'Doc'} ${p.identification_number}` : '', p.email ?? '', r.server_id && r.server_id !== r.id ? `Ya existía: ${r.server_id}` : ''].filter(Boolean),
    exportName: `cliente-offline-${r.id}.json`,
    exportContent: exportOutboxCustomer(r),
  };
}

function cashRow(r: CashOutboxRecord): TrayRow {
  const amount = r.kind === 'open' ? r.payload.initial_amount : r.kind === 'close' ? r.payload.final_amount : r.payload.amount;
  const kindLabel = r.kind === 'open' ? 'Apertura de caja' : r.kind === 'close' ? 'Cierre de caja' : r.payload.type === 'in' ? 'Ingreso de efectivo' : 'Retiro de efectivo';
  const details = [
    r.kind === 'movement' ? r.payload.concept : '',
    r.kind === 'close' ? `Esperado ${formatCurrency(r.payload.summary.expected_amount)} · diferencia ${formatCurrency(r.payload.difference)}` : '',
    r.kind === 'close' && r.payload.summary_partial ? 'Resumen parcial: sin réplica de pagos al cerrar' : '',
    r.session_local_id < 0 ? `Caja local #${r.session_local_id}` : `Caja #${r.session_local_id}`,
  ].filter(Boolean);
  return {
    key: `cash:${r.id}`,
    kind: 'cash',
    id: r.id,
    title: kindLabel,
    amount,
    status: r.status,
    createdAt: r.created_at,
    attempts: r.attempts,
    lastError: r.last_error,
    details,
    exportName: `caja-offline-${r.kind}-${r.id}.json`,
    exportContent: exportCashOutboxRecord(r),
  };
}

export function PendientesSinConexionDialog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<TrayRow[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const { formatDateTime } = useFormatDate();

  const reload = useCallback(async () => {
    try {
      const [sales, customers, cash] = await Promise.all([
        listOutboxSales().catch(() => [] as OutboxSaleRecord[]),
        listOutboxCustomers().catch(() => [] as OutboxCustomerRecord[]),
        listCashOutbox().catch(() => [] as CashOutboxRecord[]),
      ]);
      setRows([...sales.map(saleRow), ...customers.map(customerRow), ...cash.map(cashRow)]);
    } catch (err) {
      console.warn('[PendientesSinConexion] No se pudo leer el outbox:', err);
    }
  }, []);

  useEffect(() => {
    if (!isDesktop()) return;
    void reload();
    const onChange = () => void reload();
    for (const ev of OUTBOX_CHANGED_EVENTS) window.addEventListener(ev, onChange);
    return () => {
      for (const ev of OUTBOX_CHANGED_EVENTS) window.removeEventListener(ev, onChange);
    };
  }, [reload]);

  if (!isDesktop()) return null;

  const pending = rows.filter((r) => r.status === 'pending' || r.status === 'syncing');
  const review = rows.filter((r) => r.status === 'needs_review');
  const synced = rows.filter((r) => r.status === 'synced');
  const attention = pending.length + review.length;
  const countBy = (list: TrayRow[], kind: TrayRow['kind']) => list.filter((r) => r.kind === kind).length;

  const handleRetry = async (row: TrayRow) => {
    setBusyKey(row.key);
    try {
      const result =
        row.kind === 'sale' ? await retryOutboxSale(row.id) : row.kind === 'customer' ? await retryOutboxCustomer(row.id) : await retryCashOutboxRecord(row.id);
      if (result.synced > 0) toast.success('Sincronizado.');
      else if (result.needsReview > 0) toast.error('Sigue fallando: quedó en revisión.');
      else if (result.skipped > 0) toast.warning('Sin conexión o esperando a otra operación: se reintentará.');
      else toast.warning('No se pudo sincronizar. Revisa el error en la bandeja.');
    } catch (err) {
      toast.error('Error al reintentar: ' + ((err as Error)?.message || String(err)));
    } finally {
      setBusyKey(null);
      void reload();
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      registerDefaultSyncStages();
      const run = await runSyncStages({ force: true });
      const failedStages = run.stages.filter((s) => !s.ok);
      const totals = run.stages.reduce(
        (acc, s) => {
          const r = (s.result ?? {}) as { synced?: number; failed?: number; needsReview?: number; skipped?: number };
          acc.synced += r.synced ?? 0;
          acc.failed += (r.failed ?? 0) + (r.needsReview ?? 0);
          acc.skipped += r.skipped ?? 0;
          return acc;
        },
        { synced: 0, failed: 0, skipped: 0 },
      );
      if (failedStages.length > 0) toast.error(`Falló la etapa «${failedStages[0].name}»: ${failedStages[0].error}`);
      else if (totals.synced > 0) toast.success(`${totals.synced} operación${totals.synced !== 1 ? 'es' : ''} sincronizada${totals.synced !== 1 ? 's' : ''}.`);
      else if (totals.skipped > 0 && totals.failed === 0) toast.warning('Sin conexión: se reintentará al volver la red.');
      else if (totals.failed > 0) toast.warning('Algunas operaciones no se pudieron sincronizar.');
      else toast.info('No hay operaciones pendientes.');
    } catch (err) {
      toast.error('Error al sincronizar: ' + ((err as Error)?.message || String(err)));
    } finally {
      setSyncingAll(false);
      void reload();
    }
  };

  const KIND_ICON = { sale: ShoppingCart, customer: Users, cash: Wallet } as const;
  const KIND_LABEL = { sale: 'Venta', customer: 'Cliente', cash: 'Caja' } as const;

  const renderRow = (row: TrayRow) => {
    const isBusy = busyKey === row.key || row.status === 'syncing';
    const Icon = KIND_ICON[row.kind];
    return (
      <li key={row.key} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2 bg-white dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="h-4 w-4 text-gray-500 shrink-0" aria-hidden="true" />
            <span className="sr-only">{KIND_LABEL[row.kind]}</span>
            <span className="font-semibold text-gray-900 dark:text-white truncate">{row.title}</span>
            <Badge variant={statusVariant(row.status)}>{STATUS_LABEL[row.status]}</Badge>
          </div>
          {row.amount !== null && <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(row.amount)}</span>}
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
          <span>{formatDateTime(row.createdAt)}</span>
          {row.details.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
          {row.attempts > 0 && <span>Intentos: {row.attempts}</span>}
          <span className="font-mono truncate max-w-full" title={row.id}>
            {row.id}
          </span>
        </div>
        {row.lastError && (
          <p className="text-xs rounded bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 px-2 py-1 break-words">{row.lastError}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {row.status !== 'synced' && (
            <Button size="sm" variant="outline" disabled={isBusy || syncingAll} onClick={() => handleRetry(row)} aria-label={`Reintentar ${KIND_LABEL[row.kind].toLowerCase()} ${row.title}`}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isBusy ? 'animate-spin' : ''}`} aria-hidden="true" />
              Reintentar
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => downloadJson(row.exportName, row.exportContent)} aria-label={`Exportar ${KIND_LABEL[row.kind].toLowerCase()} ${row.title}`}>
            <Download className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            Exportar
          </Button>
        </div>
      </li>
    );
  };

  const byDate = (a: TrayRow, b: TrayRow) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={review.length > 0 ? 'destructive' : 'outline'}
        onClick={() => setOpen(true)}
        title="Ventas, clientes y caja hechos sin conexión"
        aria-label={`Sin conexión: ${attention} pendiente${attention !== 1 ? 's' : ''}`}
        className={attention === 0 ? 'hidden lg:inline-flex' : undefined}
      >
        {review.length > 0 ? <AlertTriangle className="h-4 w-4 mr-1" aria-hidden="true" /> : <CloudOff className="h-4 w-4 mr-1" aria-hidden="true" />}
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
              Pendientes de sincronizar
            </DialogTitle>
            <DialogDescription>
              Ventas, clientes y operaciones de caja hechos sin conexión en este equipo. Se envían solos al volver la red, en orden
              (clientes → apertura de caja → ventas → movimientos y cierre); si algo falla cinco veces queda aquí para revisión con su error
              y el registro completo. Nunca se borran.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {pending.length} pendiente{pending.length !== 1 ? 's' : ''} ({countBy(pending, 'sale')} ventas · {countBy(pending, 'customer')} clientes ·{' '}
              {countBy(pending, 'cash')} caja) · {review.length} en revisión · {synced.length} sincronizado{synced.length !== 1 ? 's' : ''} (últimos 7 días)
            </p>
            <Button size="sm" onClick={handleSyncAll} disabled={syncingAll || pending.length === 0}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncingAll ? 'animate-spin' : ''}`} aria-hidden="true" />
              Sincronizar ahora
            </Button>
          </div>

          {review.length > 0 && (
            <section aria-labelledby="pendientes-revision" className="space-y-2">
              <h3 id="pendientes-revision" className="text-sm font-semibold text-red-700 dark:text-red-300 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Requieren revisión
              </h3>
              <ul className="space-y-2">{review.sort(byDate).map(renderRow)}</ul>
            </section>
          )}

          <section aria-labelledby="pendientes-pendientes" className="space-y-2">
            <h3 id="pendientes-pendientes" className="text-sm font-semibold text-gray-900 dark:text-white">
              Pendientes
            </h3>
            {pending.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No hay operaciones pendientes.</p>
            ) : (
              <ul className="space-y-2">{pending.sort(byDate).map(renderRow)}</ul>
            )}
          </section>

          {synced.length > 0 && (
            <section aria-labelledby="pendientes-sincronizados" className="space-y-2">
              <h3 id="pendientes-sincronizados" className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" /> Sincronizados
              </h3>
              <ul className="space-y-2">{synced.sort(byDate).map(renderRow)}</ul>
            </section>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
