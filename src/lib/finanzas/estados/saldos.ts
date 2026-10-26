/**
 * Saldos a partir de movimientos ya contabilizados. Aquí no hay SQL:
 * la misma función arma el balance, el flujo y el cuadre del kárdex.
 */

import { diaAnterior } from './fechas';
import type { Cuenta, Movimiento, PresentacionNiif } from './tipos';

export function pesos(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  const redondo = Math.round(valor);
  return redondo === 0 ? 0 : redondo;
}

/** El menos unario de cero en JavaScript es −0. Un peso en cero es cero. */
export function negar(valor: number): number {
  return valor === 0 ? 0 : -valor;
}

export function bajo(cuenta: string, prefijos: readonly string[], excepto: readonly string[] = []): boolean {
  if (excepto.some((p) => cuenta.startsWith(p))) return false;
  return prefijos.some((p) => cuenta.startsWith(p));
}

export function claseDe(cuenta: string): string {
  return cuenta.charAt(0);
}

const CONTRAS = ['1399', '1499', '1592', '1596', '1597', '1598', '1599'];

export function esContra(cuenta: string): boolean {
  return CONTRAS.some((p) => cuenta.startsWith(p));
}

const CORRIENTE_DEFECTO = new Set(['11', '13', '14', '22', '23', '24', '25', '26', '28']);
const NO_CORRIENTE_DEFECTO = new Set(['15', '16', '18', '19', '29']);

export function cuentaDe(codigo: string, mapa: Map<string, Cuenta>): Cuenta {
  const conocida = mapa.get(codigo);
  if (conocida) return conocida;
  return {
    codigo,
    nombre: codigo,
    nivel: Math.min(codigo.length, 6),
    naturaleza: null,
    presentacion: null,
    plazoMeses: null,
    esOri: false,
    equivalenteEfectivo: false,
    comportamiento: null,
    esMovimiento: null,
  };
}

export function mapaCuentas(cuentas: readonly Cuenta[]): Map<string, Cuenta> {
  return new Map(cuentas.map((c) => [c.codigo, c]));
}

/**
 * Corriente si la cuenta está marcada, o si el plazo es de 12 meses o menos.
 * Sin marca, el grupo del PUC propone el valor de la plantilla. 11 y 12 con
 * plazo abierto (según plazo, sin meses) no se vuelven corrientes solos:
 * 11 siempre es corriente; 12, 17, 21 y 27 esperan el plazo.
 */
export function esCorriente(cuenta: Cuenta): boolean {
  if (cuenta.codigo.startsWith('11')) return true;
  if (cuenta.presentacion === 'corriente') return true;
  if (cuenta.presentacion === 'no_corriente') return false;
  if (cuenta.plazoMeses != null && cuenta.plazoMeses <= 12) return true;
  if (cuenta.presentacion === 'segun_plazo') return false;
  const grupo = cuenta.codigo.slice(0, 2);
  if (CORRIENTE_DEFECTO.has(grupo)) return true;
  if (NO_CORRIENTE_DEFECTO.has(grupo)) return false;
  return false;
}

export function esEquivalente(cuenta: Cuenta): boolean {
  return cuenta.equivalenteEfectivo && cuenta.codigo.startsWith('12');
}

export function esEfectivo(codigo: string, mapa: Map<string, Cuenta>): boolean {
  if (codigo.startsWith('11')) return true;
  return esEquivalente(cuentaDe(codigo, mapa));
}

/** 51 fija y las comisiones 529505 variables, salvo marca de la organización. La clase 6 es costo variable. */
export function esCostoVariable(cuenta: Cuenta): boolean {
  if (cuenta.codigo.startsWith('6')) return true;
  if (cuenta.comportamiento === 'variable') return true;
  if (cuenta.comportamiento === 'fijo') return false;
  return cuenta.codigo.startsWith('529505');
}

export function esCostoFijo(cuenta: Cuenta): boolean {
  if (!cuenta.codigo.startsWith('5')) return false;
  if (cuenta.codigo.startsWith('6')) return false;
  return !esCostoVariable(cuenta);
}

export function asientosDeCierre(movs: readonly Movimiento[]): Set<number> {
  const resultado = new Set<number>();
  const patrimonio36 = new Set<number>();
  for (const m of movs) {
    const clase = claseDe(m.cuenta);
    if (clase === '4' || clase === '5' || clase === '6' || clase === '7') resultado.add(m.asientoId);
    if (m.cuenta.startsWith('36')) patrimonio36.add(m.asientoId);
  }
  const cierre = new Set<number>();
  for (const id of resultado) {
    if (patrimonio36.has(id)) cierre.add(id);
  }
  return cierre;
}

export interface Corte {
  hasta: string;
  desde?: string;
  excluirCierre?: boolean;
}

