'use client';

// ============================================================
// QrPaymentDialog — Dialog de pago QR con cuenta regresiva
// ============================================================
// Muestra el QR de pago, referencia, monto y estado en tiempo
// real usando QrPoller. Cierra automaticamente al confirmar pago.

import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
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
import { parseExpiresAt } from '@/lib/pos/display/payment';
import { CheckCircle2, Clock, XCircle, Loader2, QrCode, AlertTriangle } from 'lucide-react';

/**
 * Gracia tras el vencimiento por reloj LOCAL antes de parar el poller
 * (HALLAZGO Z, F2C-R9). Decisión: el proveedor es quien sabe si el dinero se
 * movió; un pago que el cliente inició segundos antes de la hora y que el
 * banco confirma justo después debe registrarse, no descartarse (descartarlo
 * deja al cliente pagado y la venta sin el pago). Pasada la gracia el código
 * ya no está en ninguna pantalla (la caja muestra «El tiempo ha expirado» y
 * la del cliente lo retiró por su propio reloj y por `onTerminal`), así que
 * nadie puede iniciar un pago nuevo: se para, y un `paid` posterior se
 * reconcilia por webhook en `payment_qr_sessions` o con el botón «Verificar
 * pago» del estado vencido (HALLAZGO AA, F2C-R10): UNA consulta por pulsación,
 * sin reanudar el polling. Así el cajero conserva una vía desde la caja para
 * el pago que el banco confirma 30-120 s después del escaneo, y el poller no
 * vuelve a consultar ~24 min solo.
 */
export const QR_LOCAL_EXPIRY_GRACE_MS = 30_000;

/** Estados terminales del proveedor que NO son un pago (HALLAZGO T, F2C-R8). */
export type QrTerminalStatus = Extract<QrPaymentStatus, 'expired' | 'rejected' | 'cancelled'>;

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
  /**
   * El proveedor dio por muerto el código sin pago (`expired` antes de la
   * hora local, `rejected`, `cancelled`): se avisa UNA vez por apertura para
   * que el padre retire el código de la pantalla del cliente (PLAN §3.5
   * «nunca un código roto»). Solo avisa; no cierra ni cambia el cobro.
   */
  onTerminal?: (status: QrTerminalStatus) => void;
  /**
   * Control adicional bajo el QR mientras se espera el pago (p. ej. el
   * interruptor «Mostrar en pantalla del cliente» del POS). Opcional: sin él
   * el dialog es idéntico al de siempre.
   */
  extraControl?: React.ReactNode;
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

/**
 * Calcula los segundos restantes hasta la expiracion. Sin fecha válida
 * (ausente, « », «2026-13-99») devuelve 0 y NUNCA NaN: `parseExpiresAt` es la
 * misma regla que aplica la pantalla del cliente (HALLAZGO X, F2C-R9); antes
 * un valor no fecha pintaba «Expira en NaN:NaN» sin vencer jamás.
 */
