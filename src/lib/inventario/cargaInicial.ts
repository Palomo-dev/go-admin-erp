/**
 * Carga inicial de inventario y el crédito del ajuste de ganancia.
 *
 * El débito es el auxiliar de la sede bajo 1435 (por ejemplo 14350501).
 * Nunca 1405. El saldo inicial acredita 3105. Un sobrante real acredita
 * 42959501 (auxiliar de 4295, que es título), clave `ingresos_diversos`, configurable. 4250 es de reintegros de
 * periodos anteriores: ningún flujo de inventario la usa. La compra sin
 * orden no genera asiento aquí: va a la factura de compra.
 */

import { clasificarProductoRestaurante, type ProductoClasificable } from '@/lib/finanzas/clasificacionInventarioRestaurante';

export const CUENTA_INVENTARIO_COMERCIO = '1435';
export const CUENTA_SALDO_INICIAL = '3105';
export const CUENTA_DIVERSOS = '42959501';
/** 4250 no entra en inventario. Se nombra para que las pruebas lo vigilen. */
export const CUENTA_RECUPERACIONES = '4250';

/** Por encima de este monto el ajuste pide confirmación, salvo que la org lo cambie. */
export const UMBRAL_CONFIRMACION_AJUSTE = 5_000_000;

/** Una organización más nueva que esto confirma el ajuste con una nota. */
export const DIAS_ORG_NUEVA = 30;

export const RUTA_FACTURA_COMPRA = '/app/inventario/facturas-compra/nuevo';
export const RUTA_IMPORTAR_SALDO_INICIAL = '/app/inventario/productos/importar?motivo=saldo_inicial';
export const RUTA_CARGA_MANUAL = '/app/inventario/stock?entrada=saldo_inicial';

export function rutaConteo(ajusteId: number): string {
  return `/app/inventario/ajustes/${ajusteId}`;
}

export interface LineaAsientoCarga {
  cuenta: string;
  debito: number;
  credito: number;
}

export interface AsientoCargaInicial {
  total: number;
  lineas: LineaAsientoCarga[];
}

/** Auxiliar bajo 1435. Una cuenta configurada que no empiece por 1435 no se usa. */
export function cuentaInventarioPorTipo(_typeId: number | null | undefined, configurada?: string | null): string {
  const propia = configurada?.trim() ?? '';
  if (propia.startsWith('1435')) return propia;
  return CUENTA_INVENTARIO_COMERCIO;
}

/** Auxiliar de insumos de cocina (140505xx, 8 dígitos). 1405 y 140505 (títulos) nunca. */
function esAuxiliarInsumos(cuenta: string): boolean {
  return /^140505\d{2}$/.test(cuenta);
}

function cuentaBajo1435(cuenta: string | null | undefined): string {
  const propia = cuenta?.trim() ?? '';
  if (propia.startsWith('1435') || esAuxiliarInsumos(propia)) return propia;
  return CUENTA_INVENTARIO_COMERCIO;
}

/**
 * Cuenta de inventario de la carga inicial de UN producto (QA 25-oct). En hoteles y restaurantes
 * (type_id 1/2) usa la misma clasificación que `fn_clasificar_producto_restaurante`: un insumo de cocina
 * va a 14050501 SOLO si la org tiene la separación activa (`separarInsumos`, de
 * `fn_separacion_insumos_activa`; las orgs existentes quedan desactivadas hasta el OK de Juan). En los
 * demás casos, el auxiliar bajo 1435 de siempre (la configurada si empieza por 1435).
 */
export function cuentaInventarioCargaInicial(p: {
  typeId: number | null | undefined;
  producto?: ProductoClasificable | null;
  configurada?: string | null;
  separarInsumos?: boolean;
}): string {
  const k = clasificarProductoRestaurante(p.typeId, p.producto ?? null, undefined, p.separarInsumos ?? false);
  if (k.clase === 'insumo' && k.cuentaInventario && esAuxiliarInsumos(k.cuentaInventario)) return k.cuentaInventario;
  return cuentaInventarioPorTipo(p.typeId, p.configurada);
}

/** Importe en pesos enteros. 1.000 × 3.800 = 3.800.000. */
export function importeCarga(unidades: number, costo: number): number {
  if (!Number.isFinite(unidades) || !Number.isFinite(costo)) return 0;
  return Math.round(unidades * costo);
}

/**
 * Asiento de un total ya calculado: un débito de inventario y un crédito.
 * El débito queda bajo 1435. Un crédito 4250 no se acepta: pasa a 3105.
 */
