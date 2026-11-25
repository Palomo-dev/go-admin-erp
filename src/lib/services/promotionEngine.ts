/**
 * Motor central de evaluación de promociones.
 *
 * Este archivo solo CARGA: promociones de la organización, zona horaria y
 * modo de venta de los productos. Las reglas (vigencia, día, sucursal, usos,
 * compra mínima, no combinables, topes, reparto por línea) viven en el módulo
 * puro `@/lib/promotions/motorPromociones`, que debe coincidir con el motor del
 * sitio web (goadmin-websites `lib/promotions.ts`).
 *
 * Uso:
 *   const result = await promotionEngine.evaluate({
 *     channel: 'pos',
 *     items: cart.items.map(i => ({
 *       product_id: i.product_id,
 *       category_id: i.product?.category_id,
 *       quantity: i.quantity,
 *       unit_price: i.unit_price,
 *     })),
 *     organization_id: 135,
 *     branch_id: 1,
 *   });
 *   // result.discountTotal  → total descontado
 *   // result.lineDiscounts  → descuento de cada línea (el que se escribe)
 *   // result.applied        → promociones aplicadas (para UI)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import type { Promotion } from '@/components/pos/promociones/types';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import {
  evaluarPromociones,
  type FilaPromocion,
  type PromocionAplicada,
} from '@/lib/promotions/motorPromociones';
import { promocionRequiereCliente, type ClientePromocion } from '@/lib/promotions/precioVolumen';
import { promocionesConListas } from '@/lib/listasPrecios/promocionesConLista';
import { crearMemoriaCorta } from '@/lib/pos/venta/memoriaCorta';

/**
 * Lista de promociones activas que el carrito del mostrador puede reutilizar
 * entre toques seguidos (`PromotionContext.memoria`). Nadie más la usa: sin
 * `memoria`, y siempre en el servidor (`ctx.db`), se lee de la base como antes.
 * 30 s: el recálculo del carrito (al abrirlo, al volver, por realtime y cada
 * minuto) y el cobro piden `refrescar`, así que un cambio de promociones llega
 * igual de rápido que hoy.
 */
export const VIGENCIA_PROMOCIONES_EN_MEMORIA_MS = 30_000;
const memoriaPromociones = crearMemoriaCorta<FilaPromocion[]>(VIGENCIA_PROMOCIONES_EN_MEMORIA_MS);

/** Vacía la lista de promociones en memoria (pruebas). */
export function olvidarPromocionesEnMemoria(): void {
  memoriaPromociones.olvidar();
}

// --- Tipos públicos ---

export type PromotionChannel = 'pos' | 'web' | 'finances';

export interface PromotionItem {
  product_id: number;
  /**
   * Producto padre cuando el ítem es una variante. Permite que una promoción
   * definida sobre el padre (p. ej. "GRANI CON LICOR") alcance a todas sus
   * variantes ("EXTRAGRANDE GRANI CON LICOR"), que es lo que el usuario espera.
   */
  parent_product_id?: number | null;
  category_id?: number | null;
  brand?: string | null;
  quantity: number;
  unit_price: number;
  /**
   * «Cómo se vende» el producto (`products.sale_mode`). «Lleve X pague Y» no
   * aplica a `weight` ni `measure`. Si el llamador no lo trae y hay una
   * promoción de ese tipo, el motor lo consulta (una lectura por evaluación).
   */
  sale_mode?: string | null;
  /** Línea a la que le quitaron la promoción. El motor no la descuenta ni la cuenta. */
  promo_excluded?: boolean | null;
  /**
   * Lista de precios con que va la línea (`unit_price` ya es el de la lista). Las promociones con
   * `applies_with_price_lists = false` no la tocan (`promocionesConListas`).
   */
  price_list_id?: string | null;
}

