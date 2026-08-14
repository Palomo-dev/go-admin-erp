/**
 * Polling de estado de QR desde el cliente.
 * Consulta periodicamente el endpoint de estado y notifica cambios.
 * Uso client-side (usa fetch).
 */

/** Estados de pago posibles reportados por el poller. */
export type QrPaymentStatus = 'pending' | 'paid' | 'expired' | 'rejected' | 'cancelled';

/** Opciones de configuracion del poller. */
export interface QrPollerOptions {
  /** Referencia de la sesion QR. */
  reference: string;
  /** ID de la organizacion. */
  organizationId: number;
  /** Intervalo de polling en ms (default 3000). */
  intervalMs?: number;
  /** Numero maximo de intentos (default 100). */
  maxAttempts?: number;
  /** Callback cuando el estado cambia. */
  onStatusChange?: (status: QrPaymentStatus) => void;
  /** Callback cuando el pago se confirma. */
  onPaid?: () => void;
  /** Callback cuando la sesion expira. */
  onExpired?: () => void;
  /** Callback ante errores. */
  onError?: (error: Error) => void;
}

/** Estados terminales que detienen el polling. */
const TERMINAL_STATUSES = ['paid', 'expired', 'rejected', 'cancelled'];

/** Umbral de intentos para iniciar backoff exponencial. */
const BACKOFF_THRESHOLD = 5;

/** Intervalo maximo tras backoff (15s). */
const MAX_INTERVAL_MS = 15000;

/**
 * Poller de estado de QR.
 * Consulta el endpoint de estado cada intervalo y aplica backoff exponencial
 * despues de 5 intentos (duplica el intervalo, max 15s).
 */
export class QrPoller {
  private readonly reference: string;

  private readonly organizationId: number;

  private baseIntervalMs: number;

  private readonly maxAttempts: number;

  private readonly onStatusChange?: (status: QrPaymentStatus) => void;

  private readonly onPaid?: () => void;

  private readonly onExpired?: () => void;

  private readonly onError?: (error: Error) => void;

  private currentIntervalMs: number;

  private attempts = 0;

  private lastStatus: QrPaymentStatus | null = null;

  private timerId: ReturnType<typeof setTimeout> | null = null;

  private running = false;

  constructor(options: QrPollerOptions) {
    this.reference = options.reference;
    this.organizationId = options.organizationId;
    this.baseIntervalMs = options.intervalMs ?? 3000;
    this.currentIntervalMs = this.baseIntervalMs;
    this.maxAttempts = options.maxAttempts ?? 100;
    this.onStatusChange = options.onStatusChange;
    this.onPaid = options.onPaid;
    this.onExpired = options.onExpired;
    this.onError = options.onError;
  }

  /** Indica si el poller esta activo. */
  get isRunning(): boolean {
    return this.running;
  }

  /** Inicia el polling. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.attempts = 0;
    this.currentIntervalMs = this.baseIntervalMs;
    this.lastStatus = null;
    // Ejecutar inmediatamente la primera consulta
    void this.poll();
  }

  /** Detiene el polling. */
  stop(): void {
    this.running = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Fuerza una consulta inmediata del estado sin esperar al proximo intervalo.
   * Cancela el timer pendiente y ejecuta poll() de inmediato.
   * @returns Promise que resuelve al terminar la consulta
   */
  async checkNow(): Promise<void> {
    if (!this.running) return;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    await this.poll();
  }

  /** Ejecuta una consulta de estado y programa la siguiente. */
  private async poll(): Promise<void> {
    if (!this.running) return;

    this.attempts += 1;

    if (this.attempts > this.maxAttempts) {
      this.running = false;
      this.onError?.(new Error(`Poller alcanzó el maximo de intentos (${this.maxAttempts})`));
      return;
    }

    try {
      const url = `/api/integrations/qr/status?reference=${encodeURIComponent(this.reference)}&organizationId=${this.organizationId}`;
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`Respuesta HTTP ${res.status}`);
      }

      const payload = (await res.json()) as { status?: string };
      const rawStatus = payload.status ?? 'unknown';
      const status = (TERMINAL_STATUSES.includes(rawStatus) ? rawStatus : 'pending') as QrPaymentStatus;

      // Notificar cambio de estado
      if (status !== this.lastStatus) {
        this.lastStatus = status;
        this.onStatusChange?.(status);
      }

      // Estados terminales
      if (status === 'paid') {
        this.stop();
        this.onPaid?.();
        return;
      }

      if (status === 'expired') {
        this.stop();
        this.onExpired?.();
        return;
      }

      if (TERMINAL_STATUSES.includes(status)) {
        this.stop();
        return;
      }

      // Backoff exponencial despues del umbral
      if (this.attempts >= BACKOFF_THRESHOLD) {
        this.currentIntervalMs = Math.min(this.currentIntervalMs * 2, MAX_INTERVAL_MS);
      }
    } catch (err) {
      this.onError?.(err instanceof Error ? err : new Error(String(err)));
    }

    // Programar siguiente consulta
    if (this.running) {
      this.timerId = setTimeout(() => {
        void this.poll();
      }, this.currentIntervalMs);
    }
  }
}
