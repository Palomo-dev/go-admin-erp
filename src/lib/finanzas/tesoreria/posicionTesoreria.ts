/**
 * Pestaña «Posición» de Cuentas de dinero (la «Tesorería consolidada»,
 * Figma `2335:142203`): cifras y series para la gráfica, sin React.
 *
 * Lee la proyección del servicio de tesorería (`getCashFlowProjection`): días
 * `YYYY-MM-DD` de la organización, entradas (cuentas por cobrar), salidas
 * (cuentas por pagar) y saldo proyectado, que arranca en el saldo consolidado.
 */

export interface EntradaProyeccion {
  date: string;
  inflow: number;
  outflow: number;
  projectedBalance: number;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Días entre dos fechas planas (b − a), sin pasar por la zona del navegador. */
export function diasEntre(a: string, b: string): number {
  if (!DIA.test(a) || !DIA.test(b)) return NaN;
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/**
 * Serie del saldo proyectado para la gráfica: hoy con el saldo consolidado y
 * luego un punto por día con movimiento, ordenados. Las entradas de días ya
 * pasados (vencidos) se suman al punto de hoy.
 */
export function serieSaldoProyectado(
  saldoHoy: number,
  entradas: readonly EntradaProyeccion[],
  hoy: string,
): { fecha: string; saldo: number; entra: number; sale: number }[] {
  const ordenadas = [...entradas].filter((e) => DIA.test(e.date)).sort((a, b) => a.date.localeCompare(b.date));
  const puntos: { fecha: string; saldo: number; entra: number; sale: number }[] = [{ fecha: hoy, saldo: saldoHoy, entra: 0, sale: 0 }];
  for (const e of ordenadas) {
    const ultimo = puntos[puntos.length - 1];
    if (e.date <= hoy || e.date === ultimo.fecha) {
      ultimo.saldo = e.projectedBalance;
      ultimo.entra += e.inflow;
      ultimo.sale += e.outflow;
      continue;
    }
    puntos.push({ fecha: e.date, saldo: e.projectedBalance, entra: e.inflow, sale: e.outflow });
  }
  return puntos;
}

export type IdTramo = '0-30' | '31-60' | '61-90';

/** Tramos del diseño: próximos 30 días, 31 a 60 y 61 a 90, con su saldo al final del tramo. */
export function tramosProyeccion(
  saldoHoy: number,
  entradas: readonly EntradaProyeccion[],
  hoy: string,
): { id: IdTramo; entradas: number; salidas: number; saldoFinal: number }[] {
  const tramos: { id: IdTramo; hasta: number; entradas: number; salidas: number; saldoFinal: number }[] = [
    { id: '0-30', hasta: 30, entradas: 0, salidas: 0, saldoFinal: saldoHoy },
    { id: '31-60', hasta: 60, entradas: 0, salidas: 0, saldoFinal: saldoHoy },
    { id: '61-90', hasta: 90, entradas: 0, salidas: 0, saldoFinal: saldoHoy },
  ];
  let saldo = saldoHoy;
  const ordenadas = [...entradas].filter((e) => DIA.test(e.date)).sort((a, b) => a.date.localeCompare(b.date));
  let i = 0;
  for (const t of tramos) {
    while (i < ordenadas.length && diasEntre(hoy, ordenadas[i].date) <= t.hasta) {
      const e = ordenadas[i];
      t.entradas += e.inflow;
      t.salidas += e.outflow;
      saldo = e.projectedBalance;
      i += 1;
    }
    t.saldoFinal = saldo;
  }
  return tramos.map((x) => ({ id: x.id, entradas: x.entradas, salidas: x.salidas, saldoFinal: x.saldoFinal }));
}

/** Posición por cuenta para la gráfica de barras: de mayor a menor saldo. */
export function barrasPorCuenta<T extends { accountName: string; localBalance: number }>(cuentas: readonly T[]): T[] {
  return [...cuentas].sort((a, b) => b.localBalance - a.localBalance);
}
