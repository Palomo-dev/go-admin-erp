/**
 * Plan del cierre de ejercicio, el mismo que aplica `fn_cierre_ejercicio`.
 *
 * Cada cuenta de resultado (clases 4, 5, 6 y 7) se cancela contra 3605
 * (utilidad del ejercicio). Si el neto es pérdida, ese saldo deudor de 3605
 * pasa a 3610. El plan no toca cuentas de balance.
 */

export const CUENTA_UTILIDAD = '3605';
export const CUENTA_PERDIDA = '3610';

export interface SaldoResultado {
  codigo: string;
  debito: number;
  credito: number;
}

export interface AsientoCierre {
  debito: string;
  credito: string;
  valor: number;
  clave: string;
}

export interface PlanCierre {
  asientos: AsientoCierre[];
  /** Crédito − débito de las clases de resultado. Positivo es utilidad. */
  resultado: number;
  cuentaResultado: typeof CUENTA_UTILIDAD | typeof CUENTA_PERDIDA;
}

export function esCuentaDeResultado(codigo: string): boolean {
  const clase = codigo.trim().charAt(0);
  return clase === '4' || clase === '5' || clase === '6' || clase === '7';
}

export function planCierreEjercicio(saldos: SaldoResultado[], anio: number): PlanCierre {
  const asientos: AsientoCierre[] = [];
  let resultado = 0;
  const vistos = new Set<string>();

  for (const saldo of saldos) {
    if (!esCuentaDeResultado(saldo.codigo) || vistos.has(saldo.codigo)) continue;
    vistos.add(saldo.codigo);
    const neto = saldo.debito - saldo.credito;
    resultado += saldo.credito - saldo.debito;
    if (Math.abs(neto) < 0.01) continue;
    if (neto > 0) {
      asientos.push({
        debito: CUENTA_UTILIDAD,
        credito: saldo.codigo,
        valor: neto,
        clave: `cierre-ejercicio:${anio}:${saldo.codigo}`,
      });
    } else {
      asientos.push({
        debito: saldo.codigo,
        credito: CUENTA_UTILIDAD,
        valor: -neto,
        clave: `cierre-ejercicio:${anio}:${saldo.codigo}`,
      });
    }
  }

  if (resultado < -0.01) {
    asientos.push({
      debito: CUENTA_PERDIDA,
      credito: CUENTA_UTILIDAD,
      valor: -resultado,
      clave: `cierre-ejercicio:${anio}:resultado`,
    });
  }

  return {
    asientos,
    resultado,
    cuentaResultado: resultado < -0.01 ? CUENTA_PERDIDA : CUENTA_UTILIDAD,
  };
}

/**
 * La primera clave es la base. Si ya hay un cierre de esa cuenta, la
 * siguiente es base:2, base:3… Un cierre repetido no reutiliza la clave:
 * cancela solo el saldo que sigue abierto.
 */
export function claveCierreLibre(base: string, ocupadas: ReadonlySet<string>): string {
  if (!ocupadas.has(base)) return base;
  let n = 2;
  while (ocupadas.has(`${base}:${n}`)) {
    n += 1;
    if (n > 12) throw new Error('cierre_reintentos');
  }
  return `${base}:${n}`;
}

export interface ReubicacionResultado {
  debito: string;
  credito: string;
  valor: number;
}

/**
 * Después de cancelar las cuentas de resultado contra 3605.
 * utilidad3605 es crédito menos débito. perdida3610 es débito menos crédito.
 * El neto del año es utilidad3605 − perdida3610.
 */
export function reubicarResultado(
  utilidad3605: number,
  perdida3610: number,
): ReubicacionResultado | null {
  const neto = utilidad3605 - perdida3610;
  if (neto >= -0.01) {
    if (perdida3610 > 0.01) {
      return { debito: CUENTA_UTILIDAD, credito: CUENTA_PERDIDA, valor: perdida3610 };
    }
    return null;
  }
  if (utilidad3605 > 0.01) {
    return { debito: CUENTA_UTILIDAD, credito: CUENTA_PERDIDA, valor: utilidad3605 };
  }
  if (utilidad3605 < -0.01) {
    return { debito: CUENTA_PERDIDA, credito: CUENTA_UTILIDAD, valor: -utilidad3605 };
  }
  return null;
}
