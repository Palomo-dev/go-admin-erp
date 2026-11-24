/**
 * Precio por volumen («Compra más, paga menos») y filtros por cliente y por marca de las
 * promociones. Módulo PURO y SIN imports.
 *
 * El MISMO archivo, byte a byte, vive en los dos repos:
 *   - ERP:    src/lib/promotions/precioVolumen.ts   (lo usa motorPromociones.ts: POS, mesas, facturas)
 *   - tienda: lib/promociones/precioVolumen.ts      (lo usa lib/promotions.ts: carrito, checkout, /api/orders)
 * Lo vigilan `scripts/verify-copias-erp.mjs` y `scripts/verify-precio-volumen.mjs` en la tienda y
 * `src/lib/promotions/__tests__/precioVolumen.contrato.test.ts` en el ERP. Si cambias algo aquí,
 * copia el archivo tal cual al otro repo. El redondeo NO va aquí: el ERP redondea a centavos y la
 * tienda a pesos, cada uno en su motor, sobre los montos que devuelve este módulo.
 *
 * ─── Reglas del precio por volumen ─────────────────────────────────────────────────────────────
 *  - Escalón: desde `min_quantity` unidades, precio fijo por unidad (`unit_price`) o porcentaje
 *    (`discount_percent`). Gana el escalón más alto alcanzado y se aplica a TODAS las unidades de
 *    las líneas que cuentan juntas (no solo a las que pasan del mínimo).
 *  - Precio fijo: descuento por unidad = precio de la línea − precio del escalón, nunca negativo.
 *    El precio de la línea es el que el llamador ya resolvió (precio normal hoy; mañana el de una
 *    lista de precios por cliente, que se aplica ANTES de las promociones). Si la línea ya está
 *    por debajo del escalón, no hay descuento extra.
 *  - Cómo se cuentan las unidades (`promotions.tiers_count_mode`):
 *      same_product   cada producto aparte; las variantes de un mismo padre suman juntas;
 *      promotion_mix  todo lo que entra en la promoción suma junto (3 cola + 3 limón = 6);
 *      same_variant   cada variante (producto exacto) aparte;
 *      product_group  solo las líneas de un grupo (`promotion_rules.tier_group`); cada grupo
 *                     suma aparte y una línea sin grupo no recibe precio por volumen.
 *    Un valor desconocido o vacío se trata como `promotion_mix` (el valor por defecto de la base).
 *
 * ─── Cliente (segmento y usos por cliente) ─────────────────────────────────────────────────────
 *  - `customer_segment_id`: solo aplica si el cliente identificado pertenece al segmento. En el
 *    POS, el cliente de la venta; en la tienda, el de la SESIÓN, verificado en el servidor. Sin
 *    cliente, no aplica.
 *  - `usage_limit_per_customer`: solo aplica con cliente identificado y menos usos que el límite.
 *
 * ─── Marca ─────────────────────────────────────────────────────────────────────────────────────
 *  - Regla `include_brand` / `exclude_brand` con `brand`: compara con `products.brand` sin
 *    distinguir mayúsculas, tildes ni espacios de sobra. Sin `brand`, la regla antigua: por
 *    `product_id` (producto o su padre).
 */

export type ModoConteoEscalones = 'same_product' | 'promotion_mix' | 'same_variant' | 'product_group';

export const MODOS_CONTEO_ESCALONES: readonly ModoConteoEscalones[] = [
  'same_product',
  'promotion_mix',
  'same_variant',
  'product_group',
];

export const MODO_CONTEO_POR_DEFECTO: ModoConteoEscalones = 'promotion_mix';

/** Fila de `promotion_tiers` como llega de PostgREST (los numeric pueden venir como texto). */
export interface FilaEscalon {
  min_quantity?: number | string | null;
  unit_price?: number | string | null;
  discount_percent?: number | string | null;
  sort_order?: number | string | null;
}

export interface Escalon {
  /** Unidades desde las que aplica (entero ≥ 1). */
  desde: number;
  /** Precio fijo por unidad, o null si el escalón es un porcentaje. */
  precioUnidad: number | null;
  /** Porcentaje (0, 100], o null si el escalón es un precio fijo. */
  porcentaje: number | null;
}

/** Una línea de la cuenta para el cálculo por volumen. */
export interface LineaVolumen {
  producto: number;
  padre?: number | null;
  cantidad: number;
  precio: number;
  /** Grupo de conteo (`tier_group` de la regla que la incluye). Solo `product_group`. */
  grupo?: number | null;
}

export interface ResultadoVolumen {
  /** Descuento SIN redondear de cada línea, en el orden de entrada. */
  porLinea: number[];
  /** Escalón aplicado a cada línea (null = ninguno). */
  escalonPorLinea: Array<Escalon | null>;
  /** Unidades contadas para cada línea (las de su clave de conteo; 0 si no cuenta). */
  unidadesPorLinea: number[];
}

