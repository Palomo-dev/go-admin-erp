'use client';

import { useCallback, useEffect, useState } from 'react';
import { CloudOff, Download, RefreshCw, AlertTriangle, CheckCircle2, ShoppingCart, Users, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
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

/** Traductor de `posVenta.pendientesSinConexion` (la etiqueta del estado sale de `estados.<status>`). */
type Traductor = ReturnType<typeof useTranslations>;

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

/** Formatea un importe en la moneda base de la organización (hook `useMonedaOrganizacion`). */
type Formateador = (valor: number) => string;

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

function saleRow(r: OutboxSaleRecord, formatear: Formateador, t: Traductor): TrayRow {
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
    details: [t('items', { n: itemCount }), envelope.checkout.payments.map((p) => `${p.method}: ${formatear(p.amount)}`).join(' · ')],
    exportName: `venta-offline-${r.receipt_number_local}-${r.id}.json`,
    exportContent: exportOutboxSale(r),
  };
}

function customerRow(r: OutboxCustomerRecord, t: Traductor): TrayRow {
  const p = r.payload;
  const name = p.customer_type === 'company' ? p.company_name || `${p.first_name} ${p.last_name}` : `${p.first_name} ${p.last_name}`.trim();
  return {
    key: `customer:${r.id}`,
    kind: 'customer',
    id: r.id,
    title: name || t('clienteSinNombre'),
    amount: null,
    status: r.status,
    createdAt: r.created_at,
    attempts: r.attempts,
    lastError: r.last_error,
    details: [
      p.identification_number ? `${p.identification_type ?? t('doc')} ${p.identification_number}` : '',
      p.email ?? '',
      r.server_id && r.server_id !== r.id ? t('yaExistia', { id: r.server_id }) : '',
    ].filter(Boolean),
    exportName: `cliente-offline-${r.id}.json`,
    exportContent: exportOutboxCustomer(r),
  };
}