export function entra(m: Movimiento, corte: Corte, cierre: ReadonlySet<number>): boolean {
  if (m.fecha > corte.hasta) return false;
  if (corte.desde && m.fecha < corte.desde) return false;
  if (corte.excluirCierre && cierre.has(m.asientoId)) return false;
  return true;
}

export function neto(movs: readonly Movimiento[], corte: Corte, cierre: ReadonlySet<number>, acepta: (m: Movimiento) => boolean, creditoMenosDebito: boolean): number {
  let debitos = 0;
  let creditos = 0;
  for (const m of movs) {
    if (!entra(m, corte, cierre) || !acepta(m)) continue;
    debitos += m.debito;
    creditos += m.credito;
  }
  return pesos(creditoMenosDebito ? creditos - debitos : debitos - creditos);
}

export function sumaCreditos(movs: readonly Movimiento[], corte: Corte, cierre: ReadonlySet<number>, acepta: (m: Movimiento) => boolean): number {
  let total = 0;
  for (const m of movs) {
    if (!entra(m, corte, cierre) || !acepta(m)) continue;
    total += m.credito;
  }
  return pesos(total);
}

export function sumaDebitos(movs: readonly Movimiento[], corte: Corte, cierre: ReadonlySet<number>, acepta: (m: Movimiento) => boolean): number {
  let total = 0;
  for (const m of movs) {
    if (!entra(m, corte, cierre) || !acepta(m)) continue;
    total += m.debito;
  }
  return pesos(total);
}

export function porAsiento(movs: readonly Movimiento[]): Map<number, Movimiento[]> {
  const grupos = new Map<number, Movimiento[]>();
  for (const m of movs) {
    const lista = grupos.get(m.asientoId);
    if (lista) lista.push(m);
    else grupos.set(m.asientoId, [m]);
  }
  return grupos;
}

export function saldoDeudor(movs: readonly Movimiento[], hasta: string, cierre: ReadonlySet<number>, acepta: (m: Movimiento) => boolean): number {
  return neto(movs, { hasta }, cierre, acepta, false);
}

export function saldoAcreedor(movs: readonly Movimiento[], hasta: string, cierre: ReadonlySet<number>, acepta: (m: Movimiento) => boolean): number {
  return neto(movs, { hasta }, cierre, acepta, true);
}

/** Resultado no cerrado a una fecha: clases 4 a 7, con el asiento de cierre incluido. */
export function resultadoNoCerrado(movs: readonly Movimiento[], hasta: string): number {
  return saldoAcreedor(movs, hasta, new Set(), (m) => {
    const clase = claseDe(m.cuenta);
    return clase === '4' || clase === '5' || clase === '6' || clase === '7';
  });
}

/** Utilidad del periodo sin el asiento que la traslada a la 36, para no contarla dos veces. */
export function utilidadPeriodo(movs: readonly Movimiento[], desde: string, hasta: string, cierre: ReadonlySet<number>): number {
  return neto(movs, { desde, hasta, excluirCierre: true }, cierre, (m) => {
    const clase = claseDe(m.cuenta);
    return clase === '4' || clase === '5' || clase === '6' || clase === '7';
  }, true);
}

export function activos(movs: readonly Movimiento[], hasta: string): number {
  return saldoDeudor(movs, hasta, new Set(), (m) => claseDe(m.cuenta) === '1');
}

export function pasivos(movs: readonly Movimiento[], hasta: string): number {
  return saldoAcreedor(movs, hasta, new Set(), (m) => claseDe(m.cuenta) === '2');
}

export function patrimonioContable(movs: readonly Movimiento[], hasta: string): number {
  return pesos(saldoAcreedor(movs, hasta, new Set(), (m) => claseDe(m.cuenta) === '3') + resultadoNoCerrado(movs, hasta));
}

export function apertura(desde: string): string {
  return diaAnterior(desde);
}

export function variacion(actual: number, anterior: number): { variacion: number; porcentaje: number | null } {
  const delta = pesos(actual - anterior);
  if (anterior === 0) return { variacion: delta, porcentaje: null };
  return { variacion: delta, porcentaje: Math.round((delta / anterior) * 10000) / 100 };
}

export function presentarPorDefecto(codigo: string): PresentacionNiif | null {
  const grupo = codigo.slice(0, 2);
  if (CORRIENTE_DEFECTO.has(grupo)) return 'corriente';
  if (NO_CORRIENTE_DEFECTO.has(grupo)) return 'no_corriente';
  if (grupo === '12' || grupo === '17' || grupo === '21' || grupo === '27') return 'segun_plazo';
  return null;
}

export function normalizarMovimientos(movs: readonly Movimiento[]): Movimiento[] {
  return movs.map((m) => ({
    ...m,
    debito: pesos(m.debito),
    credito: pesos(m.credito),
    terceroNit: m.terceroNit || '',
    terceroNombre: m.terceroNombre || '',
    source: m.source || '',
    sucursalId: m.sucursalId ?? null,
    centroId: m.centroId ?? null,
  }));
}
