'use client';

// ============================================================
// QrPaymentDialog — Dialog de pago QR con cuenta regresiva
// ============================================================
// Muestra el QR de pago, referencia, monto y estado en tiempo
// real usando QrPoller. Cierra automaticamente al confirmar pago.

import { useEffect, useState, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  QrPoller,
  type QrPaymentStatus,
} from '@/lib/services/integrations/qrShared/qrPoller';
import { CheckCircle2, Clock, XCircle, Loader2, QrCode } from 'lucide-react';

// ------------------------------------------------------------
// Tipos
// ------------------------------------------------------------

export interface QrPaymentDialogProps {
  /** Controla la apertura del dialog. */
  open: boolean;
  /** Callback al cerrar el dialog. */
  onClose: () => void;
  /** String EMVCo o data URL base64 del QR. */
  qrData?: string;
  /** URL o base64 de la imagen del QR. */
  qrImageUrl?: string;
  /** Referencia unica del pago. */
  reference: string;
  /** Identificador de la organizacion. */
  organizationId: number;
  /** Monto a pagar. */
  amount: number;
  /** Moneda ISO 4217 (default 'COP'). */
  currency?: string;
  /** Etiqueta del proveedor (ej: 'Bancolombia QR'). */
  providerLabel: string;
  /** Fecha de expiracion ISO 8601. */
  expiresAt?: string;
  /** Callback cuando se confirma el pago. */
  onPaid?: () => void;
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/** Formatea un monto como moneda COP sin decimales. */
function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

/** Calcula los segundos restantes hasta la expiracion. */
function getRemainingSeconds(expiresAt: string | undefined): number {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.floor(ms / 1000));
}

/** Formatea segundos como mm:ss. */
function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ------------------------------------------------------------
// Componente
// ------------------------------------------------------------

export function QrPaymentDialog({
  open,
  onClose,
  qrData,
  qrImageUrl,
  reference,
  organizationId,
  amount,
  currency = 'COP',
  providerLabel,
  expiresAt,
  onPaid,
}: QrPaymentDialogProps) {
  // Estado de pago reportado por el poller (string del backend)
  const [status, setStatus] = useState<QrPaymentStatus>('pending');
  // Segundos restantes de la cuenta regresiva
  const [remaining, setRemaining] = useState<number>(() => getRemainingSeconds(expiresAt));
  // Indicador de consulta manual en curso
  const [checking, setChecking] = useState<boolean>(false);

  // Referencia estable al poller para evitar recreaciones
  const pollerRef = useRef<QrPoller | null>(null);
  // Bandera para evitar doble llamado a onPaid
  const paidHandledRef = useRef<boolean>(false);
  // Temporizador de cierre automatico tras pago
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Monto formateado (memoizado)
  const formattedAmount = useMemo(
    () => formatCurrency(amount, currency),
    [amount, currency]
  );

  // ----------------------------------------------------------
  // Efecto: iniciar/detener poller segun apertura del dialog
  // ----------------------------------------------------------
  useEffect(() => {
    if (!open) return;

    // Reset de estado al abrir
    setStatus('pending');
    setRemaining(getRemainingSeconds(expiresAt));
    paidHandledRef.current = false;

    const poller = new QrPoller({
      reference,
      organizationId,
      onStatusChange: (newStatus) => {
        setStatus(newStatus as QrPaymentStatus);
      },
      onPaid: () => {
        setStatus('paid');
        if (!paidHandledRef.current) {
          paidHandledRef.current = true;
          onPaid?.();
          // Cierre automatico tras 3 segundos
          closeTimerRef.current = setTimeout(() => {
            onClose();
          }, 3000);
        }
      },
      onExpired: () => {
        setStatus('expired');
      },
    });
    pollerRef.current = poller;
    poller.start();

    return () => {
      poller.stop();
      pollerRef.current = null;
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
    // reference, organizationId y expiresAt son estables por pago
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ----------------------------------------------------------
  // Efecto: cuenta regresiva cada segundo
  // ----------------------------------------------------------
  useEffect(() => {
    if (!open || !expiresAt) return;
    const timer = setInterval(() => {
      const secs = getRemainingSeconds(expiresAt);
      setRemaining(secs);
      if (secs <= 0) {
        clearInterval(timer);
        // Si el poller no reporto expiracion, la marcamos localmente
        setStatus((prev: QrPaymentStatus) => (prev === 'paid' ? prev : 'expired'));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [open, expiresAt]);

  // ----------------------------------------------------------
  // Handlers
  // ----------------------------------------------------------

  /** Fuerza una consulta manual del estado del pago. */
  const handleManualCheck = async (): Promise<void> => {
    if (!pollerRef.current) return;
    setChecking(true);
    try {
      await pollerRef.current.checkNow();
    } finally {
      setChecking(false);
    }
  };

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

  const isPaid = status === 'paid';
  const isExpired = status === 'expired' || status === 'rejected' || status === 'cancelled' || remaining <= 0;
  const isWaiting = !isPaid && !isExpired;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-white">
            <QrCode className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Pago QR - {providerLabel}
          </DialogTitle>
          <DialogDescription>
            Escanea el codigo QR con tu app bancaria para completar el pago.
          </DialogDescription>
        </DialogHeader>

        {/* Cuerpo: QR + datos del pago */}
        <div className="flex flex-col items-center gap-4 py-2">
          {/* Estado de exito */}
          {isPaid && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <CheckCircle2 className="h-14 w-14 text-green-600 dark:text-green-400" />
              <p className="text-lg font-semibold text-green-700 dark:text-green-300">
                Pago confirmado
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Se cerrara automaticamente en unos segundos.
              </p>
            </div>
          )}

          {/* Estado de expiracion */}
          {isExpired && !isPaid && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <XCircle className="h-14 w-14 text-red-600 dark:text-red-400" />
              <p className="text-lg font-semibold text-red-700 dark:text-red-300">
                El tiempo ha expirado
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Solicita un nuevo codigo QR para reintentar el pago.
              </p>
            </div>
          )}

          {/* Espera: mostrar QR */}
          {isWaiting && (
            <>
              {/* Contenedor del QR */}
              <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                {qrImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrImageUrl}
                    alt={`Codigo QR de pago ${providerLabel}`}
                    className="h-52 w-52 object-contain"
                  />
                ) : qrData ? (
                  <div className="flex h-52 w-52 items-center justify-center overflow-auto p-2 text-center text-[10px] break-all text-gray-700 dark:text-gray-200">
                    {qrData}
                  </div>
                ) : (
                  <div className="flex h-52 w-52 items-center justify-center text-gray-400 dark:text-gray-500">
                    <QrCode className="h-16 w-16" />
                  </div>
                )}
              </div>

              {/* Cuenta regresiva */}
              {expiresAt && (
                <div className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-300">
                  <Clock className="h-4 w-4" />
                  <span>Expira en {formatCountdown(remaining)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Datos del pago */}
        <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-800/50">
          <div className="flex justify-between gap-2">
            <span className="text-gray-500 dark:text-gray-400">Referencia</span>
            <span className="font-mono font-medium text-gray-900 dark:text-gray-100">
              {reference}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500 dark:text-gray-400">Monto</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {formattedAmount}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500 dark:text-gray-400">Proveedor</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {providerLabel}
            </span>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isPaid}
            className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {isPaid ? 'Cerrar' : 'Cancelar'}
          </Button>

          {isWaiting && (
            <Button
              onClick={handleManualCheck}
              disabled={checking}
              className="dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              {checking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                'Ya pague'
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default QrPaymentDialog;