function cashRow(r: CashOutboxRecord, formatear: Formateador, t: Traductor): TrayRow {
  const amount = r.kind === 'open' ? r.payload.initial_amount : r.kind === 'close' ? r.payload.final_amount : r.payload.amount;
  const kindLabel =
    r.kind === 'open' ? t('caja.apertura') : r.kind === 'close' ? t('caja.cierre') : r.payload.type === 'in' ? t('caja.ingreso') : t('caja.retiro');
  const details = [
    r.kind === 'movement' ? r.payload.concept : '',
    r.kind === 'close'
      ? t('caja.esperado', { esperado: formatear(r.payload.summary.expected_amount), diferencia: formatear(r.payload.difference) })
      : '',
    r.kind === 'close' && r.payload.summary_partial ? t('caja.resumenParcial') : '',
    r.session_local_id < 0 ? t('caja.cajaLocal', { id: r.session_local_id }) : t('caja.caja', { id: r.session_local_id }),
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
  const { formatear } = useMonedaOrganizacion();
  const t = useTranslations('posVenta.pendientesSinConexion');

  const reload = useCallback(async () => {
    try {
      const [sales, customers, cash] = await Promise.all([
        listOutboxSales().catch(() => [] as OutboxSaleRecord[]),
        listOutboxCustomers().catch(() => [] as OutboxCustomerRecord[]),
        listCashOutbox().catch(() => [] as CashOutboxRecord[]),
      ]);
      setRows([
        ...sales.map((r) => saleRow(r, formatear, t)),
        ...customers.map((r) => customerRow(r, t)),
        ...cash.map((r) => cashRow(r, formatear, t)),
      ]);
    } catch (err) {
      console.warn('[PendientesSinConexion] No se pudo leer el outbox:', err);
    }
  }, [formatear, t]);

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
      if (result.synced > 0) toast.success(t('avisos.sincronizado'));
      else if (result.needsReview > 0) toast.error(t('avisos.enRevision'));
      else if (result.skipped > 0) toast.warning(t('avisos.seReintentara'));
      else toast.warning(t('avisos.noSincronizo'));
    } catch (err) {
      toast.error(t('avisos.errorReintentar', { error: (err as Error)?.message || String(err) }));
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
      if (failedStages.length > 0) toast.error(t('avisos.etapaFallo', { etapa: failedStages[0].name, error: String(failedStages[0].error) }));
      else if (totals.synced > 0) toast.success(t('avisos.sincronizadas', { n: totals.synced }));
      else if (totals.skipped > 0 && totals.failed === 0) toast.warning(t('avisos.sinRed'));
      else if (totals.failed > 0) toast.warning(t('avisos.algunasFallaron'));
      else toast.info(t('sinPendientes'));
    } catch (err) {
      toast.error(t('avisos.errorSincronizar', { error: (err as Error)?.message || String(err) }));
    } finally {
      setSyncingAll(false);
      void reload();
    }
  };

  const KIND_ICON = { sale: ShoppingCart, customer: Users, cash: Wallet } as const;
  const kindLabel = (kind: TrayRow['kind']) => t(`tipos.${kind}`);

  const renderRow = (row: TrayRow) => {
    const isBusy = busyKey === row.key || row.status === 'syncing';
    const Icon = KIND_ICON[row.kind];
    return (
      <li key={row.key} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2 bg-white dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="h-4 w-4 text-gray-500 shrink-0" aria-hidden="true" />
            <span className="sr-only">{kindLabel(row.kind)}</span>
            <span className="font-semibold text-gray-900 dark:text-white truncate">{row.title}</span>
            <Badge variant={statusVariant(row.status)}>{t(`estados.${row.status}`)}</Badge>
          </div>
          {row.amount !== null && <span className="font-semibold text-gray-900 dark:text-white">{formatear(row.amount)}</span>}
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
          <span>{formatDateTime(row.createdAt)}</span>
          {row.details.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
          {row.attempts > 0 && <span>{t('intentos', { n: row.attempts })}</span>}
          <span className="font-mono truncate max-w-full" title={row.id}>
            {row.id}
          </span>
        </div>
        {row.lastError && (
          <p className="text-xs rounded bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 px-2 py-1 break-words">{row.lastError}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {row.status !== 'synced' && (
            <Button size="sm" variant="outline" disabled={isBusy || syncingAll} onClick={() => handleRetry(row)} aria-label={t('reintentarAria', { tipo: kindLabel(row.kind).toLowerCase(), titulo: row.title })}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isBusy ? 'animate-spin' : ''}`} aria-hidden="true" />
              {t('reintentar')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => downloadJson(row.exportName, row.exportContent)} aria-label={t('exportarAria', { tipo: kindLabel(row.kind).toLowerCase(), titulo: row.title })}>
            <Download className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            {t('exportar')}
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
        title={t('boton.title')}
        aria-label={t('boton.aria', { n: attention })}
        className={attention === 0 ? 'hidden lg:inline-flex' : undefined}
      >
        {review.length > 0 ? <AlertTriangle className="h-4 w-4 mr-1" aria-hidden="true" /> : <CloudOff className="h-4 w-4 mr-1" aria-hidden="true" />}
        <span className="hidden sm:inline">{t('boton.texto')}</span>
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
              {t('titulo')}
            </DialogTitle>
            <DialogDescription>{t('descripcion')}</DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t('resumen', {
                pendientes: pending.length,
                ventas: countBy(pending, 'sale'),
                clientes: countBy(pending, 'customer'),
                caja: countBy(pending, 'cash'),
                revision: review.length,
                sincronizados: synced.length,
              })}
            </p>
            <Button size="sm" onClick={handleSyncAll} disabled={syncingAll || pending.length === 0}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncingAll ? 'animate-spin' : ''}`} aria-hidden="true" />
              {t('sincronizarAhora')}
            </Button>
          </div>

          {review.length > 0 && (
            <section aria-labelledby="pendientes-revision" className="space-y-2">
              <h3 id="pendientes-revision" className="text-sm font-semibold text-red-700 dark:text-red-300 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {t('requierenRevision')}
              </h3>
              <ul className="space-y-2">{review.sort(byDate).map(renderRow)}</ul>
            </section>
          )}

          <section aria-labelledby="pendientes-pendientes" className="space-y-2">
            <h3 id="pendientes-pendientes" className="text-sm font-semibold text-gray-900 dark:text-white">
              {t('pendientes')}
            </h3>
            {pending.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('sinPendientes')}</p>
            ) : (
              <ul className="space-y-2">{pending.sort(byDate).map(renderRow)}</ul>
            )}
          </section>

          {synced.length > 0 && (
            <section aria-labelledby="pendientes-sincronizados" className="space-y-2">
              <h3 id="pendientes-sincronizados" className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" /> {t('sincronizados')}
              </h3>
              <ul className="space-y-2">{synced.sort(byDate).map(renderRow)}</ul>
            </section>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
