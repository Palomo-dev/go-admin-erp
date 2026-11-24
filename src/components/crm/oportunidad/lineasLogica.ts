/**
 * Líneas de la oportunidad (productos y servicios, hospedaje del PMS y
 * conceptos libres) y sus totales: el cálculo ÚNICO (regla dura 7) que usan el
 * formulario en página, «Calificar → crear oportunidad» (uno y en lote), la
 * pestaña «Líneas» del detalle y «Ganar» (Figma 1764:134618 «Oportunidad con
 * productos y servicios»).
 *
 * - Un producto con variantes guarda SIEMPRE la variante (`product_id` del
 *   hijo); sus modificadores van en `modifiers` y su extra ya está sumado en
 *   `unit_price` (24 × $ 74.500 = variante $ 65.000 + extras). No mueven stock.
 * - Un servicio guarda su configuración por tipo en `service_config`.
 * - El hospedaje es por TIPO de habitación con fechas, huéspedes y plan; la
 *   habitación concreta se asigna al ganar.
 * - Totales: subtotal (Σ cantidad × precio), impuestos de cada producto
 *   (la tarifa de sus impuestos, sin retenciones) y total. El hospedaje y los
 *   conceptos no llevan impuesto aquí (los pone la cotización o la factura).
 *
 * `total_price` es GENERATED en la base y nunca se envía. Sin React.
 */
import { parsearMonto } from '@/components/crm/kit/camposCrm';
import { esRetencion } from '@/lib/services/taxResolverCore';
import type { ImpuestoProductoApi, OportunidadDetalleApi } from './apiOportunidades';

export const TIPOS_SERVICIO = ['standard', 'membership', 'session_pack', 'class', 'course', 'appointment'] as const;
export type TipoServicio = (typeof TIPOS_SERVICIO)[number];

/** Paquete de sesiones y curso se venden, pero aún no hay saldo de sesiones ni cohortes (Figma: «Modelo nuevo»). */
export const SERVICIOS_MODELO_NUEVO: readonly TipoServicio[] = ['session_pack', 'course'];

export function tipoServicio(v: unknown): TipoServicio | null {
  return (TIPOS_SERVICIO as readonly string[]).includes(String(v)) ? (v as TipoServicio) : null;
}

export interface ModificadorLinea {
  modifier_id: number;
  group_id?: number;
  name: string;
  group_name?: string;
  extra_price: number;
}

export interface LineaProducto {
  id?: string;
  product_id: number;
  nombre?: string | null;
  sku?: string | null;
  /** «M · Azul»: valores de la variante elegida. */
  variante?: string | null;
  quantity: number;
  /** Precio de la variante + extras de los modificadores. */
  unit_price: number;
  modifiers?: ModificadorLinea[];
  /** Servicio (`products.product_type = 'service'`). */
  es_servicio?: boolean;
  tipo_servicio?: TipoServicio | null;
  service_config?: Record<string, unknown>;
  notes?: string | null;
  controla_stock?: boolean | null;
  /** Suma de las tarifas de sus impuestos, en % (IVA 19 % → 19). */
  tasa_impuesto?: number;
}

