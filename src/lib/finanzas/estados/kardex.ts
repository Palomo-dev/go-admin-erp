/**
 * Kárdex a costo promedio ponderado. El saldo valorizado de cada sede
 * se compara con el auxiliar 1435 de esa sede, nunca con la 1405.
 */

import type { MovimientoKardex, TipoKardex } from './tipos';
import { pesos, saldoDeudor } from './saldos';
import type { Movimiento } from './tipos';

export function clasificarKardex(source: string, direction: 'in' | 'out'): { tipo: TipoKardex; sentido: 'in' | 'out' } {
  const origen = source.trim().toLowerCase();
  if (origen === 'transfer' || origen === 'transfer_in' || origen === 'transfer_out' || origen === 'traslado') {
    const sentido = origen === 'transfer_out' ? 'out' : origen === 'transfer_in' ? 'in' : direction;
    return { tipo: 'traslado', sentido };
  }
  if (origen === 'adjustment' || origen === 'ajuste' || origen === 'inventory_adjustment') {
    return { tipo: 'ajuste', sentido: direction };
  }
  if (['purchase', 'purchase_order', 'initial', 'return', 'credit_note', 'invoice_void'].includes(origen)) {
    return { tipo: 'entrada', sentido: 'in' };
  }
  if (['sale', 'web_sale', 'invoice_sale', 'mesa_sale', 'folio_item', 'room_consumption'].includes(origen)) {
    return { tipo: 'salida', sentido: 'out' };
  }
  if (origen === 'production' || origen === 'produccion') {
    return { tipo: direction === 'in' ? 'entrada' : 'salida', sentido: direction };
  }
  return { tipo: direction === 'in' ? 'entrada' : 'salida', sentido: direction };
}

export interface FilaKardex {
  productoId: string;
  sucursalId: number;
  fecha: string;
  documento: string;
  tipo: TipoKardex;
  cantidad: number;
  costoUnitario: number;
  saldoCantidad: number;
  saldoValorizado: number;
}

export function valorizarKardex(movimientos: readonly MovimientoKardex[], hasta: string): FilaKardex[] {
  const grupos = new Map<string, MovimientoKardex[]>();
  for (const m of movimientos) {
    if (m.fecha > hasta) continue;
    const clave = `${m.sucursalId}|${m.productoId}`;
    const lista = grupos.get(clave);
    if (lista) lista.push(m);
    else grupos.set(clave, [m]);
  }
  const filas: FilaKardex[] = [];
  for (const lista of grupos.values()) {
    lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden || a.documento.localeCompare(b.documento));
    let cantidad = 0;
    let valor = 0;
    for (const m of lista) {
      const { tipo, sentido } = clasificarKardex(m.source, m.direction);
      const unidades = Math.abs(m.cantidad);
      if (sentido === 'in') {
        valor = pesos(valor + unidades * m.costoUnitario);
        cantidad += unidades;
      } else {
        const promedio = cantidad !== 0 ? valor / cantidad : m.costoUnitario;
        valor = pesos(valor - unidades * promedio);
        cantidad -= unidades;
        if (Math.abs(cantidad) < 1e-9) {
          cantidad = 0;
          valor = 0;
        }
      }
      filas.push({
        productoId: m.productoId,
        sucursalId: m.sucursalId,
        fecha: m.fecha,
        documento: m.documento,
        tipo,
        cantidad: sentido === 'in' ? unidades : -unidades,
        costoUnitario: pesos(m.costoUnitario),
        saldoCantidad: cantidad,
        saldoValorizado: pesos(valor),
      });
    }
  }
  return filas;
}

export function valorKardexPorSede(filas: readonly FilaKardex[]): Map<number, number> {
  const ultimo = new Map<string, FilaKardex>();
  for (const fila of filas) ultimo.set(`${fila.sucursalId}|${fila.productoId}`, fila);
  const sedes = new Map<number, number>();
  for (const fila of ultimo.values()) {
    sedes.set(fila.sucursalId, pesos((sedes.get(fila.sucursalId) ?? 0) + fila.saldoValorizado));
  }
  return sedes;
}

/** Auxiliar de mercancía no fabricada. La 1405 no entra en este saldo. */
export function saldo1435(movs: readonly Movimiento[], hasta: string, sucursalId: number): number {
  return saldoDeudor(movs, hasta, new Set(), (m) => m.cuenta.startsWith('1435') && m.sucursalId === sucursalId);
}
