/**
 * Carga inicial de inventario y el crédito del ajuste de ganancia.
 *
 * El asiento de una carga (a mano, por importación o al crear el producto con
 * stock) es débito al inventario de la sede y crédito a saldos iniciales.
 * 1435 en comercio y el resto de tipos; 1405 en restaurante (tipo 1). No hay
 * un tipo «manufactura»: esa organización deja la cuenta en la configuración
 * contable (`inventario`). El crédito por defecto es 3105 (`saldo_inicial`).
 * Una recuperación (conteo, auditoría, producción o sobrante) acredita 4250.
 * La compra sin orden no genera asiento aquí: va a la factura de compra.
 */

export const CUENTA_INVENTARIO_COMERCIO = '1435';
export const CUENTA_INVENTARIO_RESTAURANTE = '1405';
export const CUENTA_SALDO_INICIAL = '3105';
export const CUENTA_RECUPERACIONES = '4250';

/** Por encima de este monto el ajuste pide confirmación, salvo que la org lo cambie. */
export const UMBRAL_CONFIRMACION_AJUSTE = 5_000_000;

/** Una organización más nueva que esto confirma el ajuste con una nota. */
export const DIAS_ORG_NUEVA = 30;

export const RUTA_FACTURA_COMPRA = '/app/inventario/facturas-compra/nuevo';
export const RUTA_IMPORTAR_SALDO_INICIAL = '/app/inventario/productos/importar?motivo=saldo_inicial';
export const RUTA_CARGA_MANUAL = '/app/inventario/stock?entrada=saldo_inicial';

export interface LineaAsientoCarga {
  cuenta: string;
  debito: number;
  credito: number;
}

export interface AsientoCargaInicial {
  total: number;
  lineas: LineaAsientoCarga[];
}

/**
 * Cuenta de inventario según el tipo de organización. Una cuenta ya configurada
 * gana: es el auxiliar de la sede o la que la organización eligió.
 */
export function cuentaInventarioPorTipo(typeId: number | null | undefined, configurada?: string | null): string {
  const propia = configurada?.trim();
  if (propia) return propia;
  return typeId === 1 ? CUENTA_INVENTARIO_RESTAURANTE : CUENTA_INVENTARIO_COMERCIO;
}

/** Importe en pesos enteros. 1.000 × 3.800 = 3.800.000. */
export function importeCarga(unidades: number, costo: number): number {
  if (!Number.isFinite(unidades) || !Number.isFinite(costo)) return 0;
  return Math.round(unidades * costo);
}

/**
 * Asiento de un total ya calculado: un débito de inventario y un crédito de
 * saldos iniciales. No usa 4250.
 */
export function asientoPorTotal(p: {
  total: number;
  cuentaInventario?: string | null;
  cuentaSaldo?: string | null;
}): AsientoCargaInicial {
  const total = Number.isFinite(p.total) ? Math.round(p.total) : 0;
  const inventario = p.cuentaInventario?.trim() || CUENTA_INVENTARIO_COMERCIO;
  const saldo = p.cuentaSaldo?.trim() || CUENTA_SALDO_INICIAL;
  return {
    total,
    lineas: [
      { cuenta: inventario, debito: total, credito: 0 },
      { cuenta: saldo, debito: 0, credito: total },
    ],
  };
}

/**
 * Asiento de la carga: un débito de inventario y un crédito de saldos iniciales.
 * 1.000 unidades a 3.800 quedan en 3.800.000. No usa 4250.
 */
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

export type CreditoAjuste = 'saldo_inicial' | 'recuperacion' | 'factura';

const MOTIVOS_SALDO = new Set(['saldo_inicial', 'initial_setup']);
const MOTIVOS_FACTURA = new Set(['compra_sin_orden', 'compra sin orden']);
const MOTIVOS_RECUPERACION = new Set([
  'physical_count',
  'audit',
  'production_input',
  'produccion_propia',
  'produccion',
  'sobrante',
]);

/** A qué cuenta acredita un ajuste positivo, según el motivo que guarda el documento. */
export function creditoDelAjuste(motivo: string): { tipo: CreditoAjuste; cuenta: string | null } {
  const m = motivo.trim().toLowerCase();
  if (MOTIVOS_SALDO.has(m)) return { tipo: 'saldo_inicial', cuenta: CUENTA_SALDO_INICIAL };
  if (MOTIVOS_FACTURA.has(m)) return { tipo: 'factura', cuenta: null };
  if (MOTIVOS_RECUPERACION.has(m)) return { tipo: 'recuperacion', cuenta: CUENTA_RECUPERACIONES };
  return { tipo: 'recuperacion', cuenta: CUENTA_RECUPERACIONES };
}

/** Entrada positiva de un producto que todavía no tiene movimientos. */
export function debeAvisarSaldoInicial(p: { movimientosPrevios: number; direccion: 'in' | 'out'; cantidad: number }): boolean {
  return p.direccion === 'in' && p.cantidad > 0 && p.movimientosPrevios === 0;
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
