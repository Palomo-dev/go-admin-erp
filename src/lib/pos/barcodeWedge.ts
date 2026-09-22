/**
 * Detector de lector de códigos de barras «keyboard wedge» (USB/Bluetooth que
 * se presenta como teclado). Un lector escribe el código completo en una
 * ráfaga (unos pocos ms entre teclas) y remata con Enter (o Tab). Una persona
 * no teclea así: la separación entre teclas de un cajero rápido supera los
 * 80 ms. Con ese criterio se distingue un escaneo de una búsqueda escrita a
 * mano y el POS puede agregar el producto al carrito sin ningún clic.
 *
 * Es lógica pura (sin DOM) para poder probarla: el hook
 * `useHardwareBarcodeScanner` la conecta a `keydown`.
 */

export interface BarcodeWedgeOptions {
  /** Longitud mínima para considerar que la ráfaga es un código. */
  minLength?: number;
  /** Separación máxima entre teclas (ms) para seguir dentro de la ráfaga. */
  maxGapMs?: number;
  /**
   * Silencio tras la última tecla (ms) a partir del cual una ráfaga larga se
   * da por terminada aunque el lector no envíe Enter ni Tab. Solo aplica a
   * ráfagas de al menos `idleMinLength` caracteres.
   */
  idleMs?: number;
  idleMinLength?: number;
}

export interface WedgeKey {
  /** `KeyboardEvent.key`. */
  key: string;
  /** Marca de tiempo en ms (performance.now o Date.now). */
  at: number;
  /** Con Ctrl/Alt/Meta pulsados nunca es un escaneo. */
  withModifier?: boolean;
}

export type WedgeResult =
  | { type: 'none' }
  /** Tecla de remate recibida: `code` es el escaneo completo. */
  | { type: 'scan'; code: string; terminator: 'Enter' | 'Tab' };

export const DEFAULT_WEDGE_OPTIONS: Required<BarcodeWedgeOptions> = {
  minLength: 4,
  maxGapMs: 80,
  idleMs: 150,
  idleMinLength: 8,
};

export class BarcodeWedgeDetector {
  private readonly opts: Required<BarcodeWedgeOptions>;
  private buffer = '';
  private lastAt = -Infinity;

  constructor(options: BarcodeWedgeOptions = {}) {
    this.opts = { ...DEFAULT_WEDGE_OPTIONS, ...options };
  }

  /** Texto acumulado de la ráfaga en curso (para limpiarlo del campo que lo recibió). */
  get pending(): string {
    return this.buffer;
  }

  reset(): void {
    this.buffer = '';
    this.lastAt = -Infinity;
  }

  /**
   * Procesa una tecla. Devuelve `scan` cuando Enter/Tab cierra una ráfaga
   * válida; en ese caso el llamador debe cancelar la tecla (para que el
   * Enter no dispare un formulario ni el Tab mueva el foco).
   */
  push(k: WedgeKey): WedgeResult {
    if (k.withModifier) {
      this.reset();
      return { type: 'none' };
    }
    if (k.key === 'Enter' || k.key === 'Tab') {
      const code = this.buffer;
      const fresh = k.at - this.lastAt <= this.opts.maxGapMs;
      this.reset();
      if (fresh && code.length >= this.opts.minLength) {
        return { type: 'scan', code, terminator: k.key };
      }
      return { type: 'none' };
    }
    // Solo caracteres imprimibles; Shift, flechas, etc. no cuentan ni rompen la ráfaga.
    if (k.key.length !== 1) return { type: 'none' };
    if (k.at - this.lastAt > this.opts.maxGapMs) this.buffer = '';
    this.buffer += k.key;
    this.lastAt = k.at;
    return { type: 'none' };
  }

  /**
   * Llamar tras `idleMs` de silencio: si la ráfaga es larga y el lector no
   * envió remate, se toma como escaneo. Devuelve el código o `null`.
   */
  flushIdle(now: number): string | null {
    const code = this.buffer;
    if (
      code.length >= this.opts.idleMinLength &&
      now - this.lastAt >= this.opts.idleMs
    ) {
      this.reset();
      return code;
    }
    return null;
  }

  get idleMs(): number {
    return this.opts.idleMs;
  }
}