export interface PromotionContext {
  channel: PromotionChannel;
  items: PromotionItem[];
  organization_id: number;
  branch_id?: number;
  /** Métodos de cobro elegidos; una promoción limitada por método solo aplica con uno de ellos. */
  payment_methods?: string[];
  /**
   * Cliente de la venta. Las promociones «solo para el grupo …» y con «usos por cliente» solo
   * aplican si viene y cumple (sus segmentos y usos se leen aquí). Sin él, no aplican.
   */
  customer_id?: string | null;
  /**
   * Promociones cuyo uso por cliente YA cuenta esta misma venta o pedido (se registró al crearlo).
   * Al recalcularlo, cada una descuenta un uso: si no, un límite «1 por cliente» se caería con su
   * propio uso.
   */
  usos_ya_contados?: readonly string[];
  date?: Date; // Para testing; por defecto now()
  /** Zona IANA de la organización. Si falta, `getOrganizationTimezone`. */
  timezone?: string;
  /**
   * Cliente con el que leer. En el navegador se omite (cliente con la sesión);
   * en un route handler es OBLIGATORIO: `getServerUserClient()` o el
   * service role con la organización ya validada.
   */
  db?: SupabaseClient;
  /**
   * Solo el carrito del mostrador, en el navegador. `usar`: vale la lista de
   * promociones leída hace menos de 30 s (toques seguidos de «+»). `refrescar`:
   * la lee de la base y la deja guardada. Sin este campo —o con `db` o `date`—
   * se lee siempre y no se guarda nada. Los segmentos y usos del cliente no
   * pasan por aquí: se leen en cada evaluación.
   */
  memoria?: 'usar' | 'refrescar';
}

export interface AppliedPromotion {
  promotion_id: string;
  promotion_name: string;
  promotion_type: Promotion['promotion_type'];
  discount_value: number;
  discount_amount: number;
  items_affected: number[];
  /** Posiciones (en `ctx.items`) de las líneas que descuenta. */
  lineas: number[];
  /** Lo que descontó en cada línea (posición → monto). Se registra en `sale_promotions`. */
  montos_linea?: Record<number, number>;
  /** Precio por volumen: escalón alcanzado por línea (posición → `desde`). */
  escalon_linea?: Record<number, number>;
}

export interface PromotionEvaluationResult {
  discountTotal: number;
  /**
   * product_id → SUMA de sus líneas. Solo para mostrar: con el mismo producto
   * en dos líneas, escribirlo en cada una descuenta doble. Usa `lineDiscounts`.
   */
  itemDiscounts: Record<number, number>;
  /**
   * Descuento por LÍNEA, en el mismo orden que `ctx.items`. Es el que se
   * escribe en cada línea (mostrador, mesas, facturas).
   */
  lineDiscounts: number[];
  applied: AppliedPromotion[];
  items: PromotionItem[]; // items con discount_amount aplicado
}

// --- Motor ---

class PromotionEngineService {
  /**
   * Carga las promociones activas del canal que ya empezaron. El resto de
   * filtros (fin, usos, día, sucursal) los decide el módulo puro.
   */
  private async loadActivePromotions(
    db: SupabaseClient,
    organizationId: number,
    channel: PromotionChannel,
    date: Date,
    memoria?: 'usar' | 'refrescar',
  ): Promise<FilaPromocion[]> {
    try {
      if (!memoria) return await this.leerPromocionesActivas(db, organizationId, channel, date);
      // Un fallo no se guarda: el siguiente toque vuelve a leer.
      return await memoriaPromociones.obtener(
        `${organizationId}|${channel}`,
        () => this.leerPromocionesActivas(db, organizationId, channel, date),
        { fresco: memoria === 'refrescar' },
      );
    } catch (error) {
      console.error('[promotionEngine] Error loading promotions:', error);
      return [];
    }
  }

