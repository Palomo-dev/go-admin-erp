/**
 * Líneas y totales de la factura de venta del formulario v2 (docs/design/
 * FACTURA-VENTA-FORMULARIO-V2.md). Puro: sin React ni Supabase.
 *
 * Reglas (las mismas de la base, para que la pantalla muestre lo que se
 * guarda):
 * - `total_line` con `computeLineTotal` (F-42): con impuestos incluidos es el
 *   neto; si no, neto × (1 + suma de tarifas / 100).
 * - Base de la línea: con incluidos, round(neto / (1 + suma / 100), 2), igual
 *   que `fn_factura_venta_guardar` y `fn_recalc_invoice_totals`.
 * - Varios impuestos en una línea (decisión 5): `tax_rate` = suma, `tax_code`
 *   = el del primero, y el detalle viaja en `taxes` (columna
 *   `invoice_items.impuestos_linea`). El impuesto de la línea se reparte entre
 *   sus impuestos en proporción a la tarifa; el último absorbe el centavo.
 * - Total del documento = suma de `total_line`; impuestos = total − subtotal.
 */
import { computeLineTotal } from '@/lib/services/taxResolverCore';
import { redondearCantidad } from '@/lib/inventario/nucleo/costo';
import { redondearCantidadLinea } from '@/lib/services/documentos/cantidadLinea';
import { addPlainDays } from '@/lib/utils/dateDisplay';
import type { DatosFactura, FaltanteStock } from './contratoFacturas';

export interface ImpuestoLineaVenta {
  /** `organization_taxes.id` (o `tx:<código>` en líneas viejas sin id). */
  id: string;
  codigo: string | null;
  nombre: string;
  tarifa: number;
}

export interface LineaVenta {
  clave: string;
  product_id: number | null;
  descripcion: string;
  sku: string | null;
  cantidad: number;
  precio: number;
  descuento: number;
  impuestos: ImpuestoLineaVenta[];
  nota: string | null;
  /** Ítem manual (la descripción se escribe en la línea). */
  manual: boolean;
  serial: boolean;
  controlaStock: boolean;
  /** Existencias en la sucursal al agregarla (aviso; el bloqueo real es al emitir). */
  stock: number | null;
  /** El usuario dejó la línea sin impuesto a propósito («Sin impuesto»). */
  sinImpuestoElegido?: boolean;
  /** Producto por peso o medida: símbolo de la unidad («kg») y decimales de la cantidad (`cantidadLinea.ts`). */
  unidad?: string | null;
  decimalesCantidad?: number | null;
}

const c = (n: number) => Math.round((Number(n) || 0) * 100);
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
/** Cantidades a 3 decimales, la escala de `stock_levels` e `invoice_items.qty` (0,735 kg no se vuelve 0,74). */
const r3 = (n: number) => redondearCantidad(Number(n) || 0);

export function tarifaLinea(l: Pick<LineaVenta, 'impuestos'>): number {
  return Math.round(l.impuestos.reduce((s, i) => s + (Number(i.tarifa) || 0), 0) * 10000) / 10000;
}

export interface LineaCalculada {
  neto: number;
  base: number;
  impuesto: number;
  total_line: number;
  porImpuesto: Array<ImpuestoLineaVenta & { base: number; importe: number }>;
}

export function calcularLineaVenta(l: Pick<LineaVenta, 'cantidad' | 'precio' | 'descuento' | 'impuestos'>, incluido: boolean): LineaCalculada {
  const neto = r2((Number(l.cantidad) || 0) * (Number(l.precio) || 0) - (Number(l.descuento) || 0));
  const tarifa = tarifaLinea(l);
  const total_line = computeLineTotal(Number(l.cantidad) || 0, Number(l.precio) || 0, Number(l.descuento) || 0, tarifa, incluido);
  const base = incluido && tarifa > 0 ? r2(neto / (1 + tarifa / 100)) : neto;
  const impuesto = r2(total_line - base);
  const conTarifa = l.impuestos.filter((i) => Number(i.tarifa) > 0);
  let restante = c(impuesto);
  const porImpuesto = l.impuestos.map((i) => {
    const t = Number(i.tarifa) || 0;
    if (t <= 0) return { ...i, base, importe: 0 };
    const esUltimo = conTarifa[conTarifa.length - 1] === i;
    const parte = esUltimo ? restante : Math.round((c(impuesto) * t) / tarifa);
    restante -= parte;
    return { ...i, base, importe: parte / 100 };
  });
  return { neto, base, impuesto, total_line, porImpuesto };
}

export interface ImpuestoTotal {
  clave: string;
  nombre: string;
  tarifa: number;
  codigo: string | null;
  base: number;
  importe: number;
}

