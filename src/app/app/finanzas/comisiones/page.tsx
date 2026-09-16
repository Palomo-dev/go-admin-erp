'use client';

/**
 * /app/finanzas/comisiones (F13): resumen del filtro, filtros arriba, selección
 * múltiple con barra de acciones (pagar en lote · rechazar · clawback) y tabla
 * con enlace al origen. Todo el I/O pasa por `useComisiones` → rutas de API.
 */

import { useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/use-toast';
import { TableSkeleton } from '@/components/common/PageSkeletons';
import { useOrgCurrency } from '@/lib/hooks/useOrgCurrency';
import { useOrgMembers } from '@/lib/hooks/useOrgMembers';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import { describeError } from '@/lib/utils/errorMessage';
import type { CommissionRow } from '@/lib/services/crm/commissionAdminService';
import { cn, formatCurrency } from '@/utils/Utils';
import {
  ClawbackDialog,
  ComisionesFilters,
  ComisionesHeader,
  ComisionesList,
  ComisionesSummary,
  ComisionesToolbar,
  useComisiones,
} from '@/components/finanzas/comisiones';
import { activeFilterCount } from '@/components/finanzas/comisiones/comisionesModel';
import { REFRESH_BUTTON_ID, commissionFocusFallback } from '@/components/finanzas/comisiones/comisionesFocus';

export default function ComisionesPage() {
  const state = useComisiones();
  const currency = useOrgCurrency();
  const { members } = useOrgMembers();
  const [clawbackRow, setClawbackRow] = useState<CommissionRow | null>(null);
  const [payRow, setPayRow] = useState<CommissionRow | null>(null);
  // Foco tras confirmar (brief §4): el botón «Pagar» de la fila desaparece al pagarla;
  // el fallback va a la fila siguiente → «Actualizar» → «Seleccionar todas».
  const actedRef = useRef<string[]>([]);
  const focusFallback = useMemo(() => commissionFocusFallback(() => actedRef.current), []);
  const onPayDialogClose = useReturnFocus(payRow !== null, focusFallback);

  const payOne = async (row: CommissionRow) => {
    actedRef.current = [row.id];
    try {
      toast({ title: await state.payMany([row.id]) });
    } catch (err) {
      toast({ title: 'No se pudo pagar', description: describeError(err), variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen space-y-4 bg-gray-50 p-4 sm:space-y-6 sm:p-6 lg:p-8 dark:bg-gray-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <ComisionesHeader />
        <Button id={REFRESH_BUTTON_ID} variant="outline" size="sm" onClick={() => state.reload()} disabled={state.loading} className="h-8">
          <RefreshCw className={cn('mr-1 h-4 w-4', state.loading && 'animate-spin')} aria-hidden="true" />
          Actualizar
        </Button>
      </div>

      <ComisionesSummary
        summary={state.summary}
        others={state.summaryOthers}
        currency={state.currency || currency}
        loading={state.loading}
        unavailable={state.error !== null && state.rows.length === 0}
      />

      <ComisionesFilters filters={state.filters} onChange={state.setFilters} members={members} canManage={state.canManage} />

      {state.error && (
        <Alert variant="destructive">
          <AlertTitle>No se pudieron cargar las comisiones</AlertTitle>
          <AlertDescription>
            {state.error} · Se muestra la última lista conocida.{' '}
            <button type="button" onClick={() => state.reload()} className="underline">Reintentar</button>
          </AlertDescription>
        </Alert>
      )}

      {state.canManage && <ComisionesToolbar state={state} currency={currency} />}

      {state.loading && state.rows.length === 0 ? (
        <TableSkeleton columns={8} rows={5} />
      ) : (
        <ComisionesList
          rows={state.rows}
          currency={currency}
          canManage={state.canManage}
          selected={state.selected}
          onToggle={state.toggle}
          onToggleAll={state.toggleAll}
          onPayOne={setPayRow}
          onClawbackOne={setClawbackRow}
          hasActiveFilters={activeFilterCount(state.filters) > 0}
        />
      )}

      <ConfirmDialog
        open={payRow !== null}
        onOpenChange={(o) => !o && setPayRow(null)}
        onCloseAutoFocus={onPayDialogClose}
        title={payRow ? `¿Pagar ${formatCurrency(Number(payRow.commission_amount), payRow.currency || currency)} a ${payRow.payee_name || 'sin nombre'}?` : ''}
        description="La comisión pasará a pagada con la fecha de hoy. Solo se paga si sigue pendiente."
        confirmLabel="Sí, pagar"
        loading={state.busy}
        onConfirm={async () => {
          if (payRow) await payOne(payRow);
        }}
      />

      <ClawbackDialog
        open={clawbackRow !== null}
        onOpenChange={(o) => !o && setClawbackRow(null)}
        commission={clawbackRow}
        currency={currency}
        busy={state.busy}
        focusFallback={focusFallback}
        onConfirm={async (id, reason) => {
          actedRef.current = [id];
          try {
            toast({ title: await state.clawbackOne(id, reason) });
          } catch (err) {
            toast({ title: 'No se pudo revertir', description: describeError(err), variant: 'destructive' });
          }
        }}
      />
    </div>
  );
}
