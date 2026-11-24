/**
 * Listas de precios por cliente (Figma «05 POS y ventas», sección ERP 3018:198730, aprobada el
 * 2026-11-24) — reglas puras del navegador.
 *
 * El precio de lista lo calcula UNA función en la base: `resolve_customer_prices` (migración
 * 20261124213000). Aquí solo se lee su fila y se elige el precio por cantidad con la MISMA regla
 * que `fn_lista_precios_por_cantidad`:
 *
 *   escalón de mayor `min_qty` que se cumpla › si ninguno, `rule_price` (marca › categoría ›
 *   general, ya redondeado) › si tampoco, el precio normal (sin lista).
 *
 * Las promociones se calculan DESPUÉS, sobre el precio que sale de aquí.
 */

export type CanalLista = 'pos' | 'web' | 'documents';
export type FuenteLista = 'item' | 'brand' | 'category' | 'general' | 'no_discount';

export interface EscalonLista {
  min_qty: number;
  price: number;
}

/** Fila de `resolve_customer_prices`, ya con números. */
export interface PrecioClienteFila {
  product_id: number;
  normal_price: number | null;
  list_price: number | null;
  price_list_id: string | null;
  price_list_name: string | null;
  source: FuenteLista | null;
  rule_percent: number | null;
  rule_label: string | null;
  rule_price: number | null;
  tiers: EscalonLista[];
  no_discount: boolean;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const FUENTES: readonly FuenteLista[] = ['item', 'brand', 'category', 'general', 'no_discount'];

/** Normaliza una fila cruda de PostgREST (los `numeric` llegan como texto). */
export function normalizarFilaPrecio(raw: Record<string, unknown>): PrecioClienteFila {
  const tiers = Array.isArray(raw.tiers) ? (raw.tiers as Record<string, unknown>[]) : [];
  const fuente = typeof raw.source === 'string' && (FUENTES as readonly string[]).includes(raw.source) ? (raw.source as FuenteLista) : null;
  return {
    product_id: Number(raw.product_id),
    normal_price: num(raw.normal_price),
    list_price: num(raw.list_price),
    price_list_id: typeof raw.price_list_id === 'string' ? raw.price_list_id : null,
    price_list_name: typeof raw.price_list_name === 'string' ? raw.price_list_name : null,
    source: fuente,
    rule_percent: num(raw.rule_percent),
    rule_label: typeof raw.rule_label === 'string' ? raw.rule_label : null,
    rule_price: num(raw.rule_price),
    tiers: tiers
      .map((t) => ({ min_qty: num(t.min_qty) ?? 0, price: num(t.price) ?? 0 }))
      .filter((t) => t.min_qty > 0)
      .sort((a, b) => a.min_qty - b.min_qty),
    no_discount: raw.no_discount === true,
  };
}

export interface PrecioListaLinea {
  /** Precio unitario de la lista (sin extras de modificadores). */
  precio: number;
  /** Precio normal unitario (sin extras), para tacharlo. Null si el producto no tiene precio vigente. */
  normal: number | null;
  fuente: FuenteLista;
  /** Escalón que aplicó (12 en «12+ a $8.700»). */
  minQty: number | null;
  /** % de la regla (−10). */
  porcentaje: number | null;
  /** Categoría o marca de la regla. */
  etiqueta: string | null;
  listaId: string;
  listaNombre: string;
}

/**
 * Precio de la lista para `cantidad` unidades de la línea, o null si paga el precio normal
 * (sin lista, «sin descuento», o la lista no toca el producto). Misma regla que
 * `fn_lista_precios_por_cantidad` en la base.
 */
export function precioListaPorCantidad(fila: PrecioClienteFila | null | undefined, cantidad: number): PrecioListaLinea | null {
  if (!fila || !fila.price_list_id) return null;
  const q = Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1;
  let escalon: EscalonLista | null = null;
  for (const t of fila.tiers) {
    if (t.min_qty <= q && (!escalon || t.min_qty > escalon.min_qty)) escalon = t;
  }
  const base = { normal: fila.normal_price, listaId: fila.price_list_id, listaNombre: fila.price_list_name ?? '' };
  if (escalon) {
    return { ...base, precio: escalon.price, fuente: 'item', minQty: escalon.min_qty > 1 ? escalon.min_qty : null, porcentaje: null, etiqueta: null };
  }
  if (fila.no_discount || fila.rule_price === null) return null;
  const fuente = fila.source && fila.source !== 'item' ? fila.source : 'general';
  return { ...base, precio: fila.rule_price, fuente, minQty: null, porcentaje: fila.rule_percent, etiqueta: fila.rule_label };
}

/** % de diferencia contra el normal (−10 = 10 % menos; positivo = más caro). Null sin normal. */
export function diferenciaPorcentual(lista: number, normal: number | null): number | null {
  if (normal === null || !(normal > 0)) return null;
  return Math.round(((lista - normal) / normal) * 1000) / 10;
}

// ── Carrito del POS ──────────────────────────────────────────────────────────────────────────

/** Lo que el carrito guarda de la lista en cada línea (campos opcionales de `CartItem`). */
export interface LineaConLista {
  product_id: number;
  quantity: number;
  unit_price: number;
  discount_amount?: number;
  manual_discount_amount?: number | null;
  modifiers?: ReadonlyArray<{ extraPrice?: number | null }>;
  /** Lista con la que va la línea (la marca definitiva la pone el servidor). */
  price_list_id?: string | null;
  price_list_name?: string | null;
  /** Precio normal unitario CON extras: se tacha y se restaura al quitar la lista. */
  list_base_price?: number | null;
  /** Insignia: de dónde salió el precio. */
  price_list_detail?: { fuente: FuenteLista; minQty: number | null; porcentaje: number | null; etiqueta: string | null } | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Aplica (o quita) el precio de lista a las líneas. Puro: devuelve líneas nuevas.
 *   - `precios`: filas de `resolve_customer_prices` por producto (vacío = sin lista).
 *   - `usarPrecioNormal`: el cajero quitó la lista en esta venta (permiso de supervisor).
 * Una línea que ya tenía lista y deja de tenerla vuelve a su `list_base_price`.
 * El descuento manual se topa en el nuevo bruto (el servidor lo exige).
 */
export function aplicarListaALineas<T extends LineaConLista>(
  lineas: readonly T[],
  precios: ReadonlyMap<number, PrecioClienteFila>,
  usarPrecioNormal: boolean,
): T[] {
  return lineas.map((linea) => {
    const extras = (linea.modifiers ?? []).reduce((s, m) => s + (Number(m.extraPrice) || 0), 0);
    const lista = usarPrecioNormal ? null : precioListaPorCantidad(precios.get(linea.product_id), linea.quantity);
    let siguiente: T;
    if (lista) {
      const normalConExtras = lista.normal !== null
        ? r2(lista.normal + extras)
        : (linea.list_base_price ?? (linea.price_list_id ? null : linea.unit_price));
      siguiente = {
        ...linea,
        unit_price: r2(lista.precio + extras),
        price_list_id: lista.listaId,
        price_list_name: lista.listaNombre,
        list_base_price: normalConExtras,
        price_list_detail: { fuente: lista.fuente, minQty: lista.minQty, porcentaje: lista.porcentaje, etiqueta: lista.etiqueta },
      };
    } else if (linea.price_list_id) {
      siguiente = {
        ...linea,
        unit_price: linea.list_base_price ?? linea.unit_price,
        price_list_id: null,
        price_list_name: null,
        list_base_price: null,
        price_list_detail: null,
      };
    } else {
      return linea;
    }
    const bruto = r2(siguiente.quantity * siguiente.unit_price);
    if (siguiente.manual_discount_amount && siguiente.manual_discount_amount > bruto) {
      siguiente = { ...siguiente, manual_discount_amount: bruto, discount_amount: bruto };
    }
    return siguiente;
  });
}

/** Ahorro del carrito contra el precio normal (solo líneas con lista y más baratas). */
export function ahorroPorLista(lineas: readonly LineaConLista[]): number {
  return r2(
    lineas.reduce((s, l) => {
      if (!l.price_list_id || l.list_base_price === null || l.list_base_price === undefined) return s;
      return s + Math.max(0, l.list_base_price - l.unit_price) * l.quantity;
    }, 0),
  );
}

/** Subtotal a precio normal (Figma 07: «Subtotal a precio normal»). */
export function subtotalPrecioNormal(lineas: readonly LineaConLista[]): number {
  return r2(lineas.reduce((s, l) => s + (l.price_list_id && l.list_base_price != null ? l.list_base_price : l.unit_price) * l.quantity, 0));
}
