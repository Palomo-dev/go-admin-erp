/**
 * Una sola convención para la conciliación bancaria:
 *
 *   diferencia = saldo en libros - saldo del extracto
 *
 * Es la expresión de la columna generada `bank_reconciliations.difference`, que
 * nadie escribe. Libros 120 y extracto 100 da +20; libros 100 y extracto 120 da
 * -20. `fn_conciliacion_cerrar` valida lo mismo en el servidor: aquí solo se
 * calcula para mostrarlo.
 *
 * Módulo hoja: sin Supabase ni React.
 */

/** Por debajo de medio centavo no hay diferencia. La misma tolerancia de la RPC. */
export const TOLERANCIA_DIFERENCIA = 0.005;

export type ValorNumerico = number | string | null | undefined;

/** Número o `null`. El 0 es un dato: un saldo en cero no es un saldo que falta. */
export function aNumero(valor: ValorNumerico): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export interface ItemConciliado {
  amount: number;
  is_matched: boolean;
  /** El movimiento del banco trae el signo real. */
  bank_transactions?: { amount: ValorNumerico } | null;
}

/**
 * Importe con signo: `amount` > 0 entra a la cuenta, < 0 sale. El importe del
 * item solo cuenta si no hay movimiento, porque los que crea el extracto guardan
 * `abs(valor)` y un retiro sumaría como entrada.
 */
export function importeItem(item: ItemConciliado): number {
  return aNumero(item.bank_transactions?.amount) ?? item.amount;
}

export function totalConciliado(items: readonly ItemConciliado[]): number {
  return items.filter((i) => i.is_matched).reduce((suma, i) => suma + importeItem(i), 0);
}

export function saldoEnLibros(saldoInicial: number, items: readonly ItemConciliado[]): number {
  return saldoInicial + totalConciliado(items);
}

/** `null` sin saldo del extracto: la diferencia se desconoce, no es cero. */
export function diferenciaConciliacion(libros: number, extracto: number | null): number | null {
  return extracto === null ? null : libros - extracto;
}

export function esCero(valor: number): boolean {
  return Math.abs(valor) < TOLERANCIA_DIFERENCIA;
}

export type SentidoDiferencia = 'sinDiferencia' | 'librosMayor' | 'extractoMayor';

export function sentidoDiferencia(diferencia: number): SentidoDiferencia {
  if (esCero(diferencia)) return 'sinDiferencia';
  return diferencia > 0 ? 'librosMayor' : 'extractoMayor';
}

export interface PlanCierre {
  diferencia: number;
  /** Lo que las partidas traídas no explican: es lo que queda como partida nueva. */
  partidaNueva: number;
  exigeMotivo: boolean;
  creaPartida: boolean;
}

/** Qué hará el cierre. Se calcula igual en `fn_conciliacion_cerrar`. */
export function planCierre(libros: number, extracto: number, traidas: number): PlanCierre {
  const diferencia = libros - extracto;
  const partidaNueva = diferencia - traidas;
  const creaPartida = !esCero(partidaNueva);
  return { diferencia, partidaNueva, creaPartida, exigeMotivo: !esCero(diferencia) || creaPartida };
}

const ERRORES_CIERRE = [
  'motivo_obligatorio',
  'motivo_largo',
  'conciliacion_ya_cerrada',
  'conciliacion_cerrada',
  'conciliacion_anterior_abierta',
  'conciliacion_no_encontrada',
  'falta_saldo_extracto',
  'partida_ya_resuelta',
  'partida_no_encontrada',
  'partida_de_otra_conciliacion',
  'movimiento_ajeno',
  'sin_permiso',
] as const;

export type ErrorCierre = (typeof ERRORES_CIERRE)[number] | 'desconocido';

/** El código que levanta la RPC, para traducirlo en la pantalla. */
export function errorCierre(error: unknown): ErrorCierre {
  const mensaje =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  return ERRORES_CIERRE.find((codigo) => mensaje.includes(codigo)) ?? 'desconocido';
}