export interface LineaEspacio {
  id?: string;
  /** Habitación concreta (opcional: se asigna al ganar). */
  space_id?: string | null;
  space_type_id?: string | null;
  /** Nombre del tipo («Suite junior») o de la habitación. */
  nombre?: string | null;
  nights: number;
  unit_price: number;
  checkin_date?: string | null;
  checkout_date?: string | null;
  adults?: number | null;
  children?: number | null;
  rate_plan?: string | null;
  /** Sucursal del hospedaje (la reserva se crea en ella al ganar). */
  branch_id?: number | null;
  /** Habitaciones libres del tipo en esas fechas (aviso en la fila; no se guarda). */
  disponibles?: number | null;
  total_tipo?: number | null;
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
const redondear = (x: number) => Math.round(x * 100) / 100;

export function subtotal(cantidad: number, precio: number): number {
  return n(cantidad) * n(precio);
}

/** Subtotal de las tres clases de líneas (antes de impuestos). El formulario anterior lo calcula igual, con esta función. */
export function totalLineas(l: { products: readonly { quantity: number; unit_price: number }[]; spaces: readonly { nights: number; unit_price: number }[]; custom: readonly { quantity: number; unit_price: number }[] }): number {
  return (
    l.products.reduce((s, x) => s + subtotal(x.quantity, x.unit_price), 0) +
    l.spaces.reduce((s, x) => s + subtotal(x.nights, x.unit_price), 0) +
    l.custom.reduce((s, x) => s + subtotal(x.quantity, x.unit_price), 0)
  );
}

export interface TotalesLineas {
  subtotal: number;
  impuestos: number;
  total: number;
  /** Tarifa única de los productos con impuesto (19), o null si hay varias o ninguna. */
  tasaUnica: number | null;
}

/** Subtotal, impuestos de cada producto y total (Figma «TotalesLineas»). */
export function totalesLineas(l: Lineas): TotalesLineas {
  const sub = totalLineas(l);
  const impuestos = l.products.reduce((s, x) => s + subtotal(x.quantity, x.unit_price) * (n(x.tasa_impuesto) / 100), 0);
  const tasas = [...new Set(l.products.map((x) => n(x.tasa_impuesto)).filter((x) => x > 0))];
  return { subtotal: redondear(sub), impuestos: redondear(impuestos), total: redondear(sub + impuestos), tasaUnica: tasas.length === 1 ? tasas[0] : null };
}

export function cantidadLineas(l: Lineas): number {
  return l.products.length + l.spaces.length + l.custom.length;
}

/** Filtros de la lista única (Figma 16: «Todas · Productos · Servicios · Hospedaje · Conceptos»). */
export const FILTROS_LINEAS = ['todas', 'productos', 'servicios', 'hospedaje', 'conceptos'] as const;
export type FiltroLineas = (typeof FILTROS_LINEAS)[number];

export function conteoFiltros(l: Lineas): Record<FiltroLineas, number> {
  const servicios = l.products.filter((x) => x.es_servicio).length;
  return { todas: cantidadLineas(l), productos: l.products.length - servicios, servicios, hospedaje: l.spaces.length, conceptos: l.custom.length };
}

/** Suma de las tarifas de los impuestos activos del producto, sin retenciones. */
export function tasaDeImpuestos(rel: readonly { organization_taxes: ImpuestoProductoApi | ImpuestoProductoApi[] | null }[] | null | undefined): number {
  let tasa = 0;
  for (const r of rel ?? []) {
    const f = Array.isArray(r.organization_taxes) ? r.organization_taxes[0] : r.organization_taxes;
    if (!f || f.is_active === false) continue;
    if (!esRetencion(f as Parameters<typeof esRetencion>[0])) tasa += n(f.rate);
  }
  return Math.round(tasa * 10000) / 10000;
}

function modificadoresDe(v: unknown): ModificadorLinea[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((m) => m as Record<string, unknown>)
    .filter((m) => Number.isInteger(Number(m.modifier_id)) && Number(m.modifier_id) > 0)
    .map((m) => ({
      modifier_id: Number(m.modifier_id),
      ...(m.group_id ? { group_id: Number(m.group_id) } : {}),
      name: String(m.name ?? ''),
      ...(m.group_name ? { group_name: String(m.group_name) } : {}),
      extra_price: n(m.extra_price),
    }));
}

/** «M · Azul» desde `variant_data`. */
export function textoVariante(data: Record<string, string> | null | undefined): string | null {
  const valores = Object.values(data ?? {}).filter((x) => typeof x === 'string' && x.trim() !== '');
  return valores.length ? valores.join(' · ') : null;
}

export function lineasDesdeApi(op: Pick<OportunidadDetalleApi, 'opportunity_products' | 'opportunity_spaces' | 'opportunity_custom_lines'> | null | undefined): Lineas {
  if (!op) return LINEAS_VACIAS;
  const porAlta = <T extends { created_at?: string | null }>(a: T, b: T) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
  return {
    products: [...(op.opportunity_products ?? [])].sort(porAlta).map((x) => ({
      id: x.id,
      product_id: x.product_id,
      nombre: x.producto?.name ?? null,
      sku: x.producto?.sku ?? null,
      variante: textoVariante(x.producto?.variant_data),
      quantity: n(x.quantity) || 1,
      unit_price: n(x.unit_price),
      modifiers: modificadoresDe(x.modifiers),
      es_servicio: x.producto?.product_type === 'service',
      tipo_servicio: tipoServicio(x.producto?.service_type) ?? (x.producto?.product_type === 'service' ? 'standard' : null),
      service_config: x.service_config && typeof x.service_config === 'object' ? x.service_config : {},
      notes: x.notes ?? null,
      controla_stock: x.producto?.track_stock ?? null,
      tasa_impuesto: tasaDeImpuestos(x.producto?.product_tax_relations),
    })),
    spaces: [...(op.opportunity_spaces ?? [])].sort(porAlta).map((x) => ({
      id: x.id,
      space_id: x.space_id ?? null,
      space_type_id: x.space_type_id ?? null,
      nombre: x.tipo?.name ?? x.espacio?.label ?? null,
      nights: n(x.nights) || 1,
      unit_price: n(x.unit_price),
      checkin_date: x.checkin_date ?? null,
      checkout_date: x.checkout_date ?? null,
      adults: x.adults ?? null,
      children: x.children ?? null,
      rate_plan: x.rate_plan ?? null,
      branch_id: x.branch_id ?? x.espacio?.branch_id ?? null,
    })),
    custom: [...(op.opportunity_custom_lines ?? [])].sort(porAlta).map((x) => ({ id: x.id, concept: x.concept, quantity: n(x.quantity) || 1, unit_price: n(x.unit_price) })),
  };
}

/** Líneas válidas para el servidor: producto u hospedaje elegido, concepto con texto, cantidades > 0. */
export function lineasValidas(l: Lineas): boolean {
  return (
    l.products.every((x) => x.product_id > 0 && x.quantity > 0 && x.unit_price >= 0) &&
    l.spaces.every((x) => (!!x.space_id || !!x.space_type_id) && x.nights > 0 && x.unit_price >= 0 && !x.checkin_date === !x.checkout_date) &&
    l.custom.every((x) => x.concept.trim() !== '' && x.quantity > 0 && x.unit_price >= 0)
  );
}

/**
 * Cuerpo de líneas de `POST`/`PATCH /api/crm/opportunities` y de calificar:
 * con `id` las que ya existían (la RPC actualiza por diferencia y borra las
 * que faltan). `sinIds`: copia (duplicar, plantilla del lote).
 */
export function cuerpoLineas(l: Lineas, opciones: { sinIds?: boolean } = {}) {
  const id = (x: { id?: string }) => (x.id && !opciones.sinIds ? { id: x.id } : {});
  return {
    products: l.products.map((x) => ({
      ...id(x),
      product_id: x.product_id,
      quantity: x.quantity,
      unit_price: x.unit_price,
      ...(x.modifiers && x.modifiers.length ? { modifiers: x.modifiers } : {}),
      ...(x.service_config && Object.keys(x.service_config).length ? { service_config: x.service_config } : {}),
      ...(x.notes && x.notes.trim() ? { notes: x.notes.trim() } : {}),
    })),
    spaces: l.spaces.map((x) => ({
      ...id(x),
      ...(x.space_id ? { space_id: x.space_id } : {}),
      ...(x.space_type_id ? { space_type_id: x.space_type_id } : {}),
      nights: x.nights,
      unit_price: x.unit_price,
      ...(x.checkin_date && x.checkout_date ? { checkin_date: x.checkin_date, checkout_date: x.checkout_date } : {}),
      ...(x.adults !== null && x.adults !== undefined ? { adults: x.adults } : {}),
      ...(x.children !== null && x.children !== undefined ? { children: x.children } : {}),
      ...(x.rate_plan ? { rate_plan: x.rate_plan } : {}),
      ...(x.branch_id ? { branch_id: x.branch_id } : {}),
    })),
    custom_lines: l.custom.map((x) => ({ ...id(x), concept: x.concept.trim(), quantity: x.quantity, unit_price: x.unit_price })),
  };
}

/** Plantilla del lote: mismas líneas para cada lead, sin hospedaje (fechas y huéspedes son por cliente). */
export function lineasParaLote(l: Lineas): Lineas {
  return { products: l.products, spaces: [], custom: l.custom };
}

/** Extras de los modificadores de una línea. */
export function extraModificadores(mods: readonly ModificadorLinea[] | undefined): number {
  return (mods ?? []).reduce((s, m) => s + n(m.extra_price), 0);
}

/** Agrega una línea; si ya está la misma variante con los mismos modificadores y configuración, suma la cantidad. */
export function agregarProducto(l: Lineas, nueva: LineaProducto): Lineas {
  const firma = (x: LineaProducto) => JSON.stringify([x.product_id, (x.modifiers ?? []).map((m) => m.modifier_id).sort((a, b) => a - b), x.service_config ?? {}]);
  const i = l.products.findIndex((x) => firma(x) === firma(nueva));
  if (i < 0) return { ...l, products: [...l.products, nueva] };
  return { ...l, products: l.products.map((x, j) => (j === i ? { ...x, quantity: x.quantity + nueva.quantity } : x)) };
}

/** Faltante de stock de una línea en la sucursal que factura (solo productos que controlan stock). */
export function faltanteStock(linea: Pick<LineaProducto, 'quantity' | 'controla_stock'>, disponible: number | null | undefined): number {
  if (linea.controla_stock !== true || disponible === null || disponible === undefined) return 0;
  return Math.max(0, n(linea.quantity) - Math.max(0, n(disponible)));
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
