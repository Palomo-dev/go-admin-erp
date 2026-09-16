'use client';

/**
 * Clawback en dos pasos: (1) motivo obligatorio, (2) confirmación destructiva
 * que nombra el importe y el vendedor. La transición `paid → cancelled` la
 * valida el servidor (409 si ya no está pagada).
 */

import { useCallback, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import type { CommissionRow } from '@/lib/services/crm/commissionAdminService';
import { formatCurrency } from '@/utils/Utils';
import { ReasonDialog } from './ReasonDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commission: CommissionRow | null;
  currency: string;
  busy?: boolean;
  onConfirm: (id: string, reason: string) => Promise<void>;
  /** A dónde va el foco si el disparador ya no existe (el botón «Clawback» de la fila desaparece al revertirla). */
  focusFallback?: () => HTMLElement | null;
}

export function ClawbackDialog({ open, onOpenChange, commission, currency, busy, onConfirm, focusFallback }: Props) {
  const [reason, setReason] = useState<string | null>(null);
  const reasonRef = useRef<string | null>(null);
  reasonRef.current = reason;
  // Captura el disparador al abrir el flujo; devuelve el foco al cerrar la confirmación (o al fallback).
  const onCloseAutoFocus = useReturnFocus(open, focusFallback);

  /**
   * El diálogo del motivo se cierra con animación DESPUÉS de que la confirmación
   * ya está abierta: si devolviera el foco al disparador, la confirmación quedaría
   * abierta sin foco dentro (medido en el arnés F13). Al pasar de paso, el foco va
   * al primer botón de la confirmación; si se cancela en el paso 1, al disparador.
   */
  const onReasonCloseAutoFocus = useCallback(
    (event: Event) => {
      if (reasonRef.current === null) {
        onCloseAutoFocus(event);
        return;
      }
      event.preventDefault();
      const alert = document.querySelector('[role="alertdialog"]');
      (alert?.querySelector('button') as HTMLElement | null)?.focus();
    },
    [onCloseAutoFocus]
  );

  const close = () => {
    setReason(null);
    onOpenChange(false);
  };

  if (!commission) return null;
  const amount = formatCurrency(Number(commission.commission_amount), commission.currency || currency);
  const payee = commission.payee_name || 'sin nombre';

  return (
    <>
      <ReasonDialog
        open={open && reason === null}
        onOpenChange={(o) => {
          if (!o) close();
        }}
        title="Revertir comisión pagada (clawback)"
        description={`Vas a revertir ${amount} de ${payee}. La comisión pasará a cancelada; la fecha de pago se conserva como evidencia.`}
        confirmLabel="Continuar"
        destructive
        onCloseAutoFocus={onReasonCloseAutoFocus}
        onConfirm={(r) => setReason(r)}
      />
      <ConfirmDialog
        open={open && reason !== null}
        onOpenChange={(o) => {
          if (!o) close();
        }}
        onCloseAutoFocus={onCloseAutoFocus}
        title={`¿Revertir ${amount} de ${payee}?`}
        description={`Motivo: «${reason ?? ''}». Esta acción cancela la comisión y no se puede deshacer desde aquí.`}
        confirmLabel="Sí, revertir"
        cancelLabel="No, volver"
        variant="destructive"
        loading={busy}
        onConfirm={async () => {
          if (reason) await onConfirm(commission.id, reason);
          setReason(null);
        }}
      />
    </>
  );
}
