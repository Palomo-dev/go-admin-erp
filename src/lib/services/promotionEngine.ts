/**
 * Motor central de evaluación de promociones.
 *
 * Punto único de verdad para calcular descuentos aplicables a un carrito/conjunto
 * de items desde cualquier canal (POS, Web, Finanzas, PMS, CRM).
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
 *   // result.itemDiscounts  → { [product_id]: monto }
 *   // result.applied        → promociones aplicadas (para UI)
 */

import { supabase } from '@/lib/supabase/config';
import {
  Promotion,
  PromotionRule,
} from '@/components/pos/promociones/types';
import { appliesOnWeekDay, isWithinEndDate, weekDayOfLocalDate } from '@/lib/promotions/vigencia';
import { esMedido } from '@/lib/pos/peso/modoVenta';

/** ¿El ítem se vende por peso o medida? (sin dato: por unidad, como hoy). */
function esItemMedido(item: PromotionItem): boolean {
  return esMedido({ sale_mode: item.sale_mode ?? null });
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
  category_id?: number;
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
}

export interface AppliedPromotion {
  promotion_id: string;
  promotion_name: string;
  promotion_type: Promotion['promotion_type'];
  discount_value: number;
  discount_amount: number;
  items_affected: number[];
}

export interface PromotionEvaluationResult {
  discountTotal: number;
  itemDiscounts: Record<number, number>; // product_id → monto descontado
  /**
   * Descuento por LÍNEA, en el mismo orden que `ctx.items`. Con productos por
   * peso hay varias líneas del mismo producto (una por pesada) y
   * `itemDiscounts` suma las de todas: cada línea debe llevar solo la suya.
   */
  lineDiscounts: number[];
  applied: AppliedPromotion[];
  items: PromotionItem[]; // items con discount_amount aplicado
}

// --- Motor ---

class PromotionEngineService {
  /**
   * Carga promociones activas y vigentes para el canal + día + organización.
   */
  private async loadActivePromotions(
    organizationId: number,
    channel: PromotionChannel,
    date: Date,
  ): Promise<Promotion[]> {
    const nowIso = date.toISOString();

    let query = supabase
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
      .lte('start_date', nowIso)
      .order('priority', { ascending: false });

    // Filtrar por canal
    if (channel === 'pos') query = query.eq('applies_to_pos', true);
    else if (channel === 'web') query = query.eq('applies_to_web', true);
    else if (channel === 'finances') query = query.eq('applies_to_finances', true);

    // end_date nullable: traer tanto las que no tienen fin como las que aún no vencen
    const { data, error } = await query;

    if (error) {
      console.error('[promotionEngine] Error loading promotions:', error);
      return [];
    }

    // PostgREST devuelve el embed con el NOMBRE DE LA TABLA (`promotion_rules`),
    // pero el resto del motor lee `promo.rules`. Sin este mapeo `rules` era
    // siempre undefined → [] → y con `applies_to = 'products'|'categories'` ningún
    // ítem coincidía: esas promociones no se aplicaban NUNCA, en ningún canal.
    // Solo funcionaban las de `applies_to = 'all'`, que no consultan reglas.
    // TypeScript no lo detectaba porque el tipo `Promotion` declara `rules`.
    let promos: Promotion[] = ((data || []) as Array<Record<string, unknown>>).map((row) => {
      const { promotion_rules, ...resto } = row;
      return { ...resto, rules: (promotion_rules ?? resto.rules ?? []) } as Promotion;
    });

    // Filtrar end_date y día de la semana en memoria (PostgREST no soporta
    // or(is.null,gte) fácilmente combinado con otros filtros en una sola query
    // sin RPC). Los dos predicados viven en `lib/promotions/vigencia.ts`
    // porque la cartelera de la pantalla del cliente los necesita IGUALES:
    // cuando eran solo de aquí, la pantalla anunciaba promociones que este
    // motor no aplicaba (Fase 4, ronda 1). CLAUDE.md §7.
    promos = promos.filter((p) => isWithinEndDate(p, date));

    // El día sale del reloj del NAVEGADOR del cajero (comportamiento de
    // siempre de este motor; no se toca en la Fase 4). La cartelera de la
    // pantalla, que corre en servidor, resuelve el suyo con la zona horaria
    // de la organización antes de llamar al mismo predicado.
    const dayName = weekDayOfLocalDate(date);
    promos = promos.filter((p) => appliesOnWeekDay(p, dayName));

    return promos;
  }