const numero = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export function modoConteo(v: unknown): ModoConteoEscalones {
  return (MODOS_CONTEO_ESCALONES as readonly string[]).includes(String(v))
    ? (v as ModoConteoEscalones)
    : MODO_CONTEO_POR_DEFECTO;
}

/**
 * Escalones válidos, de menor a mayor `desde`. Un escalón sin precio ni porcentaje válido se
 * descarta; si trae los dos, manda el precio fijo. Dos escalones con el mismo `desde`: queda el de
 * menor `sort_order` (y, empatados, el primero de la lista).
 */
export function normalizarEscalones(filas: unknown): Escalon[] {
  if (!Array.isArray(filas)) return [];
  const candidatos: Array<{ e: Escalon; orden: number; i: number }> = [];
  filas.forEach((f, i) => {
    if (!f || typeof f !== 'object') return;
    const fila = f as FilaEscalon;
    const desde = Math.trunc(numero(fila.min_quantity));
    if (!(desde >= 1)) return;
    const precio = numero(fila.unit_price);
    const pct = numero(fila.discount_percent);
    let e: Escalon | null = null;
    if (precio >= 0) e = { desde, precioUnidad: precio, porcentaje: null };
    else if (pct > 0 && pct <= 100) e = { desde, precioUnidad: null, porcentaje: pct };
    if (!e) return;
    const orden = numero(fila.sort_order);
    candidatos.push({ e, orden: Number.isFinite(orden) ? orden : 0, i });
  });
  candidatos.sort((a, b) => a.e.desde - b.e.desde || a.orden - b.orden || a.i - b.i);
  const out: Escalon[] = [];
  for (const c of candidatos) {
    if (out.length > 0 && out[out.length - 1].desde === c.e.desde) continue;
    out.push(c.e);
  }
  return out;
}

/** El escalón más alto alcanzado con `unidades`, o null. */
export function escalonPara(escalones: readonly Escalon[], unidades: number): Escalon | null {
  let mejor: Escalon | null = null;
  for (const e of escalones) if (unidades >= e.desde) mejor = e;
  return mejor;
}

/** El siguiente escalón y cuántas unidades faltan para llegar (para «Agrega 6 más…»). */
export function siguienteEscalon(
  escalones: readonly Escalon[],
  unidades: number,
): { escalon: Escalon; faltan: number } | null {
  for (const e of escalones) if (e.desde > unidades) return { escalon: e, faltan: e.desde - unidades };
  return null;
}

/** Descuento por UNIDAD de un escalón sobre un precio. Nunca negativo ni mayor que el precio. */
export function descuentoUnitario(precio: number, escalon: Escalon | null): number {
  if (!escalon || !(precio > 0)) return 0;
  if (escalon.precioUnidad !== null) return Math.max(0, precio - escalon.precioUnidad);
  if (escalon.porcentaje !== null) return Math.min(precio, (precio * escalon.porcentaje) / 100);
  return 0;
}

/** Precio por unidad con el escalón (para mostrar «$ 9.500 c/u»). */
export function precioConEscalon(precio: number, escalon: Escalon | null): number {
  return Math.max(0, precio - descuentoUnitario(precio, escalon));
}

/** Clave con la que una línea suma unidades. null = no cuenta (product_group sin grupo). */
export function claveConteo(linea: LineaVolumen, modo: ModoConteoEscalones): string | null {
  switch (modo) {
    case 'same_variant':
      return 'v:' + linea.producto;
    case 'same_product':
      return 'p:' + (linea.padre ?? linea.producto);
    case 'product_group':
      return linea.grupo != null && linea.grupo > 0 ? 'g:' + linea.grupo : null;
    default:
      return 'todo';
  }
}

/**
 * Descuento por volumen de cada línea. `lineas` son SOLO las que entran en la promoción (el motor
 * ya aplicó reglas, exclusiones y vigencia).
 */
export function calcularDescuentoVolumen(
  escalones: readonly Escalon[],
  lineas: readonly LineaVolumen[],
  modo: ModoConteoEscalones,
): ResultadoVolumen {
  const porLinea = lineas.map(() => 0);
  const escalonPorLinea: Array<Escalon | null> = lineas.map(() => null);
  const unidadesPorLinea = lineas.map(() => 0);
  if (escalones.length === 0 || lineas.length === 0) return { porLinea, escalonPorLinea, unidadesPorLinea };

  const claves = lineas.map((l) => claveConteo(l, modo));
  const unidades = new Map<string, number>();
  lineas.forEach((l, i) => {
    const k = claves[i];
    const q = Number(l.cantidad);
    if (k === null || !(q > 0)) return;
    unidades.set(k, (unidades.get(k) ?? 0) + q);
  });

  lineas.forEach((l, i) => {
    const k = claves[i];
    if (k === null) return;
    const total = unidades.get(k) ?? 0;
    unidadesPorLinea[i] = total;
    const e = escalonPara(escalones, total);
    escalonPorLinea[i] = e;
    const q = Number(l.cantidad);
    if (!(q > 0)) return;
    porLinea[i] = descuentoUnitario(Number(l.precio), e) * q;
  });
  return { porLinea, escalonPorLinea, unidadesPorLinea };
}