  /** La lectura en sí; lanza si falla (así un error nunca queda guardado como «sin promociones»). */
  private async leerPromocionesActivas(
    db: SupabaseClient,
    organizationId: number,
    channel: PromotionChannel,
    date: Date,
  ): Promise<FilaPromocion[]> {
    let query = db
      .from('promotions')
      .select(
        `
        *,
        promotion_rules (
          id,
          rule_type,
          product_id,
          category_id,
          quantity,
          brand,
          tier_group,
          created_at
        ),
        promotion_tiers (
          min_quantity,
          unit_price,
          discount_percent,
          sort_order
        )
      `,
      )
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .lte('start_date', date.toISOString())
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true });

    if (channel === 'pos') query = query.eq('applies_to_pos', true);
    else if (channel === 'web') query = query.eq('applies_to_web', true);
    else if (channel === 'finances') query = query.eq('applies_to_finances', true);

    const { data, error } = await query;
    if (error) throw error;
    // PostgREST embebe las reglas con el nombre de la tabla
    // (`promotion_rules`); el módulo puro lee ambas formas.
    return (Array.isArray(data) ? data : []) as FilaPromocion[];
  }

  /**
   * Evalúa todas las promociones aplicables al contexto dado, sobre TODAS las
   * líneas a la vez (el monto fijo, el 2x1 y el tope son de la cuenta).
   * La compra mínima de una promo por productos o categorías mira solo esas
   * líneas, salvo que `min_purchase_scope` sea `cart` o la promo aplique a todo.
   */
  async evaluate(ctx: PromotionContext): Promise<PromotionEvaluationResult> {
    const date = ctx.date || new Date();
    const db = ctx.db ?? (supabase as unknown as SupabaseClient);
    const vacio: PromotionEvaluationResult = {
      discountTotal: 0,
      itemDiscounts: {},
      lineDiscounts: ctx.items.map(() => 0),
      applied: [],
      items: ctx.items,
    };
    if (ctx.items.length === 0) return vacio;

    // Listas de precios: las promociones «no aplica con listas» no tocan las líneas con lista.
    const promotions = promocionesConListas(
      // La memoria solo vale en el navegador y con la hora real (ver `PromotionContext.memoria`).
      await this.loadActivePromotions(db, ctx.organization_id, ctx.channel, date, ctx.db || ctx.date ? undefined : ctx.memoria),
      ctx.items,
    );
    if (promotions.length === 0) return vacio;

    const [zonaHoraria, items, cliente] = await Promise.all([
      ctx.timezone ? Promise.resolve(ctx.timezone) : getOrganizationTimezone(ctx.organization_id, ctx.db),
      this.completarDatosProducto(db, ctx.organization_id, ctx.items, promotions),
      this.cargarCliente(db, ctx.organization_id, ctx.customer_id ?? null, promotions),
    ]);
    if (cliente && ctx.usos_ya_contados && ctx.usos_ya_contados.length > 0) {
      const usos = { ...cliente.usos };
      for (const id of new Set(ctx.usos_ya_contados)) {
        if ((usos[id] ?? 0) > 0) usos[id] = usos[id] - 1;
      }
      cliente.usos = usos;
    }

    const r = evaluarPromociones(promotions, items, {
      canal: ctx.channel,
      ahora: date,
      zonaHoraria,
      sucursalId: ctx.branch_id ?? null,
      metodosPago: ctx.payment_methods ?? null,
      cliente,
    });

    return {
      discountTotal: r.discountTotal,
      itemDiscounts: r.itemDiscounts,
      lineDiscounts: r.lineDiscounts,
      applied: r.applied.map((a: PromocionAplicada) => ({
        ...a,
        promotion_type: a.promotion_type as Promotion['promotion_type'],
      })),
      items: ctx.items.map((item) => ({ ...item })),
    };
  }

  /**
   * Segmentos y usos del cliente, solo si alguna promoción los mira. Sin cliente: null (esas
   * promociones no aplican). Si la lectura falla, el cliente queda sin segmentos ni usos
   * registrados: el grupo no aplica (falla cerrado) y el límite por cliente cuenta desde 0.
   */
  private async cargarCliente(
    db: SupabaseClient,
    organizationId: number,
    customerId: string | null,
    promos: FilaPromocion[],
  ): Promise<ClientePromocion | null> {
    if (!customerId) return null;
    const conCliente = promos.filter((p) => promocionRequiereCliente(p));
    if (conCliente.length === 0) return { id: customerId, segmentos: [], usos: {} };
    const segmentos = Array.from(new Set(conCliente.map((p) => p.customer_segment_id).filter((s): s is string => !!s)));
    const conLimite = conCliente.filter((p) => p.usage_limit_per_customer != null).map((p) => p.id);
    try {
      const [seg, usos] = await Promise.all([
        segmentos.length > 0
          ? db
              .from('segment_members')
              .select('segment_id')
              .eq('organization_id', organizationId)
              .eq('customer_id', customerId)
              .in('segment_id', segmentos)
          : Promise.resolve({ data: [], error: null }),
        conLimite.length > 0
          ? db
              .from('promotion_customer_uses')
              .select('promotion_id, uses')
              .eq('organization_id', organizationId)
              .eq('customer_id', customerId)
              .in('promotion_id', conLimite)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const filasSeg = (seg.error ? [] : (seg.data ?? [])) as Array<{ segment_id: string }>;
      const filasUso = (usos.error ? [] : (usos.data ?? [])) as Array<{ promotion_id: string; uses: number }>;
      return {
        id: customerId,
        segmentos: filasSeg.map((f) => String(f.segment_id)),
        usos: Object.fromEntries(filasUso.map((f) => [String(f.promotion_id), Number(f.uses) || 0])),
      };
    } catch {
      return { id: customerId, segmentos: [], usos: {} };
    }
  }

  /**
   * Completa lo que el llamador no trajo (`undefined`) y las reglas necesitan:
   * categoría y producto padre (promociones por categoría o sobre el padre de
   * una variante: la factura manual y las cotizaciones no los tienen) y
   * `sale_mode` («Lleve X pague Y» no aplica a peso ni medida). Una lectura
   * de `products` de la organización por evaluación, y solo si hace falta;
   * si falla, los ítems quedan como están.
   */
  private async completarDatosProducto(
    db: SupabaseClient,
    organizationId: number,
    items: PromotionItem[],
    promos: FilaPromocion[],
  ): Promise<PromotionItem[]> {
    const usaReglas = promos.some((p) => p.applies_to !== 'all');
    const usaModo = promos.some((p) => p.promotion_type === 'buy_x_get_y');
    const usaMarca = promos.some((p) => (p.promotion_rules ?? p.rules ?? []).some((r) => !!r.brand));
    const falta = (i: PromotionItem) =>
      (usaReglas && (i.category_id === undefined || i.parent_product_id === undefined)) ||
      (usaModo && i.sale_mode === undefined) ||
      (usaMarca && i.brand === undefined);
    const ids = Array.from(new Set(items.filter((i) => i.product_id > 0 && falta(i)).map((i) => i.product_id)));
    if (ids.length === 0) return items;
    try {
      const { data, error } = await db
        .from('products')
        .select('id, category_id, parent_product_id, sale_mode, brand')
        .eq('organization_id', organizationId)
        .in('id', ids);
      if (error || !Array.isArray(data)) return items;
      type Fila = {
        id: number;
        category_id?: number | null;
        parent_product_id?: number | null;
        sale_mode?: string | null;
        brand?: string | null;
      };
      const porId = new Map<number, Fila>((data as Fila[]).map((r) => [Number(r.id), r]));
      return items.map((i) => {
        const f = porId.get(i.product_id);
        if (!f) return i;
        return {
          ...i,
          category_id: i.category_id === undefined ? (f.category_id ?? null) : i.category_id,
          parent_product_id: i.parent_product_id === undefined ? (f.parent_product_id ?? null) : i.parent_product_id,
          sale_mode: i.sale_mode === undefined ? (f.sale_mode ?? null) : i.sale_mode,
          brand: i.brand === undefined ? (f.brand ?? null) : i.brand,
        };
      });
    } catch {
      return items;
    }
  }
}

// Singleton
export const promotionEngine = new PromotionEngineService();
