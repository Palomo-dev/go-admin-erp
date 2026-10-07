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
  brand?: string;
  quantity: number;
  unit_price: number;
  /**
   * «Cómo se vende» el producto (`products.sale_mode`). «Lleve X pague Y» no
   * aplica a `weight` ni `measure`. Si el llamador no lo trae y hay una
   * promoción de ese tipo, el motor lo consulta (una lectura por evaluación).
   */
  sale_mode?: string | null;
}

export interface PromotionContext {
  channel: PromotionChannel;
  items: PromotionItem[];
  organization_id: number;
  branch_id?: number;
  customer_id?: string;
  date?: Date; // Para testing; por defecto now()
  /** Zona IANA de la organización. Si falta, `getOrganizationTimezone`. */
  timezone?: string;
  /**
   * Cliente con el que leer. En el navegador se omite (cliente con la sesión);
   * en un route handler es OBLIGATORIO: `getServerUserClient()` o el
   * service role con la organización ya validada.
   */
  db?: SupabaseClient;
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
          created_at
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
    if (error) {
      console.error('[promotionEngine] Error loading promotions:', error);
      return [];
    }
    // PostgREST embebe las reglas con el nombre de la tabla
    // (`promotion_rules`); el módulo puro lee ambas formas.
    return (Array.isArray(data) ? data : []) as FilaPromocion[];
  }

  /**
   * Evalúa todas las promociones aplicables al contexto dado, sobre TODAS las
   * líneas a la vez (la compra mínima, el monto fijo, el 2x1 y el tope son
   * de la cuenta, no de cada línea).
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

    const promotions = await this.loadActivePromotions(db, ctx.organization_id, ctx.channel, date);
    if (promotions.length === 0) return vacio;

    const [zonaHoraria, items] = await Promise.all([
      ctx.timezone ? Promise.resolve(ctx.timezone) : getOrganizationTimezone(ctx.organization_id, ctx.db),
      this.completarDatosProducto(db, ctx.organization_id, ctx.items, promotions),
    ]);

    const r = evaluarPromociones(promotions, items, {
      canal: ctx.channel,
      ahora: date,
      zonaHoraria,
      sucursalId: ctx.branch_id ?? null,
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
    const falta = (i: PromotionItem) =>
      (usaReglas && (i.category_id === undefined || i.parent_product_id === undefined)) ||
      (usaModo && i.sale_mode === undefined);
    const ids = Array.from(new Set(items.filter((i) => i.product_id > 0 && falta(i)).map((i) => i.product_id)));
    if (ids.length === 0) return items;
    try {
      const { data, error } = await db
        .from('products')
        .select('id, category_id, parent_product_id, sale_mode')
        .eq('organization_id', organizationId)
        .in('id', ids);
      if (error || !Array.isArray(data)) return items;
      type Fila = { id: number; category_id?: number | null; parent_product_id?: number | null; sale_mode?: string | null };
      const porId = new Map<number, Fila>((data as Fila[]).map((r) => [Number(r.id), r]));
      return items.map((i) => {
        const f = porId.get(i.product_id);
        if (!f) return i;
        return {
          ...i,
          category_id: i.category_id === undefined ? (f.category_id ?? null) : i.category_id,
          parent_product_id: i.parent_product_id === undefined ? (f.parent_product_id ?? null) : i.parent_product_id,
          sale_mode: i.sale_mode === undefined ? (f.sale_mode ?? null) : i.sale_mode,
        };
      });
    } catch {
      return items;
    }
  }
}

// Singleton
export const promotionEngine = new PromotionEngineService();
