/**
 * Jerarquía del PUC por prefijo del código, no por parent_code.
 *
 * Clase 1, grupo 2, cuenta 4, subcuenta 6, auxiliar 8. Un código con guion
 * se lee sin él: 1405-01 es 140501 y cuelga de 1405 si esa cuenta existe.
 * El padre guardado puede estar mal (1405 bajo 11); los reportes no lo usan.
 */

export type PresentacionNiif = 'corriente' | 'no_corriente' | 'segun_plazo';

const CORTES = [1, 2, 4, 6, 8] as const;

const CORRIENTE = new Set(['11', '13', '14', '22', '23', '24', '25', '26', '28']);
const NO_CORRIENTE = new Set(['15', '16', '18', '19', '29']);
const SEGUN_PLAZO = new Set(['12', '17', '21', '27']);

export function codigoNormalizado(codigo: string): string {
  return codigo.replace(/-/g, '').trim();
}

/** Longitudes de ancestro, de la más larga a la más corta. */
export function cortesAncestro(largo: number): number[] {
  const cortes: number[] = CORTES.filter((n) => n < largo);
  if (largo > 8 && largo % 2 === 0) {
    for (let n = largo - 2; n >= 10; n -= 2) cortes.push(n);
  }
  return cortes.sort((a, b) => b - a);
}

/** Prefijos 1/2/4/6/8 (y subauxiliares pares) que existen. El más largo va primero. */
export function ancestrosDe(codigo: string, existentes: ReadonlySet<string>): string[] {
  const normal = codigoNormalizado(codigo);
  const salida: string[] = [];
  for (const corte of cortesAncestro(normal.length)) {
    const prefijo = normal.slice(0, corte);
    if (existentes.has(prefijo)) salida.push(prefijo);
  }
  return salida;
}

export function padrePorPrefijo(codigo: string, existentes: ReadonlySet<string>): string | null {
  return ancestrosDe(codigo, existentes)[0] ?? null;
}

export function cuentasBajoPrefijo(codigo: string, cuentas: readonly string[]): string[] {
  const normal = codigoNormalizado(codigo);
  return cuentas.filter((otra) => {
    const n = codigoNormalizado(otra);
    return n === normal || n.startsWith(normal);
  });
}

export function presentacionDeCodigo(
  codigo: string,
  explicita?: string | null,
): PresentacionNiif | null {
  if (explicita === 'corriente' || explicita === 'no_corriente' || explicita === 'segun_plazo') {
    return explicita;
  }
  const grupo = codigoNormalizado(codigo).slice(0, 2);
  if (CORRIENTE.has(grupo)) return 'corriente';
  if (NO_CORRIENTE.has(grupo)) return 'no_corriente';
  if (SEGUN_PLAZO.has(grupo)) return 'segun_plazo';
  return null;
}

export interface MovimientoCuenta {
  debitos: number;
  creditos: number;
}

/** Suma el movimiento propio de la cuenta y el de todo lo que empieza por su código. */
export function saldoConsolidado(
  codigo: string,
  cuentas: readonly string[],
  propios: ReadonlyMap<string, MovimientoCuenta>,
): MovimientoCuenta {
  return cuentasBajoPrefijo(codigo, cuentas).reduce(
    (suma, cuenta) => {
      const propio = propios.get(cuenta);
      return {
        debitos: suma.debitos + (propio?.debitos ?? 0),
        creditos: suma.creditos + (propio?.creditos ?? 0),
      };
    },
    { debitos: 0, creditos: 0 },
  );
}

/** Cada línea entra una vez: la suma de los saldos propios, no la de los consolidados. */
export function totalPropio(propios: Iterable<MovimientoCuenta>): MovimientoCuenta {
  let debitos = 0;
  let creditos = 0;
  for (const fila of propios) {
    debitos += fila.debitos;
    creditos += fila.creditos;
  }
  return { debitos, creditos };
}