export interface TotalesFacturaVenta {
  subtotal: number;
  impuestos: ImpuestoTotal[];
  impuestoTotal: number;
  total: number;
  /** Líneas que quedan al 0 %. */
  lineasSinImpuesto: number;
}

export function totalesFacturaVenta(lineas: readonly LineaVenta[], incluido: boolean): TotalesFacturaVenta {
  let sub = 0;
  let tot = 0;
  let sinImpuesto = 0;
  const grupos = new Map<string, { nombre: string; tarifa: number; codigo: string | null; base: number; importe: number }>();
  for (const l of lineas) {
    const k = calcularLineaVenta(l, incluido);
    sub += c(k.base);
    tot += c(k.total_line);
    if (tarifaLinea(l) <= 0) sinImpuesto += 1;
    for (const i of k.porImpuesto) {
      if (i.tarifa <= 0) continue;
      const clave = i.id;
      const g = grupos.get(clave) ?? { nombre: i.nombre, tarifa: i.tarifa, codigo: i.codigo, base: 0, importe: 0 };
      g.base += c(i.base);
      g.importe += c(i.importe);
      grupos.set(clave, g);
    }
  }
  return {
    subtotal: sub / 100,
    impuestos: [...grupos.entries()].map(([clave, g]) => ({ clave, nombre: g.nombre, tarifa: g.tarifa, codigo: g.codigo, base: g.base / 100, importe: g.importe / 100 })),
    impuestoTotal: (tot - sub) / 100,
    total: tot / 100,
    lineasSinImpuesto: sinImpuesto,
  };
}

/** Vencimiento = emisión + términos, en días calendario (día plano, sin zona: L5). */
export function vencimientoPorTerminos(emision: string, dias: number | null | undefined): string {
  return emision ? addPlainDays(emision, Math.max(0, Number(dias) || 0)) : '';
}

/** Comisión estimada: sobre el subtotal sin impuestos (o el total si no hay subtotal), como la RPC. */
export function comisionEstimada(metodo: 'percentage' | 'fixed_amount', tasa: number, subtotal: number, total: number): number {
  if (!(tasa > 0)) return 0;
  if (metodo === 'fixed_amount') return r2(tasa);
  return r2(((subtotal > 0 ? subtotal : total) * tasa) / 100);
}

export type ErrorComision = 'porcentajeExcede' | 'montoExcede' | null;
export function errorComision(metodo: 'percentage' | 'fixed_amount', tasa: number, subtotal: number, total: number): ErrorComision {
  if (!(tasa > 0)) return null;
  if (metodo === 'percentage' && tasa > 100) return 'porcentajeExcede';
  if (metodo === 'fixed_amount' && tasa > (subtotal > 0 ? subtotal : total)) return 'montoExcede';
  return null;
}

/** Aviso de stock de una línea en venta (M3): cuánto falta en la sucursal; 0 si alcanza o no controla. */
export function faltanteLinea(l: Pick<LineaVenta, 'controlaStock' | 'stock' | 'cantidad' | 'product_id'>, pedidoTotalDelProducto?: number): number {
  if (!l.product_id || !l.controlaStock || l.stock === null || l.stock === undefined) return 0;
  const pedido = pedidoTotalDelProducto ?? l.cantidad;
  return Math.max(0, r3(pedido - Math.max(0, Number(l.stock) || 0)));
}

/** Cantidad total pedida por producto (una factura puede repetir el producto en varias líneas). */
export function pedidoPorProducto(lineas: readonly Pick<LineaVenta, 'product_id' | 'cantidad'>[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const l of lineas) if (l.product_id) m.set(l.product_id, r3((m.get(l.product_id) ?? 0) + (Number(l.cantidad) || 0)));
  return m;
}

export interface AjusteFaltante {
  clave: string;
  descripcion: string;
  antes: number;
  despues: number;
}

/**
 * «Ajustar y emitir» (decisión 6): deja cada producto en lo disponible que
 * informó la base. Si el producto está en varias líneas, se recorta desde la
 * última; una línea que queda en 0 se quita. Devuelve el cambio para
 * mostrarlo ANTES de aplicarlo.
 */