export function asientoPorTotal(p: {
  total: number;
  cuentaInventario?: string | null;
  cuentaSaldo?: string | null;
}): AsientoCargaInicial {
  const total = Number.isFinite(p.total) ? Math.round(p.total) : 0;
  const inventario = cuentaBajo1435(p.cuentaInventario);
  const saldoBruto = p.cuentaSaldo?.trim() || CUENTA_SALDO_INICIAL;
  const saldo = saldoBruto.startsWith('4250') ? CUENTA_SALDO_INICIAL : saldoBruto;
  return {
    total,
    lineas: [
      { cuenta: inventario, debito: total, credito: 0 },
      { cuenta: saldo, debito: 0, credito: total },
    ],
  };
}

/** Asiento de la carga: débito 1435 (o su auxiliar) y crédito 3105. */
export function asientoCargaInicial(p: {
  unidades: number;
  costo: number;
  cuentaInventario?: string | null;
  cuentaSaldo?: string | null;
}): AsientoCargaInicial {
  return asientoPorTotal({
    total: importeCarga(p.unidades, p.costo),
    cuentaInventario: p.cuentaInventario,
    cuentaSaldo: p.cuentaSaldo,
  });
}

/** Un sobrante real: débito al auxiliar de 1435 y crédito a 42959501 (ingresos diversos). */
export function asientoSobrante(p: {
  total: number;
  cuentaInventario?: string | null;
  cuentaDiversos?: string | null;
}): AsientoCargaInicial {
  const diversos = p.cuentaDiversos?.trim() || CUENTA_DIVERSOS;
  return asientoPorTotal({
    total: p.total,
    cuentaInventario: p.cuentaInventario,
    cuentaSaldo: diversos.startsWith('4250') ? CUENTA_DIVERSOS : diversos,
  });
}

export type CreditoAjuste = 'saldo_inicial' | 'diversos' | 'factura' | 'correccion';

const MOTIVOS_SALDO = new Set(['saldo_inicial', 'initial_setup']);
const MOTIVOS_FACTURA = new Set(['compra_sin_orden', 'compra sin orden']);
const MOTIVOS_CORRECCION = new Set(['correccion_conteo']);

/** A qué cuenta acredita un ajuste positivo, según el motivo que guarda el documento. */
export function creditoDelAjuste(motivo: string): { tipo: CreditoAjuste; cuenta: string | null } {
  const m = motivo.trim().toLowerCase();
  if (MOTIVOS_SALDO.has(m)) return { tipo: 'saldo_inicial', cuenta: CUENTA_SALDO_INICIAL };
  if (MOTIVOS_FACTURA.has(m)) return { tipo: 'factura', cuenta: null };
  if (MOTIVOS_CORRECCION.has(m)) return { tipo: 'correccion', cuenta: null };
  return { tipo: 'diversos', cuenta: CUENTA_DIVERSOS };
}

/** Entrada positiva de un producto que todavía no tiene movimientos. */
export function debeAvisarSaldoInicial(p: { movimientosPrevios: number; direccion: 'in' | 'out'; cantidad: number }): boolean {
  return p.direccion === 'in' && p.cantidad > 0 && p.movimientosPrevios === 0;
}

/**
 * El sobrante puede ser un error del conteo de este mes. No aplica al saldo
 * inicial ni a la compra, que tiene su propio camino.
 */
export function sugerirCorregirConteo(p: {
  direccion: 'in' | 'out';
  motivo: string;
  tuvoConteoOFaltante: boolean;
}): boolean {
  const m = p.motivo.trim().toLowerCase();
  if (p.direccion !== 'in' || !p.tuvoConteoOFaltante) return false;
  if (MOTIVOS_SALDO.has(m) || MOTIVOS_FACTURA.has(m)) return false;
  return true;
}

/** El disponible ya está por debajo de cero: primero la compra o la producción que faltó. */
export function sugerirCompraPorNegativo(existencia: number | null | undefined): boolean {
  return existencia != null && Number.isFinite(existencia) && existencia < 0;
}

/**
 * Pide confirmación y nota si la organización tiene menos de 30 días o el
 * ajuste alcanza el monto. `creadaEn` vacío no se trata como organización nueva.
 * `umbral` null apaga solo la regla del monto.
 */
export function debeConfirmarAjuste(p: {
  creadaEn: string | null | undefined;
  ahora: Date;
  monto: number;
  umbral: number | null;
}): boolean {
  const porMonto = p.umbral != null && Number.isFinite(p.monto) && p.monto >= p.umbral;
  if (!p.creadaEn) return porMonto;
  const creada = new Date(p.creadaEn);
  if (Number.isNaN(creada.getTime())) return porMonto;
  const dias = (p.ahora.getTime() - creada.getTime()) / 86_400_000;
  return dias < DIAS_ORG_NUEVA || porMonto;
}

/** El costo unitario está en el precio de venta, o por encima. */
export function costoParecePrecio(costo: number | null | undefined, precio: number | null | undefined): boolean {
  return precio != null && precio > 0 && costo != null && Number.isFinite(costo) && costo >= precio;
}
