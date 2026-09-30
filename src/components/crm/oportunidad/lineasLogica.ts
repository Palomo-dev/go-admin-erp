/**
 * Líneas de la oportunidad (productos, espacios del PMS y otros conceptos) y
 * su total: el cálculo ÚNICO (regla dura 7) que usan el formulario en página
 * de la ola 3B y el formulario anterior. Cantidad × precio unitario, sin
 * impuestos: las oportunidades no llevan impuestos (los pone la cotización o
 * la factura). `total_price` es GENERATED en la base y nunca se envía.
 * Sin React.
 */
import { parsearMonto } from '@/components/crm/kit/camposCrm';
import type { OportunidadDetalleApi } from './apiOportunidades';

export interface LineaProducto {
  id?: string;
  product_id: number;
  nombre?: string | null;
  quantity: number;
  unit_price: number;
}

export interface LineaEspacio {
  id?: string;
  space_id: string;
  nombre?: string | null;
  nights: number;
  unit_price: number;
}

export interface LineaConcepto {
  id?: string;
  concept: string;
  quantity: number;
  unit_price: number;
}

export interface Lineas {
  products: LineaProducto[];
  spaces: LineaEspacio[];
  custom: LineaConcepto[];
}

export const LINEAS_VACIAS: Lineas = { products: [], spaces: [], custom: [] };

const n = (v: unknown) => {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

export function subtotal(cantidad: number, precio: number): number {
  return n(cantidad) * n(precio);
}

/** Total de las tres clases de líneas (el formulario anterior lo calcula igual, con esta función). */
export function totalLineas(l: { products: readonly { quantity: number; unit_price: number }[]; spaces: readonly { nights: number; unit_price: number }[]; custom: readonly { quantity: number; unit_price: number }[] }): number {
  return (
    l.products.reduce((s, x) => s + subtotal(x.quantity, x.unit_price), 0) +
    l.spaces.reduce((s, x) => s + subtotal(x.nights, x.unit_price), 0) +
    l.custom.reduce((s, x) => s + subtotal(x.quantity, x.unit_price), 0)
  );
}

export function cantidadLineas(l: Lineas): number {
  return l.products.length + l.spaces.length + l.custom.length;
}

export function lineasDesdeApi(op: Pick<OportunidadDetalleApi, 'opportunity_products' | 'opportunity_spaces' | 'opportunity_custom_lines'> | null | undefined): Lineas {
  if (!op) return LINEAS_VACIAS;
  return {
    products: (op.opportunity_products ?? []).map((x) => ({ id: x.id, product_id: x.product_id, nombre: x.producto?.name ?? null, quantity: n(x.quantity) || 1, unit_price: n(x.unit_price) })),
    spaces: (op.opportunity_spaces ?? []).map((x) => ({ id: x.id, space_id: x.space_id, nombre: x.espacio?.label ?? null, nights: n(x.nights) || 1, unit_price: n(x.unit_price) })),
    custom: (op.opportunity_custom_lines ?? []).map((x) => ({ id: x.id, concept: x.concept, quantity: n(x.quantity) || 1, unit_price: n(x.unit_price) })),
  };
}

/** Líneas válidas para el servidor: producto/espacio elegido, concepto con texto, cantidades > 0. */
export function lineasValidas(l: Lineas): boolean {
  return (
    l.products.every((x) => x.product_id > 0 && x.quantity > 0 && x.unit_price >= 0) &&
    l.spaces.every((x) => !!x.space_id && x.nights > 0 && x.unit_price >= 0) &&
    l.custom.every((x) => x.concept.trim() !== '' && x.quantity > 0 && x.unit_price >= 0)
  );
}

/**
 * Cuerpo de líneas de `POST`/`PATCH /api/crm/opportunities`: con `id` las que
 * ya existían (la RPC actualiza por diferencia y borra las que faltan).
 */
export function cuerpoLineas(l: Lineas) {
  const id = (x: { id?: string }) => (x.id ? { id: x.id } : {});
  return {
    products: l.products.map((x) => ({ ...id(x), product_id: x.product_id, quantity: x.quantity, unit_price: x.unit_price })),
    spaces: l.spaces.map((x) => ({ ...id(x), space_id: x.space_id, nights: x.nights, unit_price: x.unit_price })),
    custom_lines: l.custom.map((x) => ({ ...id(x), concept: x.concept.trim(), quantity: x.quantity, unit_price: x.unit_price })),
  };
}

/** Número de un campo de texto («1.500», «2,5»); vacío o inválido → 0. */
export function numeroDeCampo(texto: string): number {
  const v = parsearMonto(texto);
  return v === null || Number.isNaN(v) ? 0 : v;
}

// ─── Origen y comisión ──────────────────────────────────────────────────────

export const TIPOS_COMISION = ['salesperson', 'intermediation_sale', 'none'] as const;
export type TipoComision = (typeof TIPOS_COMISION)[number];

export interface OrigenComision {
  /** `opportunities.source` (catálogo `LEAD_SOURCES`). */
  source: string;
  vertical_id: string;
  commission_type: TipoComision;
  commission_rate: string;
}

export function origenComisionDesdeApi(op: Pick<OportunidadDetalleApi, 'source' | 'vertical_id' | 'commission_type' | 'commission_rate'> | null | undefined): OrigenComision {
  const tipo = (TIPOS_COMISION as readonly string[]).includes(op?.commission_type ?? '') ? (op!.commission_type as TipoComision) : 'none';
  return { source: op?.source ?? '', vertical_id: op?.vertical_id ?? '', commission_type: tipo, commission_rate: op?.commission_rate !== null && op?.commission_rate !== undefined ? String(op.commission_rate) : '' };
}

/** 0–100 (CHECK de la RPC); sin comisión → 0. */
export function cuerpoOrigenComision(o: OrigenComision) {
  const tasa = Math.min(100, Math.max(0, numeroDeCampo(o.commission_rate)));
  return {
    source: o.source.trim() || null,
    vertical_id: o.vertical_id || null,
    commission_type: tasa > 0 ? o.commission_type : 'none',
    commission_rate: o.commission_type === 'none' ? 0 : tasa,
  };
}