  /**
   * Verifica si un item cumple las reglas de una promoción.
   */
  private itemMatchesRules(
    item: PromotionItem,
    rules: PromotionRule[],
    appliesTo: Promotion['applies_to'],
  ): boolean {
    if (appliesTo === 'all') return true;
    if (!rules || rules.length === 0) return false;

    let included = false;
    let excluded = false;

    // Una regla sobre un producto alcanza al propio producto Y, si el ítem es
    // una variante, a su padre: promocionar "GRANI CON LICOR" debe cubrir
    // "EXTRAGRANDE GRANI CON LICOR". Antes solo se comparaba el id exacto.
    const coincideProducto = (ruleProductId: number | null | undefined) =>
      ruleProductId != null &&
      (ruleProductId === item.product_id || ruleProductId === item.parent_product_id);

    for (const rule of rules) {
      switch (rule.rule_type) {
        case 'include_product':
          if (coincideProducto(rule.product_id)) included = true;
          break;
        case 'exclude_product':
          if (coincideProducto(rule.product_id)) excluded = true;
          break;
        case 'include_category':
          if (rule.category_id && item.category_id === rule.category_id) included = true;
          break;
        case 'exclude_category':
          if (rule.category_id && item.category_id === rule.category_id) excluded = true;
          break;
        case 'include_brand':
          if (rule.product_id === item.product_id) included = true; // brand via product
          break;
        case 'exclude_brand':
          if (rule.product_id === item.product_id) excluded = true;
          break;
      }
    }

    // Si hay reglas de inclusión, el item debe estar incluido y no excluido
    // Si no hay reglas de inclusión pero sí de exclusión, excluir
    const hasIncludeRules = rules.some((r) =>
      ['include_product', 'include_category', 'include_brand'].includes(r.rule_type),
    );

    if (hasIncludeRules) {
      return included && !excluded;
    }
    // Solo reglas de exclusión: incluir todo salvo los excluidos
    return !excluded;
  }

