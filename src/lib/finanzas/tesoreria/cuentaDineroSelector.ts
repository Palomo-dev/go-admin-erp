/**
 * Selector de cuenta de dinero (Tesorería v2, `SelectorCuentaDinero` `997:32996`):
 * primero la caja donde el servidor va a escribir (la abierta de la sucursal,
 * `fn_caja_abierta_para`, según el modo de caja), luego las otras cajas
 * abiertas DESHABILITADAS con su motivo, luego los bancos activos.
 */
import type { CajaDinero } from './cuentasDinero';

export type ValorCuentaDinero = '' | 'caja' | `caja:${number}` | `banco:${number}`;
export type MotivoCuentaDinero = 'otroCajero' | 'otraSucursal';

export interface OpcionCuentaDinero {
  valor: Exclude<ValorCuentaDinero, ''>;
  tipo: 'caja' | 'banco';
  /** Sucursal de la caja (null = caja de todas) o nombre del banco. */
  nombre: string | null;
  /** Esperado de la caja (null con cierre ciego) o saldo en libros del banco. */
  saldo: number | null;
  /** Modo por cajero: es la caja de quien registra. */
  propia: boolean;
  /** Deshabilitada y por qué. */
  motivo: MotivoCuentaDinero | null;
}

export function opcionesCuentaDinero(p: {
  sesionSucursal: number | null;
  cajas: readonly CajaDinero[];
  bancos: readonly { id: number; nombre: string; saldo: number }[];
  modo: 'branch' | 'user';
}): OpcionCuentaDinero[] {
  const salida: OpcionCuentaDinero[] = [];
  if (p.sesionSucursal !== null) {
    const caja = p.cajas.find((c) => c.sesion_id === p.sesionSucursal);
    salida.push({
      valor: 'caja',
      tipo: 'caja',
      nombre: caja?.sucursal?.nombre ?? null,
      saldo: caja ? caja.saldo : null,
      propia: p.modo === 'user',
      motivo: null,
    });
  }
  for (const c of p.cajas) {
    if (c.sesion_id === p.sesionSucursal) continue;
    salida.push({
      valor: `caja:${c.sesion_id}`,
      tipo: 'caja',
      nombre: c.sucursal?.nombre ?? null,
      saldo: c.saldo,
      propia: false,
      motivo: p.modo === 'user' ? 'otroCajero' : 'otraSucursal',
    });
  }
  for (const b of p.bancos) {
    salida.push({ valor: `banco:${b.id}`, tipo: 'banco', nombre: b.nombre, saldo: Number.isFinite(b.saldo) ? b.saldo : null, propia: false, motivo: null });
  }
  return salida;
}
