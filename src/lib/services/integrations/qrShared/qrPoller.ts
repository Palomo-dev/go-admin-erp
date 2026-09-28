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

  /**
   * Generación de la ejecución actual: sube en cada start(). Una consulta en
   * vuelo de una ejecución anterior (stop() + start() con el fetch pendiente)
   * no debe entregar su resultado a la nueva.
   */
  private generation = 0;

  /**
   * Consulta en vuelo (HALLAZGO V, F2C-R8): `checkNow()` mientras un poll()
   * sigue esperando respuesta NO abre otro. Sin esto quedaban DOS cadenas de
   * polling (cada una reprograma su propio timer): doble de fetch por
   * intervalo y `maxAttempts` agotado en la mitad de tiempo.
   */
  private inFlight: Promise<void> | null = null;

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
    this.generation += 1;
    this.attempts = 0;
    this.currentIntervalMs = this.baseIntervalMs;
    this.lastStatus = null;
    // Ejecutar inmediatamente la primera consulta
    void this.runPoll();
  }

  /** Detiene el polling. */
  stop(): void {
    this.running = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    // La consulta en vuelo (si la hay) ya no vale: poll() descarta su
    // respuesta (`alive()` es false). Se suelta para que el start() siguiente
    // registre la SUYA y checkNow() se sume a la nueva, no a la muerta.
    this.inFlight = null;
  }

  /**
   * Fuerza una consulta inmediata del estado sin esperar al proximo intervalo.
   * Cancela el timer pendiente y ejecuta poll() de inmediato.
   * @returns Promise que resuelve al terminar la consulta
   */
  async checkNow(): Promise<void> {
    if (!this.running) return;
    // Ya hay una consulta esperando respuesta: se devuelve ESA. La respuesta
    // que está por llegar es tan fresca como la que se pediría ahora.
    if (this.inFlight) return this.inFlight;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    await this.runPoll();
  }

  /**
   * Lanza una consulta (poll) y la registra como «en vuelo» hasta que termina
   * (con o sin error) para que checkNow() se sume a ella en vez de duplicarla.
   *
   * Reentrada (HALLAZGO Y, F2C-R9): `poll()` corre SÍNCRONAMENTE hasta su
   * primer await, y en la rama de maxAttempts no hay ninguno: `onError` se
   * dispara dentro de la propia llamada. Si el consumidor reinicia desde ahí
   * (`start()` en `onError`), el `runPoll()` anidado ya registró SU consulta
   * en `inFlight` (con el fetch nuevo); asignar la nuestra después la
   * pisaría con una promesa ya resuelta cuyo `finally` deja `inFlight` en
   * null con una consulta en vuelo, y el siguiente `checkNow()` abriría la
   * segunda cadena que V eliminó. Por eso solo se registra si nadie lo hizo
   * en la misma generación: `inFlight` sigue vacío y `generation` no cambió.
   */
  private runPoll(): Promise<void> {
    if (!this.running) return Promise.resolve();
    const generation = this.generation;
    const run = this.poll().finally(() => {
      if (this.inFlight === run) this.inFlight = null;
    });
    if (this.inFlight === null && this.generation === generation) this.inFlight = run;
    return run;
  }

  /** Ejecuta una consulta de estado y programa la siguiente. */
  private async poll(): Promise<void> {
    const generation = this.generation;
    /** ¿Sigue vigente esta consulta? false tras stop() o tras un start() posterior. */
    const alive = (): boolean => this.running && this.generation === generation;

    this.attempts += 1;

    if (this.attempts > this.maxAttempts) {
      this.running = false;
      this.onError?.(new Error(`Poller alcanzó el maximo de intentos (${this.maxAttempts})`));
      return;
    }

    try {
      const url = `/api/integrations/qr/status?reference=${encodeURIComponent(this.reference)}&organizationId=${this.organizationId}`;
      const res = await fetch(url);
      // stop() durante el fetch (Cancelar del cajero, cierre del cobro): la
      // respuesta en vuelo se descarta. Sin esto un `paid` tardío disparaba
      // onPaid con el diálogo ya cerrado y CheckoutDialog registraba el pago
      // del QR abandonado, incluso en la venta SIGUIENTE (F2C-R7-1).
      if (!alive()) return;

      if (!res.ok) {
        throw new Error(`Respuesta HTTP ${res.status}`);
      }

      const payload = (await res.json()) as { status?: string };
      // Segundo await: el cuerpo también puede llegar después de stop().
      if (!alive()) return;
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
      // Parado mientras la consulta estaba en vuelo: ni error ni reintento.
      if (!alive()) return;
      this.onError?.(err instanceof Error ? err : new Error(String(err)));
    }

    // Programar siguiente consulta
    if (alive()) {
      this.timerId = setTimeout(() => {
        void this.runPoll();
      }, this.currentIntervalMs);
    }
  }
}