/** Regla de la promoción tal como la necesita este módulo. */
export interface ReglaGrupo {
  rule_type: string;
  product_id?: number | null;
  tier_group?: number | string | null;
}

/**
 * Grupo de conteo de una línea: el `tier_group` de la regla `include_product` del producto exacto
 * o, si no hay, la de su padre. null = sin grupo.
 */
export function grupoDeLinea(reglas: readonly ReglaGrupo[], producto: number, padre?: number | null): number | null {
  const grupoDe = (id: number | null | undefined): number | null => {
    if (id == null) return null;
    for (const r of reglas) {
      if (r.rule_type !== 'include_product' || r.product_id !== id) continue;
      const g = Math.trunc(numero(r.tier_group));
      if (g >= 1) return g;
    }
    return null;
  };
  return grupoDe(producto) ?? grupoDe(padre ?? null);
}

// ── Marca ──────────────────────────────────────────────────────────────────────────────────────

export function normalizarMarca(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * ¿La regla de marca alcanza la línea? Con `brand`, por la marca del producto; sin ella, la regla
 * antigua por `product_id` (el producto o su padre).
 */
export function reglaMarcaCoincide(
  regla: { brand?: string | null; product_id?: number | null },
  linea: { product_id: number; parent_product_id?: number | null; brand?: string | null },
): boolean {
  const marca = normalizarMarca(regla.brand);
  if (marca) return normalizarMarca(linea.brand) === marca;
  const id = regla.product_id;
  return id != null && (id === linea.product_id || (linea.parent_product_id != null && id === linea.parent_product_id));
}

// ── Cliente ────────────────────────────────────────────────────────────────────────────────────

/** Lo que el motor sabe del cliente. Lo arma el servidor; nunca sale del navegador. */
export interface ClientePromocion {
  id: string | null;
  /** Segmentos (ids) a los que pertenece. */
  segmentos: readonly string[];
  /** Usos ya registrados por promoción (`promotion_customer_uses.uses`). */
  usos: Readonly<Record<string, number>>;
}

/** ¿La promoción exige saber quién es el cliente? */
export function promocionRequiereCliente(p: {
  customer_segment_id?: string | null;
  usage_limit_per_customer?: number | string | null;
}): boolean {
  return !!p.customer_segment_id || Math.trunc(numero(p.usage_limit_per_customer)) >= 1;
}

/** Grupo de clientes y usos por cliente. Sin cliente, una promoción que lo exige no aplica. */
export function promocionHabilitadaParaCliente(
  p: { id: string; customer_segment_id?: string | null; usage_limit_per_customer?: number | string | null },
  cliente: ClientePromocion | null | undefined,
): boolean {
  if (!promocionRequiereCliente(p)) return true;
  if (!cliente || !cliente.id) return false;
  if (p.customer_segment_id && !cliente.segmentos.includes(p.customer_segment_id)) return false;
  const limite = Math.trunc(numero(p.usage_limit_per_customer));
  if (limite >= 1 && (cliente.usos[p.id] ?? 0) >= limite) return false;
  return true;
}

// ── Desempate entre promociones ────────────────────────────────────────────────────────────────

/** Lo que el desempate necesita de una promoción. */
export interface PromocionDesempate {
  id: string;
  priority?: number | string | null;
  created_at?: string | null;
}

/**
 * Dos promociones NO combinables compiten por las mismas líneas. Gana la de mayor `priority` (todas
 * en 0 por defecto: no mueve nada); luego, la que MÁS ahorra; si dan el MISMO ahorro, la MÁS
 * RECIENTE por `created_at` (diseño aprobado: «si empatan, gana la más reciente»). Sin fecha, al
 * final; y por último el id, para que el resultado no dependa del orden en que lleguen las filas.
 * Negativo si gana `a`. El POS y la tienda usan esta misma función.
 */
export function compararCompetidoras(
  a: PromocionDesempate,
  ahorroA: number,
  b: PromocionDesempate,
  ahorroB: number,
): number {
  const pa = numero(a.priority);
  const pb = numero(b.priority);
  const prioA = Number.isFinite(pa) ? pa : 0;
  const prioB = Number.isFinite(pb) ? pb : 0;
  if (prioA !== prioB) return prioB - prioA;
  if (ahorroA !== ahorroB) return ahorroB - ahorroA;
  return desempateMasReciente(a, b);
}

/** La más reciente primero (`created_at` descendente); sin fecha, al final; luego el id. */
export function desempateMasReciente(a: PromocionDesempate, b: PromocionDesempate): number {
  const fecha = (v: string | null | undefined): number => {
    const t = v ? new Date(v).getTime() : NaN;
    return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
  };
  const ca = fecha(a.created_at);
  const cb = fecha(b.created_at);
  if (ca !== cb) return ca > cb ? -1 : 1;
  const ia = String(a.id);
  const ib = String(b.id);
  return ia < ib ? -1 : ia > ib ? 1 : 0;
}
