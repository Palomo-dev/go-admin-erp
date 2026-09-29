/**
 * Detector de estabilidad por tiempo (docs/design/PRODUCTOS-POR-PESO-BASCULA.md
 * §2.6 punto 5 y §2.9 «Inestable»): una lectura es estable cuando la báscula
 * no marca movimiento y el peso se mantiene dentro de UNA división durante
 * `stable_ms` (500 ms por defecto). La bandera de la báscula sola no basta:
 * muchos indicadores dicen «ST» apenas el valor deja de moverse un instante.
 *
 * Puro: el tiempo entra como número (ms), así se prueba sin temporizadores.
 */

export interface OpcionesEstabilidad {
  estableMs: number;
  /** Tolerancia: una división de la báscula (p. ej. 0,005 kg). */
  division: number;
}

/** División por defecto: la última cifra de los decimales (3 → 0,001). */
export function divisionPorDefecto(decimales: number): number {
  const d = Math.max(0, Math.min(4, Math.trunc(Number(decimales) || 0)));
  return 1 / 10 ** d;
}

export class DetectorEstabilidad {
  private referencia: number | null = null;
  private desde = 0;
  private readonly estableMs: number;
  private readonly division: number;

  constructor({ estableMs, division }: OpcionesEstabilidad) {
    this.estableMs = Math.max(0, Number(estableMs) || 0);
    this.division = Math.max(0, Number(division) || 0);
  }

  /**
   * Alimenta una lectura y dice si ya está estable.
   * @param peso peso de la trama (null = la trama no trae peso)
   * @param estableBascula lo que dice la báscula (ST, S S, sin bit de movimiento)
   * @param ahoraMs reloj en milisegundos
   */
  alimentar(peso: number | null, estableBascula: boolean, ahoraMs: number): boolean {
    if (peso === null || !Number.isFinite(peso) || !estableBascula) {
      this.referencia = null;
      return false;
    }
    // Margen de coma flotante: 0,740 − 0,735 = 0,00500000000000006.
    const tolerancia = this.division + 1e-9;
    if (this.referencia === null || Math.abs(peso - this.referencia) > tolerancia) {
      this.referencia = peso;
      this.desde = ahoraMs;
    }
    return ahoraMs - this.desde >= this.estableMs;
  }

  /** Milisegundos que lleva la lectura quieta (0 si no hay referencia). */
  quietoDesde(ahoraMs: number): number {
    return this.referencia === null ? 0 : Math.max(0, ahoraMs - this.desde);
  }

  reiniciar(): void {
    this.referencia = null;
    this.desde = 0;
  }
}
