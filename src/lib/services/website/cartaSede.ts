/**
 * Carta por sede (website V2, ADR-002 D3): contrato y reglas PURAS.
 *
 * Tabla: `website_branch_products` (migración 20261005214525). Por sede, si el
 * producto sale en la web (`is_listed`), su precio SOLO web (`web_price`, NULL
 * = el precio vigente de la sede: `product_branch_prices` o, sin él, el general
 * de `product_prices`) y si está agotado (`is_sold_out`, hasta
 * `sold_out_until` si se fija). Sin fila = el producto sale como en el sitio
 * principal. La tabla NO admite DELETE: «volver a como el principal» escribe
 * la fila neutra (`is_listed` true, `web_price` NULL, `is_sold_out` false).
 *
 * Módulo hoja (solo zod y utilidades de fecha): lo usan el servicio de
 * servidor, el route handler y la pantalla.
 */
import { z } from 'zod';
import { nextPlainDay, plainDateToInstant, previousPlainDay, toPlainDate } from '@/lib/utils/dateCore';

/** Tope de productos por escritura: un solo upsert por lote. */
export const MAX_LOTE_CARTA_SEDE = 2000;
/** Tamaño de página del listado. */
export const TAMANO_PAGINA_CARTA_SEDE = 50;

export const FILTROS_CARTA_SEDE = ['todos', 'personalizados', 'agotados', 'ocultos'] as const;
export type FiltroCartaSede = (typeof FILTROS_CARTA_SEDE)[number];

export const ACCIONES_CATEGORIA = ['mostrar', 'ocultar', 'agotar', 'disponible', 'restablecer'] as const;
export type AccionCategoria = (typeof ACCIONES_CATEGORIA)[number];

/** Ajuste guardado de un producto en una sede. */
export interface AjusteSede {
  is_listed: boolean;
  web_price: number | null;
  is_sold_out: boolean;
  sold_out_until: string | null;
}

/** La fila neutra: idéntica a no tener fila. */
export const AJUSTE_PRINCIPAL: Readonly<AjusteSede> = Object.freeze({
  is_listed: true,
  web_price: null,
  is_sold_out: false,
  sold_out_until: null,
});

/** Cambio parcial de un producto. `restablecer` gana a todo lo demás. */
export interface CambioProducto {
  product_id: number;
  is_listed?: boolean;
  web_price?: number | null;
  is_sold_out?: boolean;
  /** Día `YYYY-MM-DD` (incluido) hasta el que sigue agotado; null = sin fecha. */
  agotado_hasta?: string | null;
  restablecer?: boolean;
}

export interface ProductoCartaSede {
  id: number;
  name: string;
  sku: string;
  category_id: number | null;
  /**
   * Precio vigente de Inventario EN LA SEDE (product_branch_prices) o, si la
   * sede no tiene uno propio, el general (product_prices); null si no hay.
   * Es el placeholder de `web_price`: con `web_price` NULL la web cobra este.
   */
  precio_vigente: number | null;
  /** De dónde salió `precio_vigente`: precio propio de la sede o general. */
  precio_origen?: 'sede' | 'general' | null;
  /** Ajuste guardado de la sede, o null si no hay fila (= como el principal). */
  ajuste: (AjusteSede & { agotado_hasta: string | null; agotado_ahora: boolean }) | null;
}

export interface RespuestaListadoCartaSede {
  productos: ProductoCartaSede[];
  total: number;
  pagina: number;
  tamano: number;
  puedeEditar: boolean;
  /** «Hoy» en la zona de la organización (mínimo de «Agotado hasta»). */
  hoy: string;
}

export interface ResultadoEscrituraCartaSede {
  guardados: number;
}

// ─── Esquemas ────────────────────────────────────────────────────────────────

const idEntero = z.coerce.number().int().positive().max(2_147_483_647);
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const precio = z.number().finite().nonnegative().max(999_999_999_999.99);

