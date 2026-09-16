'use client';

/**
 * Cumplimiento por periodo del miembro: barra accesible, estado con icono +
 * texto, días restantes y ritmo necesario. Borrar pasa por `ConfirmDialog`
 * nombrando la cuota; el botón que lo abrió desaparece con la fila, así que el
 * foco cae a la siguiente cuota o al botón «Guardar cuota» de «Nueva cuota».
 * El porcentaje del texto es el real (`raw_pct`, 103 %); la barra va acotada.
 */

import { useCallback, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Trash2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { QuotaProgressBar } from '@/components/shared/QuotaProgressBar';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import { QUOTA_TYPE_LABELS, quotaStatusLabel, type QuotaStatus, type QuotaType } from '@/lib/services/crm/quotaProgress';
import { formatCurrency } from '@/utils/Utils';
import { periodLabelFor } from './quotaForm';
import type { QuotaRow } from './useMemberQuotas';

interface Props {
  rows: QuotaRow[];
  loading: boolean;
  canManage: boolean;
  busy: boolean;
  onDelete: (id: string) => Promise<unknown>;
}

const STATUS_ICON: Record<QuotaStatus, { icon: typeof Clock; className: string }> = {
  en_ritmo: { icon: TrendingUp, className: 'text-blue-700 dark:text-blue-300' },
  cumplida: { icon: CheckCircle2, className: 'text-green-700 dark:text-green-300' },
  atrasado: { icon: AlertTriangle, className: 'text-amber-700 dark:text-amber-300' },
  vencida: { icon: Clock, className: 'text-red-700 dark:text-red-300' },
};

export function formatQuotaValue(type: QuotaType | string, value: number, currency: string): string {
  return type === 'revenue' ? formatCurrency(value, currency) : `${Math.round(value)}`;
}

export function QuotaHistory({ rows, loading, canManage, busy, onDelete }: Props) {
  const [toDelete, setToDelete] = useState<QuotaRow | null>(null);
  const focusFallback = useCallback(
    () => document.querySelector<HTMLElement>('[data-quota-delete]') ?? document.querySelector<HTMLElement>('[data-quota-submit]'),
    []
  );
  const onCloseAutoFocus = useReturnFocus(toDelete !== null, focusFallback);

  if (loading && rows.length === 0) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Cargando cuotas">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <Skeleton className="mb-2 h-4 w-40" />
            <Skeleton className="mb-3 h-3 w-full" />
            <Skeleton className="h-3 w-56" />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
        Este miembro aún no tiene cuotas. Crea la primera arriba: el cumplimiento se calcula solo con sus ventas, actividades o llamadas.
      </p>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Historial de cuotas">
      {rows.map((r) => {
        const d = r.progress_detail;
        const icon = STATUS_ICON[d.status];
        const achieved = formatQuotaValue(r.target_type, r.achieved_amount, r.target_currency);
        const target = formatQuotaValue(r.target_type, Number(r.target_amount), r.target_currency);
        const label = `${d.raw_pct} % de la cuota de ${QUOTA_TYPE_LABELS[r.target_type as QuotaType] ?? r.target_type}, ${quotaStatusLabel(d.status).toLowerCase()}`;
        return (
          <li key={r.id} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{periodLabelFor(r.period, r.period_start, r.period_end)}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{QUOTA_TYPE_LABELS[r.target_type as QuotaType] ?? r.target_type}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${icon.className}`}>
                  <icon.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {quotaStatusLabel(d.status)}
                </span>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    data-quota-delete=""
                    className="h-7 w-7 p-0 text-gray-600 hover:text-red-700 dark:text-gray-400 dark:hover:text-red-300"
                    aria-label={`Eliminar cuota de ${periodLabelFor(r.period, r.period_start, r.period_end)}`}
                    onClick={() => setToDelete(r)}
                    disabled={busy}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
            <QuotaProgressBar pct={d.pct} status={d.status} label={label} />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-gray-700 dark:text-gray-300">
              <span className="tabular-nums">
                <span className="font-semibold text-gray-900 dark:text-white">{achieved}</span> de {target} · {d.raw_pct} %
              </span>
              <span>
                {d.status === 'cumplida'
                  ? `Superada en ${formatQuotaValue(r.target_type, Math.max(0, r.achieved_amount - Number(r.target_amount)), r.target_currency)}`
                  : d.days_remaining > 0
                    ? `Faltan ${formatQuotaValue(r.target_type, d.remaining, r.target_currency)} · ${d.days_remaining} día${
                        d.days_remaining === 1 ? '' : 's'
                      } · ritmo ${formatQuotaValue(r.target_type, d.needed_per_day, r.target_currency)}/día`
                    : `Faltaron ${formatQuotaValue(r.target_type, d.remaining, r.target_currency)}`}
              </span>
            </div>
          </li>
        );
      })}
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        onCloseAutoFocus={onCloseAutoFocus}
        title={toDelete ? `¿Eliminar la cuota de ${periodLabelFor(toDelete.period, toDelete.period_start, toDelete.period_end)}?` : ''}
        description="Se borra la meta; las ventas, actividades y llamadas del miembro no se tocan."
        confirmLabel="Sí, eliminar"
        variant="destructive"
        loading={busy}
        onConfirm={async () => {
          if (toDelete) await onDelete(toDelete.id);
        }}
      />
    </ul>
  );
}