  /**
   * Calcula el descuento para una promoción sobre los items aplicables.
   *
   * `applicable` lleva la posición de cada ítem en `ctx.items`: además del
   * reparto por producto (`perItem`, el de siempre) se devuelve el reparto
   * por línea (`perLine`). Con productos por peso cada pesada es su propia
   * línea del mismo producto, y repartir por producto le daba a cada línea el
   * descuento de todas.
   */
  private calculatePromotionDiscount(
    promotion: Promotion,
    applicable: ReadonlyArray<{ item: PromotionItem; idx: number }>,
  ): { discountAmount: number; perItem: Record<number, number>; perLine: Record<number, number> } {
    const perItem: Record<number, number> = {};
    const perLine: Record<number, number> = {};
    let totalDiscount = 0;
    const sumar = (entrada: { item: PromotionItem; idx: number }, d: number) => {
      perItem[entrada.item.product_id] = (perItem[entrada.item.product_id] || 0) + d;
      perLine[entrada.idx] = (perLine[entrada.idx] || 0) + d;
    };

    const subtotal = applicable.reduce(
      (sum, { item: i }) => sum + i.unit_price * i.quantity,
      0,
    );

    switch (promotion.promotion_type) {
      case 'percentage': {
        const pct = Number(promotion.discount_value || 0) / 100;
        for (const entrada of applicable) {
          const lineTotal = entrada.item.unit_price * entrada.item.quantity;
          const d = Math.round(lineTotal * pct * 100) / 100;
          if (d > 0) {
            sumar(entrada, d);
            totalDiscount += d;
          }
        }
        break;
      }

      case 'fixed_amount': {
        // Monto fijo distribuido proporcionalmente entre los items aplicables.
        // Antes este case decía 'fixed', valor que el CHECK de la base nunca
        // permite guardar: el motor jamás llegaba a aplicar un monto fijo.
        const fixed = Number(promotion.discount_value || 0);
        if (subtotal > 0 && fixed > 0) {
          for (const entrada of applicable) {
            const ratio = (entrada.item.unit_price * entrada.item.quantity) / subtotal;
            const d = Math.round(fixed * ratio * 100) / 100;
            if (d > 0) {
              sumar(entrada, d);
              totalDiscount += d;
            }
          }
        }
        break;
      }

      case 'buy_x_get_y': {
        // Por cada (buy_quantity + get_quantity) items, el más barato de los
        // get_quantity es gratis. Simplificación: por cada X comprados, Y gratis
        // (descuento = Y * unit_price del item más barato del grupo).
        //
        // «Lleve X pague Y» cuenta UNIDADES: no aplica a productos por peso ni
        // por medida (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.5). Antes
        // `Math.floor` de 2,5 kg contaba «2» y regalaba kilos.
        const buyQty = promotion.buy_quantity || 0;
        const getQty = promotion.get_quantity || 0;
        if (buyQty > 0 && getQty > 0) {
          // Agrupar items por product_id para aplicar X+Y dentro del mismo producto
          const byProduct = new Map<number, Array<{ item: PromotionItem; idx: number }>>();
          for (const entrada of applicable) {
            if (esItemMedido(entrada.item)) continue;
            const arr = byProduct.get(entrada.item.product_id) || [];
            arr.push(entrada);
            byProduct.set(entrada.item.product_id, arr);
          }

          for (const [, entradas] of Array.from(byProduct.entries())) {
            const totalQty = entradas.reduce((s, e) => s + e.item.quantity, 0);
            const sets = Math.floor(totalQty / (buyQty + getQty));
            if (sets <= 0) continue;
            // El más barato del grupo es el que se regala
            const sorted = [...entradas].sort((a, b) => a.item.unit_price - b.item.unit_price);
            let remainingFree = sets * getQty;
            for (const entrada of sorted) {
              if (remainingFree <= 0) break;
              const free = Math.min(remainingFree, entrada.item.quantity);
              const d = Math.round(free * entrada.item.unit_price * 100) / 100;
              if (d > 0) {
                sumar(entrada, d);
                totalDiscount += d;
              }
              remainingFree -= free;
            }
          }
        }
        break;
      }

      case 'bundle': {
        // Bundle: descuento sobre el conjunto si todos los items están presentes
        // Simplificación: aplicar percentage discount_value sobre el subtotal
        const pct = Number(promotion.discount_value || 0) / 100;
        const d = Math.round(subtotal * pct * 100) / 100;
        if (d > 0) {
          for (const entrada of applicable) {
            const ratio = (entrada.item.unit_price * entrada.item.quantity) / subtotal;
            const itemD = Math.round(d * ratio * 100) / 100;
            sumar(entrada, itemD);
          }
          totalDiscount = d;
        }
        break;
      }
    }

    // Aplicar max_discount_amount (tope)
    if (promotion.max_discount_amount && totalDiscount > promotion.max_discount_amount) {
      const cap = Number(promotion.max_discount_amount);
      const ratio = cap / totalDiscount;
      for (const pid of Object.keys(perItem)) {
        perItem[Number(pid)] = Math.round(perItem[Number(pid)] * ratio * 100) / 100;
      }
      for (const idx of Object.keys(perLine)) {
        perLine[Number(idx)] = Math.round(perLine[Number(idx)] * ratio * 100) / 100;
      }
      totalDiscount = cap;
    }

    return { discountAmount: totalDiscount, perItem, perLine };
  }