export function ajustarAFaltantes<L extends Pick<LineaVenta, 'clave' | 'product_id' | 'cantidad' | 'descripcion'>>(
  lineas: readonly L[],
  faltantes: readonly FaltanteStock[],
): { lineas: L[]; cambios: AjusteFaltante[] } {
  const disponible = new Map(faltantes.map((f) => [f.product_id, Math.max(0, Number(f.disponible) || 0)]));
  const pedido = pedidoPorProducto(lineas);
  const exceso = new Map<number, number>();
  for (const [pid, disp] of disponible) exceso.set(pid, Math.max(0, r3((pedido.get(pid) ?? 0) - disp)));
  const cambios: AjusteFaltante[] = [];
  const resultado = [...lineas];
  for (let i = resultado.length - 1; i >= 0; i--) {
    const l = resultado[i];
    if (!l.product_id) continue;
    const sobra = exceso.get(l.product_id) ?? 0;
    if (sobra <= 0) continue;
    const quitar = Math.min(sobra, l.cantidad);
    const despues = r3(l.cantidad - quitar);
    exceso.set(l.product_id, r3(sobra - quitar));
    cambios.unshift({ clave: l.clave, descripcion: l.descripcion, antes: l.cantidad, despues });
    if (despues <= 0) resultado.splice(i, 1);
    else resultado[i] = { ...l, cantidad: despues };
  }
  return { lineas: resultado, cambios };
}

/** Ids de las opciones elegidas + el detalle para el payload. */
export function lineaAItem(
  l: LineaVenta,
  incluido: boolean,
  serialIds?: readonly number[],
): DatosFactura['items'][number] {
  // Peso o medida: a los decimales del producto (el servidor guarda `qty` numeric(12,3)); el total sale de esa cantidad.
  const qty = redondearCantidadLinea(Number(l.cantidad) || 0, { decimalesCantidad: l.decimalesCantidad ?? null });
  const k = calcularLineaVenta({ ...l, cantidad: qty }, incluido);
  const conTarifa = l.impuestos.filter((i) => Number(i.tarifa) > 0);
  const primero = conTarifa[0] ?? l.impuestos[0] ?? null;
  return {
    product_id: l.product_id,
    description: l.descripcion.trim(),
    qty,
    unit_price: Number(l.precio) || 0,
    tax_code: primero?.codigo ?? null,
    tax_rate: tarifaLinea(l),
    tax_included: incluido,
    total_line: k.total_line,
    discount_amount: Number(l.descuento) || 0,
    ...(l.serial && l.product_id ? { serial_ids: [...(serialIds ?? [])] } : {}),
    note: l.nota?.trim() || null,
    ...(conTarifa.length > 1 ? { taxes: conTarifa.map((i) => ({ id: i.id, codigo: i.codigo, nombre: i.nombre, tarifa: Number(i.tarifa) })) } : {}),
  };
}

/** Impuestos aplicados del documento (`invoice_applied_taxes`): los códigos usados en las líneas, con su tarifa. */
export function impuestosAplicados(lineas: readonly LineaVenta[]): { tax_code: string; tax_rate: number }[] {
  const m = new Map<string, number>();
  for (const l of lineas) for (const i of l.impuestos) if (i.codigo && Number(i.tarifa) > 0 && !m.has(i.codigo)) m.set(i.codigo, Number(i.tarifa));
  return [...m.entries()].map(([tax_code, tax_rate]) => ({ tax_code, tax_rate }));
}

/**
 * Impuestos de una línea guardada: el detalle si lo tiene; si no, el
 * impuesto de la organización con ese código (o esa tarifa); si no existe,
 * uno sintético con el código y la tarifa guardados (nada se pierde al editar).
 */
export function impuestosDeLineaGuardada(
  item: { tax_code?: string | null; tax_rate?: number | string | null; impuestos_linea?: unknown },
  opciones: readonly ImpuestoLineaVenta[],
): ImpuestoLineaVenta[] {
  if (Array.isArray(item.impuestos_linea) && item.impuestos_linea.length > 0) {
    return (item.impuestos_linea as Array<Partial<ImpuestoLineaVenta>>).map((d, i) => ({
      id: String(d.id ?? `tx:${d.codigo ?? i}`),
      codigo: d.codigo ?? null,
      nombre: String(d.nombre ?? d.codigo ?? ''),
      tarifa: Number(d.tarifa) || 0,
    }));
  }
  const tarifa = Number(item.tax_rate) || 0;
  const codigo = (item.tax_code ?? '').trim();
  if (codigo) {
    const o = opciones.find((x) => (x.codigo ?? '').toUpperCase() === codigo.toUpperCase() && (tarifa <= 0 || Number(x.tarifa) === tarifa));
    if (o) return [o];
  }
  if (tarifa > 0) {
    const o = opciones.find((x) => Number(x.tarifa) === tarifa);
    if (o) return [o];
    return [{ id: `tx:${codigo || tarifa}`, codigo: codigo || null, nombre: codigo || `${tarifa} %`, tarifa }];
  }
  return [];
}