function getRemainingSeconds(expiresAt: string | undefined): number {
  const deadline = parseExpiresAt(expiresAt);
  if (deadline === null) return 0;
  return Math.max(0, Math.floor((deadline - Date.now()) / 1000));
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
  onTerminal,
  extraControl,
}: QrPaymentDialogProps) {
  // Estado de pago reportado por el poller (string del backend)
  const [status, setStatus] = useState<QrPaymentStatus>('pending');
  // Segundos restantes de la cuenta regresiva
  const [remaining, setRemaining] = useState<number>(() => getRemainingSeconds(expiresAt));
  // Indicador de consulta manual en curso
  const [checking, setChecking] = useState<boolean>(false);
  // El poller murió (agotó maxAttempts, HALLAZGO W): la cuenta atrás sigue
  // pero nadie consulta. Se avisa y «Ya pague» lo reinicia.
  const [verifyFailed, setVerifyFailed] = useState<boolean>(false);
  // El PROVEEDOR dio su veredicto sin pago (expired/rejected/cancelled). Se
  // distingue del vencimiento por reloj LOCAL (que solo pone `status` en
  // 'expired'): tras el local el pago puede seguir entrando y «Verificar pago»
  // tiene sentido; tras el veredicto no hay nada que consultar (HALLAZGO AA).
  const [providerTerminal, setProviderTerminal] = useState<boolean>(false);

  // Reinicio del estado por apertura DURANTE el render (HALLAZGO AB, F2C-R10):
  // reiniciarlo en el efecto pasivo [open] pintaba un frame con el `status`
  // ('expired') y el `remaining` (0) del QR anterior al reabrir para un QR
  // nuevo. Es el patrón de React para estado derivado de una prop: un
  // setState durante el render se aplica antes de pintar.
  const [openSeen, setOpenSeen] = useState<boolean>(open);
  if (open !== openSeen) {
    setOpenSeen(open);
    if (open) {
      setStatus('pending');
      setRemaining(getRemainingSeconds(expiresAt));
      setChecking(false);
      setVerifyFailed(false);
      setProviderTerminal(false);
    }
  }

  // Referencia estable al poller para evitar recreaciones
  const pollerRef = useRef<QrPoller | null>(null);
  // Bandera para evitar doble llamado a onPaid
  const paidHandledRef = useRef<boolean>(false);
  // Temporizador de cierre automatico tras pago
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ¿Sigue abierto? Un `paid` que llegue con el dialog ya cerrado (Cancelar
  // con la consulta en vuelo) no debe confirmar nada: la caja registraría el
  // pago del QR abandonado, incluso en la venta siguiente (F2C-R7-1). El
  // poller ya descarta la respuesta tras stop(); esto es la segunda red.
  const openRef = useRef<boolean>(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  // onTerminal se lee por ref: el efecto del poller vive en [open] y el padre
  // suele pasar una arrow nueva en cada render.
  const onTerminalRef = useRef(onTerminal);
  useEffect(() => {
    onTerminalRef.current = onTerminal;
  }, [onTerminal]);
  // Un solo aviso terminal por apertura (el poller manda onStatusChange y
  // onExpired para el mismo `expired`, y el reloj local también lo marca).
  const terminalNotifiedRef = useRef<boolean>(false);
  // Temporizador de gracia tras el vencimiento local (HALLAZGO Z).
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // «Verificar pago» en el estado vencido: UNA consulta con el poller ya
  // parado (HALLAZGO AA). Mientras dura, un error de red se avisa aunque el
  // poller figure como «corriendo» (no habrá reintento automático: al
  // terminar se vuelve a parar).
  const oneShotCheckRef = useRef<boolean>(false);
  // Veredicto del proveedor por ref (ronda de cierre, QA-5): el intervalo de
  // la cuenta atrás lo lee sin re-suscribirse. Con `rejected`/`cancelled` ya
  // dados, el vencimiento local NO los pisa con «expirado» ni arma una gracia
  // sobre un poller que ya se paró solo.
  const providerTerminalRef = useRef<boolean>(false);
  // Consultas pedidas A MANO en vuelo («Ya pague» / «Verificar pago»), como
  // contador por si dos pulsaciones se solapan (HALLAZGO AD, F2C-R12).
  const manualChecksInFlightRef = useRef<number>(0);
  // La gracia de Z venció con una consulta manual en vuelo: no se para el
  // poller ahí (su stop() descartaría la respuesta que el cajero PIDIÓ, sin
  // onPaid ni aviso); se para en el finally de handleManualCheck salvo paid.
  // Regla única: una consulta pedida a mano siempre se honra.
  const stopAfterManualRef = useRef<boolean>(false);

  /**
   * Avisa al padre UNA vez por apertura de que el código murió sin pago. Solo
   * lee refs, así que es estable y puede invocarse tanto desde el poller
   * (efecto [open]) como desde la cuenta atrás (efecto [open, deadline]).
   */
  const notifyTerminal = useCallback((terminal: QrTerminalStatus): void => {
    if (!openRef.current || terminalNotifiedRef.current) return;
    terminalNotifiedRef.current = true;
    onTerminalRef.current?.(terminal);
  }, []);

  // Vencimiento válido en ms de época, o null si `expiresAt` no es una fecha:
  // sin fecha válida no hay cuenta atrás y `remaining` (0) no significa
  // vencido, igual que en la pantalla del cliente (HALLAZGO U/X).
  const deadline = useMemo(() => parseExpiresAt(expiresAt), [expiresAt]);

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

    // Reset de las banderas por apertura (el estado renderizado se reinicia
    // durante el render, ver `openSeen`).
    paidHandledRef.current = false;
    terminalNotifiedRef.current = false;
    oneShotCheckRef.current = false;
    providerTerminalRef.current = false;
    stopAfterManualRef.current = false;

    const poller = new QrPoller({
      reference,
      organizationId,
      onStatusChange: (newStatus) => {
        setStatus(newStatus as QrPaymentStatus);
        if (newStatus === 'expired' || newStatus === 'rejected' || newStatus === 'cancelled') {
          providerTerminalRef.current = true;
          setProviderTerminal(true);
          notifyTerminal(newStatus);
        }
      },
      onPaid: () => {
        if (!openRef.current) return;
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
        providerTerminalRef.current = true;
        setProviderTerminal(true);
        notifyTerminal('expired');
      },
      onError: () => {
        // Errores transitorios (red, HTTP 5xx) siguen reintentando; solo
        // importa cuando el poller se paró de verdad (maxAttempts) o cuando
        // la consulta era la única de «Verificar pago» (no habrá reintento).
        if (!openRef.current) return;
        // La gracia de Z ya venció con la consulta manual en vuelo (AD): el
        // finally parará el poller, así que tampoco habrá reintento: se avisa.
        if (stopAfterManualRef.current) {
          setVerifyFailed(true);
          return;
        }
        if (poller.isRunning && !oneShotCheckRef.current) return;
        setVerifyFailed(true);
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
    // reference, organizationId y expiresAt son estables por pago;
    // notifyTerminal solo lee refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ----------------------------------------------------------
  // Efecto: cuenta regresiva cada segundo
  // ----------------------------------------------------------
  useEffect(() => {
    if (!open || deadline === null) return;
    const timer = setInterval(() => {
      const secs = getRemainingSeconds(expiresAt);
      setRemaining(secs);
      if (secs <= 0) {
        clearInterval(timer);
        // Ya pagado (onPaid paró el poller): nada que vencer.
        if (paidHandledRef.current) return;
        // El PROVEEDOR ya dio su veredicto (`rejected`, `cancelled`,
        // `expired`): el poller se paró solo, el padre ya fue avisado y el
        // texto en pantalla es el suyo. El reloj local no lo pisa con
        // «El tiempo ha expirado» (el cajero no sabría si el banco rechazó o
        // si solo venció el tiempo) ni arma una gracia sobre nada (QA-5).
        if (providerTerminalRef.current) return;
        // Si el poller no reporto expiracion, la marcamos localmente
        setStatus((prev: QrPaymentStatus) => (prev === 'paid' ? prev : 'expired'));
        // El aviso de W («no se pudo verificar») era del estado de espera; en
        // el vencido solo lo vuelve a poner una «Verificar pago» fallida.
        setVerifyFailed(false);
        // El padre retira el código de la pantalla del cliente (qrDead); si
        // el proveedor manda `expired` después, no hay segundo aviso.
        notifyTerminal('expired');
        // HALLAZGO Z: la caja ya declaró muerto el código; el poller no puede
        // seguir consultando ~24 min más (maxAttempts con backoff). Se le da
        // una gracia corta (QR_LOCAL_EXPIRY_GRACE_MS) para absorber el desfase
        // de reloj y el pago iniciado justo antes de la hora: un `paid` en
        // esa ventana se registra; después, stop() descarta cualquier
        // respuesta en vuelo y onPaid ya no puede dispararse desde aquí.
        graceTimerRef.current = setTimeout(() => {
          graceTimerRef.current = null;
          // Consulta pedida A MANO todavía en vuelo (HALLAZGO AD, F2C-R12):
          // parar aquí descartaría en silencio la respuesta que el cajero
          // PIDIÓ. Se difiere al finally de handleManualCheck, que para el
          // poller si no hubo paid; un `paid` se honra como en AC.
          if (manualChecksInFlightRef.current > 0) {
            stopAfterManualRef.current = true;
            return;
          }
          pollerRef.current?.stop();
        }, QR_LOCAL_EXPIRY_GRACE_MS);
      }
    }, 1000);

    return () => {
      clearInterval(timer);
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
    };
  }, [open, deadline, expiresAt, notifyTerminal]);

  // ----------------------------------------------------------
  // Handlers
  // ----------------------------------------------------------

  const isPaid = status === 'paid';
  // Sin fecha válida no hay cuenta atrás y `remaining` (0) no significa
  // vencido: el código se muestra hasta que el proveedor diga otra cosa,
  // igual que en la pantalla del cliente (HALLAZGO U; X: «2026-13-99» o « »
  // tampoco cuentan como fecha, `parseExpiresAt` decide en ambos extremos).
  const hasDeadline = deadline !== null;
  const isExpired = status === 'expired' || status === 'rejected' || status === 'cancelled' || (hasDeadline && remaining <= 0);
  const isWaiting = !isPaid && !isExpired;
  // Vencido por reloj LOCAL sin veredicto del proveedor: el pago pudo entrar
  // en el último segundo o el banco tardar más que la gracia (Nequi y
  // Bancolombia confirman 30-120 s después del escaneo). El cajero conserva
  // «Verificar pago» (HALLAZGO AA). Tras expired/rejected/cancelled del
  // proveedor no se ofrece: ya no hay nada que consultar.
  const canVerifyExpired = isExpired && !isPaid && !providerTerminal;

  /**
   * Fuerza una consulta manual del estado del pago («Ya pague» mientras se
   * espera; «Verificar pago» en el estado vencido).
   */
  const handleManualCheck = async (): Promise<void> => {
    const poller = pollerRef.current;
    if (!poller) return;
    // Pulsación DENTRO de la gracia de Z con el poller vivo (HALLAZGO AC,
    // F2C-R11): la gracia se cancela aquí mismo. Si siguiera armada y venciera
    // con la consulta en vuelo, su stop() descartaría el `paid` que el cajero
    // PIDIÓ a mano sin onPaid ni aviso. Cancelada, la pulsación es la consulta
    // única de AA: checkNow() se suma a la consulta en vuelo, esa respuesta se
    // honra, y Z se cumple igual porque el finally para el poller al terminar.
    const inGrace = canVerifyExpired && graceTimerRef.current !== null;
    if (inGrace && graceTimerRef.current !== null) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
    // En el estado vencido la consulta es UNA (con el poller ya parado tras la
    // gracia, o vivo dentro de ella): se consulta y se vuelve a parar. Sin esto
    // «Verificar pago» reanudaría el polling ~24 min (maxAttempts), que es lo
    // que Z retiró. Mientras se espera («Ya pague» tras W) sí se reanuda.
    const oneShot = canVerifyExpired && (inGrace || !poller.isRunning);
    setChecking(true);
    setVerifyFailed(false);
    oneShotCheckRef.current = oneShot;
    // Una consulta pedida a mano siempre se honra (AD): mientras esté en
    // vuelo, la gracia de Z no para el poller; lo hace el finally de abajo.
    manualChecksInFlightRef.current += 1;
    try {
      // Poller muerto (maxAttempts): «Ya pague» lo reinicia en vez de ser un
      // no-op silencioso (HALLAZGO W). start() ya lanza la primera consulta y
      // checkNow() se suma a ella (guard de en vuelo, HALLAZGO V).
      if (!poller.isRunning) {
        poller.start();
      }
      await poller.checkNow();
    } finally {
      oneShotCheckRef.current = false;
      manualChecksInFlightRef.current = Math.max(0, manualChecksInFlightRef.current - 1);
      // Sin pago (paid ya lo paró y disparó onPaid): el poller vuelve a
      // dormir; el cajero puede pulsar otra vez.
      if (oneShot && !paidHandledRef.current) poller.stop();
      // La gracia venció durante esta consulta (AD): el stop() que difirió
      // se aplica ahora, con la respuesta ya procesada y sin pago.
      const stopAfterManual = stopAfterManualRef.current && manualChecksInFlightRef.current === 0;
      if (stopAfterManual) {
        stopAfterManualRef.current = false;
        if (!paidHandledRef.current) poller.stop();
      }
      setChecking(false);
    }
  };

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

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
              {/* Un texto por veredicto (QA-5, cierre): el cajero debe saber si
                  el banco rechazó, si se canceló o si solo venció el tiempo. */}
              <p className="text-lg font-semibold text-red-700 dark:text-red-300">
                {status === 'rejected'
                  ? 'Pago rechazado por el proveedor'
                  : status === 'cancelled'
                    ? 'Pago cancelado'
                    : 'El tiempo ha expirado'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {canVerifyExpired
                  ? 'Si el cliente ya pagó, pulse «Verificar pago»; si no, solicite un nuevo código QR.'
                  : 'Solicita un nuevo codigo QR para reintentar el pago.'}
              </p>
              {canVerifyExpired && verifyFailed && (
                <p className="flex items-center gap-1.5 text-center text-sm text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  No se pudo verificar el pago; pulse «Verificar pago» para reintentar.
                </p>
              )}
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
              {hasDeadline && (
                <div className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-300">
                  <Clock className="h-4 w-4" />
                  <span>Expira en {formatCountdown(remaining)}</span>
                </div>
              )}
              {extraControl}
              {verifyFailed && (
                <p className="flex items-center gap-1.5 text-center text-sm text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  No se pudo verificar el pago; pulse «Ya pague» para reintentar.
                </p>
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

          {/* «Ya pague» mientras se espera; «Verificar pago» vencido por reloj
              local sin veredicto del proveedor (canVerifyExpired, HALLAZGO AA). */}
          {isWaiting || canVerifyExpired ? (
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
              ) : isWaiting ? (
                'Ya pague'
              ) : (
                'Verificar pago'
              )}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default QrPaymentDialog;
