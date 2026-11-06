/**
 * Alta de auxiliares en la misma fila del plan de cuentas. Módulo hoja, sin
 * Supabase ni React.
 *
 * Decisión del Contador (2026-11-06): en línea solo se crean auxiliares de 8
 * dígitos, debajo de una subcuenta que ya exista. Las demás cuentas se crean con
 * «Nueva cuenta». El servidor (`fn_plan_crear_auxiliar`) repite estas reglas:
 * aquí solo deciden qué se muestra.
 */
import { siguienteCodigo } from './pucJerarquia';
import type { NodoPlan } from './planCuentasVista';

export interface CuentaDePlan {
  account_code: string;
  parent_code: string | null;
  es_movimiento?: boolean | null;
  is_active?: boolean | null;
}

export interface SaldoCuenta {
  saldo: number;
  movimientos: number;
}

/** Solo una subcuenta activa (6 dígitos) admite «+ Auxiliar». */
export function puedeCrearAuxiliar(cuenta: Pick<CuentaDePlan, 'account_code' | 'is_active'>): boolean {
  return /^[0-9]{6}$/.test(cuenta.account_code) && cuenta.is_active !== false;
}

/** Primer auxiliar libre de la subcuenta. Null si ya no quedan códigos. */
export function siguienteAuxiliar(padre: string, existentes: readonly string[]): string | null {
  return siguienteCodigo(padre, existentes);
}

export type ErrorCodigoAuxiliar = 'forma' | 'prefijo' | 'cero';

export function validarCodigoAuxiliar(padre: string, codigo: string): ErrorCodigoAuxiliar | null {
  if (!/^[0-9]{8}$/.test(codigo)) return 'forma';
  if (!codigo.startsWith(padre)) return 'prefijo';
  if (codigo.endsWith('00')) return 'cero';
  return null;
}

/**
 * Qué le pasa a la subcuenta al crear el auxiliar.
 * - `normal`: ya era de título, no cambia nada.
 * - `pasa_a_titulo`: era de movimiento y sin saldo; deja de recibir movimientos.
 * - `con_saldo`: además tiene saldo, que se traslada con un asiento.
 */
export type SituacionPadre = 'normal' | 'pasa_a_titulo' | 'con_saldo';

export function situacionPadre(
  padre: Pick<CuentaDePlan, 'es_movimiento'>,
  saldoPropio: number,
): SituacionPadre {
  if (padre.es_movimiento !== true) return 'normal';
  return Math.abs(saldoPropio) >= 0.01 ? 'con_saldo' : 'pasa_a_titulo';
}

/**
 * Saldo de cada cuenta sumando las que cuelgan de ella por prefijo. Una cuenta
 * de título suma a sus hijas, y también lo que le quedó propio de antes.
 */
export function saldosAcumulados(saldos: ReadonlyMap<string, SaldoCuenta>): Map<string, number> {
  const salida = new Map<string, number>();
  for (const [codigo, { saldo }] of saldos) {
    for (let largo = 1; largo <= codigo.length; largo++) {
      const prefijo = codigo.slice(0, largo);
      salida.set(prefijo, (salida.get(prefijo) ?? 0) + saldo);
    }
  }
  return salida;
}

export interface FilaVisible<T> {
  nodo: NodoPlan<T>;
  nivel: number;
}

/** Aplana el árbol según las ramas abiertas. `todo` abre todas (búsqueda). */
export function filasVisibles<T extends CuentaDePlan>(
  arbol: readonly NodoPlan<T>[],
  abiertos: ReadonlySet<string>,
  todo = false,
): FilaVisible<T>[] {
  const salida: FilaVisible<T>[] = [];
  const recorrer = (nodos: readonly NodoPlan<T>[], nivel: number) => {
    for (const nodo of nodos) {
      salida.push({ nodo, nivel });
      if (todo || abiertos.has(nodo.cuenta.account_code)) recorrer(nodo.children, nivel + 1);
    }
  };
  recorrer(arbol, 0);
  return salida;
}

/** Última fila visible de la rama del padre: el alta nace justo después. */
export function indiceAltaEn<T extends CuentaDePlan>(filas: readonly FilaVisible<T>[], padre: string): number {
  let ultimo = -1;
  filas.forEach((fila, i) => {
    const codigo = fila.nodo.cuenta.account_code;
    if (codigo === padre || codigo.startsWith(padre)) ultimo = i;
  });
  return ultimo;
}

/** Plan después de guardar: sin recargar, para no mover el árbol ni el scroll. */
export function planConAuxiliar<T extends CuentaDePlan>(cuentas: readonly T[], padre: string, nueva: T): T[] {
  const salida = cuentas.map((c) => (c.account_code === padre ? { ...c, es_movimiento: false } : c));
  salida.push(nueva);
  return salida.sort((a, b) => a.account_code.localeCompare(b.account_code));
}

/** Saldos después de guardar: el trasladado pasa de la subcuenta al auxiliar. */
export function saldosConAuxiliar(
  saldos: ReadonlyMap<string, SaldoCuenta>,
  padre: string,
  codigo: string,
  trasladado: number,
): Map<string, SaldoCuenta> {
  const salida = new Map(saldos);
  if (Math.abs(trasladado) < 0.01) return salida;
  const previo = salida.get(padre);
  salida.set(padre, { saldo: 0, movimientos: previo?.movimientos ?? 0 });
  salida.set(codigo, { saldo: trasladado, movimientos: 1 });
  return salida;
}

export type ErrorAlta =
  | { tipo: 'ocupado'; siguiente: string | null }
  | { tipo: 'saldo'; saldo: number }
  | { tipo: 'codigo' | 'padre' | 'nombre' | 'periodo' | 'tercero' | 'permiso' | 'sinCodigo' }
  | { tipo: 'otro'; texto: string };

/** Traduce el error de `fn_plan_crear_auxiliar` a lo que dice la fila. */
export function interpretarErrorAlta(error: unknown): ErrorAlta {
  const texto = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error ?? '');
  const ocupado = texto.match(/CODIGO_OCUPADO:\s*([0-9]*)/);
  if (ocupado) return { tipo: 'ocupado', siguiente: ocupado[1] || null };
  const saldo = texto.match(/PADRE_CON_SALDO:\s*(-?[0-9.]+)/);
  if (saldo) return { tipo: 'saldo', saldo: Number(saldo[1]) };
  if (texto.includes('CODIGO_INVALIDO')) return { tipo: 'codigo' };
  if (texto.includes('PADRE_INVALIDO')) return { tipo: 'padre' };
  if (texto.includes('NOMBRE_')) return { tipo: 'nombre' };
  if (texto.includes('PERIODO_CERRADO') || texto.includes('periodo')) return { tipo: 'periodo' };
  if (texto.includes('TERCERO_')) return { tipo: 'tercero' };
  if (texto.includes('SIN_PERMISO') || texto.includes('Acceso denegado')) return { tipo: 'permiso' };
  if (texto.includes('SIN_CODIGO_LIBRE')) return { tipo: 'sinCodigo' };
  return { tipo: 'otro', texto };
}