  /**
   * Evalúa todas las promociones aplicables al contexto dado.
   */
  async evaluate(ctx: PromotionContext): Promise<PromotionEvaluationResult> {
    const date = ctx.date || new Date();

    // 1. Cargar promociones activas para el canal + día + org
    const promotions = await this.loadActivePromotions(
      ctx.organization_id,
      ctx.channel,
      date,
    );

    if (promotions.length === 0 || ctx.items.length === 0) {
      return {
        discountTotal: 0,
        itemDiscounts: {},
        lineDiscounts: ctx.items.map(() => 0),
        applied: [],
        items: ctx.items,
      };
    }

    // 2. Filtrar por branch_id si la promoción tiene branches definidos
    const branchFiltered = promotions.filter((p) => {
      if (!p.branches || p.branches.length === 0) return true; // aplica a todas
      if (!ctx.branch_id) return false;
      return p.branches.includes(ctx.branch_id);
    });

    // 3. Filtrar por min_purchase_amount
    const cartSubtotal = ctx.items.reduce(
      (sum, i) => sum + i.unit_price * i.quantity,
      0,
    );

    const eligible = branchFiltered.filter((p) => {
      if (p.min_purchase_amount && cartSubtotal < Number(p.min_purchase_amount)) {
        return false;
      }
      return true;
    });

    // 3 bis. «Lleve X pague Y» necesita saber qué ítems se venden por peso.
    const items = await this.conModoVenta(ctx.items, eligible);

    // 4. Separar combinables de no combinables
    const nonCombinable = eligible.filter((p) => !p.is_combinable);
    const combinable = eligible.filter((p) => p.is_combinable);

    // 5. Estrategia: si hay no-combinables, tomar la de mayor prioridad
    // y aplicar sola. Si no, aplicar todas las combinables.
    let toApply: Promotion[] = [];

    if (nonCombinable.length > 0) {
      // Tomar la de mayor prioridad (ya ordenadas desc por priority)
      const best = nonCombinable[0];
      const bestDiscount = this.calculateForPromotion(best, items);
      const combinableDiscount = combinable.reduce(
        (sum, p) => sum + this.calculateForPromotion(p, items),
        0,
      );
      // Si la no-combinable da más descuento, usarla sola; si no, usar combinables
      if (bestDiscount >= combinableDiscount) {
        toApply = [best];
      } else {
        toApply = combinable;
      }
    } else {
      toApply = combinable;
    }

    // 6. Aplicar promociones seleccionadas
    const itemDiscounts: Record<number, number> = {};
    const lineDiscounts: number[] = items.map(() => 0);
    const applied: AppliedPromotion[] = [];
    let discountTotal = 0;

    for (const promo of toApply) {
      const applicable = this.aplicables(promo, items);
      const applicableItems = applicable.map((e) => e.item);

      if (applicableItems.length === 0) continue;

      const { discountAmount, perItem, perLine } = this.calculatePromotionDiscount(
        promo,
        applicable,
      );

      if (discountAmount <= 0) continue;

      for (const [pid, amt] of Object.entries(perItem)) {
        itemDiscounts[Number(pid)] = (itemDiscounts[Number(pid)] || 0) + amt;
      }
      for (const [idx, amt] of Object.entries(perLine)) {
        lineDiscounts[Number(idx)] = Math.round(((lineDiscounts[Number(idx)] || 0) + amt) * 100) / 100;
      }
      discountTotal += discountAmount;

      applied.push({
        promotion_id: promo.id,
        promotion_name: promo.name,
        promotion_type: promo.promotion_type,
        discount_value: Number(promo.discount_value || 0),
        discount_amount: discountAmount,
        items_affected: applicableItems.map((i) => i.product_id),
      });
    }

    // 7. Construir items con discount_amount
    const itemsWithDiscount = ctx.items.map((item) => ({
      ...item,
    }));

    return {
      discountTotal: Math.round(discountTotal * 100) / 100,
      itemDiscounts,
      lineDiscounts,
      applied,
      items: itemsWithDiscount,
    };
  }

  /** Ítems que cumplen las reglas de la promoción, con su posición en la lista. */
  private aplicables(promo: Promotion, items: PromotionItem[]): Array<{ item: PromotionItem; idx: number }> {
    const out: Array<{ item: PromotionItem; idx: number }> = [];
    items.forEach((item, idx) => {
      if (this.itemMatchesRules(item, promo.rules || [], promo.applies_to)) out.push({ item, idx });
    });
    return out;
  }

  /**
   * Completa `sale_mode` de los ítems que no lo traen, solo si alguna
   * promoción elegible es «Lleve X pague Y» (las demás no lo necesitan). Una
   * lectura de `products` por evaluación; si falla, los ítems quedan como
   * están (por unidad), que es el comportamiento anterior.
   */
  private async conModoVenta(items: PromotionItem[], promos: Promotion[]): Promise<PromotionItem[]> {
    if (!promos.some((p) => p.promotion_type === 'buy_x_get_y')) return items;
    const faltan = Array.from(new Set(items.filter((i) => i.sale_mode === undefined).map((i) => i.product_id)));
    if (faltan.length === 0) return items;
    try {
      const { data, error } = await supabase.from('products').select('id, sale_mode').in('id', faltan);
      if (error || !Array.isArray(data)) return items;
      const modos = new Map<number, string | null>(
        (data as Array<{ id: number; sale_mode: string | null }>).map((r) => [Number(r.id), r.sale_mode ?? null]),
      );
      return items.map((i) => (i.sale_mode === undefined && modos.has(i.product_id) ? { ...i, sale_mode: modos.get(i.product_id) } : i));
    } catch {
      return items;
    }
  }

  /**
   * Calcula el descuento total de una promoción (sin detallar por item).
   * Usado para comparar no-combinables vs combinables.
   */
  private calculateForPromotion(
    promo: Promotion,
    items: PromotionItem[],
  ): number {
    const applicable = this.aplicables(promo, items);
    if (applicable.length === 0) return 0;
    const { discountAmount } = this.calculatePromotionDiscount(promo, applicable);
    return discountAmount;
  }
}

// Singleton
export const promotionEngine = new PromotionEngineService();
