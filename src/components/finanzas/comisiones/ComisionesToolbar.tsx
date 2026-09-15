'use client';

/**
 * Barra de acciones de la selección: pagar en lote, rechazar, clawback.
 * Solo ofrece las acciones que la selección admite (`actionsForSelection`);
 * cada una confirma nombrando importe y vendedor, y el servidor vuelve a
 * validar el estado de partida.
 *
 * Foco (brief §4): al confirmar, la selección se limpia y la barra se
 * desmontaría con el diálogo aún abierto → se mantiene montada mientras haya
 * diálogo, y `useReturnFocus` lleva fallback (fila siguiente → «Actualizar»
 * → «Seleccionar todas») porque el botón que abrió el diálogo ya no existe.
 */

import { useMemo, useRef, useState } from 'react';
import { Check, RotateCcw, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/use-toast';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import { describeError } from '@/lib/utils/errorMessage';
import type { CommissionRow } from '@/lib/services/crm/commissionAdminService';
import { ClawbackDialog } from './ClawbackDialog';
import { ReasonDialog } from './ReasonDialog';
import { commissionFocusFallback } from './comisionesFocus';
import { describeSelection, pluralComisiones } from './comisionesModel';
import type { UseComisiones } from './useComisiones';

interface Props {
  state: UseComisiones;
  currency: string;
}

type Dialog = 'pay' | 'reject' | 'clawback' | null;

export function ComisionesToolbar({ state, currency }: Props) {
  const { selectedRows, actions, busy, clearSelection, payMany, rejectMany, clawbackOne } = state;
  const [dialog, setDialog] = useState<Dialog>(null);
  // Instantánea de la selección al abrir el diálogo: los textos no cambian
  // mientras se confirma (la selección real se limpia al terminar).
  const [snapshot, setSnapshot] = useState<CommissionRow[]>([]);
  const actedRef = useRef<string[]>([]);
  const focusFallback = useMemo(() => commissionFocusFallback(() => actedRef.current), []);
  const onCloseAutoFocus = useReturnFocus(dialog === 'pay', focusFallback);
  const rows = dialog === null ? selectedRows : snapshot;
  const sel = describeSelection(rows, currency);
  const ids = rows.map((r) => r.id);

  if (selectedRows.length === 0 && dialog === null) return null;

  const open = (d: Exclude<Dialog, null>) => {
    setSnapshot(selectedRows);
    actedRef.current = selectedRows.map((r) => r.id);
    setDialog(d);
  };

  const report = async (fn: () => Promise<string>) => {
    try {
      const msg = await fn();
      toast({ title: msg });
    } catch (err) {
      toast({ title: 'No se pudo completar', description: describeError(err), variant: 'destructive' });
    }
  };

  return (
    <div
      role="region"
      aria-label="Acciones sobre la selección"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20"
    >
      <p className="mr-auto text-sm text-blue-900 dark:text-blue-100" aria-live="polite">
        <span className="font-semibold">{sel.count}</span> seleccionada{sel.count === 1 ? '' : 's'} · {sel.totalLabel}
      </p>
      {actions.pay && (
        <Button size="sm" onClick={() => open('pay')} disabled={busy} className="bg-blue-600 text-white hover:bg-blue-700">
          <Check className="mr-1 h-4 w-4" aria-hidden="true" />
          Pagar {sel.count > 1 ? `(${sel.count})` : ''}
        </Button>
      )}
      {actions.reject && (
        <Button size="sm" variant="outline" onClick={() => open('reject')} disabled={busy}>
          <XCircle className="mr-1 h-4 w-4" aria-hidden="true" />
          Rechazar
        </Button>
      )}
      {actions.clawback && sel.count === 1 && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => open('clawback')}
          disabled={busy}
          className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30"
        >
          <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" />
          Clawback
        </Button>
      )}
      {!actions.pay && !actions.reject && !actions.clawback && dialog === null && (
        <p className="text-xs text-blue-900/80 dark:text-blue-100/80">Selecciona comisiones del mismo estado para actuar sobre ellas.</p>
      )}
      <Button size="sm" variant="ghost" onClick={clearSelection} aria-label="Quitar selección">
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>

      <ConfirmDialog
        open={dialog === 'pay'}
        onOpenChange={(o) => !o && setDialog(null)}
        onCloseAutoFocus={onCloseAutoFocus}
        title={`¿Pagar ${sel.totalLabel} a ${sel.payee}?`}
        description={`${pluralComisiones(sel.count, 'pendiente')} ${
          sel.count === 1 ? 'pasará a pagada' : 'pasarán a pagadas'
        } con la fecha de hoy. Solo se pagan las que sigan pendientes.`}
        confirmLabel="Sí, pagar"
        loading={busy}
        onConfirm={() => report(() => payMany(ids))}
      />
      <ReasonDialog
        open={dialog === 'reject'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Rechazar ${sel.count === 1 ? 'comisión' : pluralComisiones(sel.count)}`}
        description={`${sel.totalLabel} de ${sel.payee} quedarán canceladas (rechazadas). El motivo se guarda en cada comisión.`}
        confirmLabel="Rechazar"
        busy={busy}
        focusFallback={focusFallback}
        onConfirm={async (reason) => {
          await report(() => rejectMany(ids, reason));
          setDialog(null);
        }}
      />
      <ClawbackDialog
        open={dialog === 'clawback'}
        onOpenChange={(o) => !o && setDialog(null)}
        commission={rows[0] ?? null}
        currency={currency}
        busy={busy}
        focusFallback={focusFallback}
        onConfirm={async (id, reason) => {
          await report(() => clawbackOne(id, reason));
        }}
      />
    </div>
  );
}