export const listadoCartaSedeSchema = z.object({
  branch_id: idEntero,
  category_id: idEntero.optional(),
  q: z.string().trim().max(120).optional(),
  filtro: z.enum(FILTROS_CARTA_SEDE).default('todos'),
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type ListadoCartaSede = z.output<typeof listadoCartaSedeSchema>;

const cambioSchema = z
  .object({
    product_id: idEntero,
    is_listed: z.boolean().optional(),
    web_price: precio.nullable().optional(),
    is_sold_out: z.boolean().optional(),
    agotado_hasta: dia.nullable().optional(),
    restablecer: z.boolean().optional(),
  })
  .strict();

export const escrituraCartaSedeSchema = z.discriminatedUnion('tipo', [
  z
    .object({
      tipo: z.literal('productos'),
      branch_id: idEntero,
      cambios: z.array(cambioSchema).min(1).max(MAX_LOTE_CARTA_SEDE),
    })
    .strict(),
  z
    .object({
      tipo: z.literal('categoria'),
      branch_id: idEntero,
      category_id: idEntero,
      accion: z.enum(ACCIONES_CATEGORIA),
      agotado_hasta: dia.nullable().optional(),
    })
    .strict(),
]);
export type EscrituraCartaSede = z.output<typeof escrituraCartaSedeSchema>;

// ─── Reglas ──────────────────────────────────────────────────────────────────

/** Cambio que aplica una acción de categoría a un producto. */
export function cambioDeAccion(productId: number, accion: AccionCategoria, agotadoHasta?: string | null): CambioProducto {
  switch (accion) {
    case 'mostrar':
      return { product_id: productId, is_listed: true };
    case 'ocultar':
      return { product_id: productId, is_listed: false };
    case 'agotar':
      return { product_id: productId, is_sold_out: true, agotado_hasta: agotadoHasta ?? null };
    case 'disponible':
      return { product_id: productId, is_sold_out: false };
    case 'restablecer':
      return { product_id: productId, restablecer: true };
  }
}

/**
 * Instante en que deja de estar agotado: el inicio del día SIGUIENTE a
 * `dia` en la zona de la organización («agotado hasta el 12» = vuelve el 13
 * a las 00:00 de la organización).
 */
export function instanteAgotadoHasta(diaIncluido: string, timezone: string): string {
  return plainDateToInstant(nextPlainDay(diaIncluido), timezone);
}

/** Inverso de `instanteAgotadoHasta`: el último día agotado, en la zona de la organización. */
export function diaAgotadoHasta(instante: string | null, timezone: string): string | null {
  if (!instante) return null;
  const d = new Date(instante);
  if (Number.isNaN(d.getTime())) return null;
  return previousPlainDay(toPlainDate(d, timezone));
}

/** ¿Está agotado en `ahora`? Un agotado con fecha vencida ya no cuenta. */
export function agotadoAhora(a: Pick<AjusteSede, 'is_sold_out' | 'sold_out_until'>, ahora: Date = new Date()): boolean {
  if (!a.is_sold_out) return false;
  if (!a.sold_out_until) return true;
  const t = new Date(a.sold_out_until).getTime();
  return Number.isFinite(t) && t > ahora.getTime();
}

/** Aplica un cambio parcial sobre el ajuste actual (o el neutro si no hay fila). */
export function fusionarAjuste(actual: AjusteSede | null, cambio: CambioProducto, timezone: string): AjusteSede {
  if (cambio.restablecer) return { ...AJUSTE_PRINCIPAL };
  const base: AjusteSede = actual ? { ...actual } : { ...AJUSTE_PRINCIPAL };
  if (cambio.is_listed !== undefined) base.is_listed = cambio.is_listed;
  if (cambio.web_price !== undefined) base.web_price = cambio.web_price;
  if (cambio.is_sold_out !== undefined) {
    // Volver a marcar agotado algo que ya no lo estaba (o cuya fecha venció) no
    // hereda la fecha vieja: sin «hasta» nuevo, queda agotado sin fecha.
    const estabaAgotado = actual ? agotadoAhora(actual) : false;
    base.is_sold_out = cambio.is_sold_out;
    if (!cambio.is_sold_out || !estabaAgotado) base.sold_out_until = null;
  }
  if (cambio.agotado_hasta !== undefined && base.is_sold_out) {
    base.sold_out_until = cambio.agotado_hasta ? instanteAgotadoHasta(cambio.agotado_hasta, timezone) : null;
  }
  return base;
}

/** ¿El ajuste es igual al sitio principal? (para pintar «Heredado de la principal»). */
export function esComoPrincipal(a: AjusteSede | null | undefined): boolean {
  return !a || (a.is_listed && a.web_price === null && !a.is_sold_out);
}

// ─── Borrador en pantalla (pantalla «Carta por sede» y constructor de la carta) ───────────

/** Lo que se ve en pantalla: ajuste guardado + borrador sin guardar. */
export interface VistaAjusteSede {
  is_listed: boolean;
  web_price: number | null;
  is_sold_out: boolean;
  agotado_hasta: string | null;
}

export function vistaDe(p: ProductoCartaSede, cambio: CambioProducto | undefined): VistaAjusteSede {
  const base: VistaAjusteSede = p.ajuste
    ? { is_listed: p.ajuste.is_listed, web_price: p.ajuste.web_price, is_sold_out: p.ajuste.agotado_ahora, agotado_hasta: p.ajuste.agotado_hasta }
    : { is_listed: true, web_price: null, is_sold_out: false, agotado_hasta: null };
  if (!cambio) return base;
  if (cambio.restablecer) return { is_listed: true, web_price: null, is_sold_out: false, agotado_hasta: null };
  return {
    is_listed: cambio.is_listed ?? base.is_listed,
    web_price: cambio.web_price !== undefined ? cambio.web_price : base.web_price,
    is_sold_out: cambio.is_sold_out ?? base.is_sold_out,
    agotado_hasta: cambio.is_sold_out === false ? null : cambio.agotado_hasta !== undefined ? cambio.agotado_hasta : base.agotado_hasta,
  };
}

export function esVistaPrincipal(v: VistaAjusteSede): boolean {
  return v.is_listed && v.web_price === null && !v.is_sold_out;
}

/** Suma un cambio parcial al borrador. Tras «restablecer», los campos se escriben explícitos. */
export function sumarCambio(previo: CambioProducto | undefined, productId: number, parche: Omit<CambioProducto, 'product_id'>): CambioProducto {
  if (parche.restablecer) return { product_id: productId, restablecer: true };
  if (previo?.restablecer) {
    return {
      product_id: productId,
      is_listed: AJUSTE_PRINCIPAL.is_listed,
      web_price: AJUSTE_PRINCIPAL.web_price,
      is_sold_out: AJUSTE_PRINCIPAL.is_sold_out,
      agotado_hasta: null,
      ...parche,
    };
  }
  return { ...(previo ?? {}), ...parche, product_id: productId };
}
