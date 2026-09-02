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
  WeekDay,
  JS_DAY_TO_WEEKDAY,
} from '@/components/pos/promociones/types';

// --- Tipos públicos ---

export type PromotionChannel = 'pos' | 'web' | 'finances';

export interface PromotionItem {
  product_id: number;
  category_id?: number;
  brand?: string;
  quantity: number;
  unit_price: number;
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

    let promos: Promotion[] = (data || []) as Promotion[];

    // Filtrar end_date en memoria (PostgREST no soporta or(is.null,gte) fácilmente
    // combinado con otros filtros en una sola query sin RPC)
    promos = promos.filter((p) => {
      if (!p.end_date) return true;
      return new Date(p.end_date) >= date;
    });

    // Filtrar por día de la semana
    const dayName: WeekDay = JS_DAY_TO_WEEKDAY[date.getDay()];
    promos = promos.filter((p) => {
      if (!p.applicable_days || p.applicable_days.length === 0) return true;
      return p.applicable_days.includes(dayName);
    });

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

    for (const rule of rules) {
      switch (rule.rule_type) {
        case 'include_product':
          if (rule.product_id === item.product_id) included = true;
          break;
        case 'exclude_product':
          if (rule.product_id === item.product_id) excluded = true;
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
   */
  private calculatePromotionDiscount(
    promotion: Promotion,
    applicableItems: PromotionItem[],
  ): { discountAmount: number; perItem: Record<number, number> } {
    const perItem: Record<number, number> = {};
    let totalDiscount = 0;

    const subtotal = applicableItems.reduce(
      (sum, i) => sum + i.unit_price * i.quantity,
      0,
    );

    switch (promotion.promotion_type) {
      case 'percentage': {
        const pct = Number(promotion.discount_value || 0) / 100;
        for (const item of applicableItems) {
          const lineTotal = item.unit_price * item.quantity;
          const d = Math.round(lineTotal * pct * 100) / 100;
          if (d > 0) {
            perItem[item.product_id] = (perItem[item.product_id] || 0) + d;
            totalDiscount += d;
          }
        }
        break;
      }

      case 'fixed': {
        // Monto fijo distribuido proporcionalmente entre los items aplicables
        const fixed = Number(promotion.discount_value || 0);
        if (subtotal > 0 && fixed > 0) {
          for (const item of applicableItems) {
            const ratio = (item.unit_price * item.quantity) / subtotal;
            const d = Math.round(fixed * ratio * 100) / 100;
            if (d > 0) {
              perItem[item.product_id] = (perItem[item.product_id] || 0) + d;
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
        const buyQty = promotion.buy_quantity || 0;
        const getQty = promotion.get_quantity || 0;
        if (buyQty > 0 && getQty > 0) {
          // Agrupar items por product_id para aplicar X+Y dentro del mismo producto
          const byProduct = new Map<number, PromotionItem[]>();
          for (const item of applicableItems) {
            const arr = byProduct.get(item.product_id) || [];
            arr.push(item);
            byProduct.set(item.product_id, arr);
          }

          for (const [, items] of byProduct) {
            const totalQty = items.reduce((s, i) => s + i.quantity, 0);
            const sets = Math.floor(totalQty / (buyQty + getQty));
            if (sets <= 0) continue;
            // El más barato del grupo es el que se regala
            const sorted = [...items].sort((a, b) => a.unit_price - b.unit_price);
            let remainingFree = sets * getQty;
            for (const item of sorted) {
              if (remainingFree <= 0) break;
              const free = Math.min(remainingFree, item.quantity);
              const d = Math.round(free * item.unit_price * 100) / 100;
              if (d > 0) {
                perItem[item.product_id] = (perItem[item.product_id] || 0) + d;
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
          for (const item of applicableItems) {
            const ratio = (item.unit_price * item.quantity) / subtotal;
            const itemD = Math.round(d * ratio * 100) / 100;
            perItem[item.product_id] = (perItem[item.product_id] || 0) + itemD;
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
      totalDiscount = cap;
    }

    return { discountAmount: totalDiscount, perItem };
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

    // 4. Separar combinables de no combinables
    const nonCombinable = eligible.filter((p) => !p.is_combinable);
    const combinable = eligible.filter((p) => p.is_combinable);

    // 5. Estrategia: si hay no-combinables, tomar la de mayor prioridad
    // y aplicar sola. Si no, aplicar todas las combinables.
    let toApply: Promotion[] = [];

    if (nonCombinable.length > 0) {
      // Tomar la de mayor prioridad (ya ordenadas desc por priority)
      const best = nonCombinable[0];
      const bestDiscount = this.calculateForPromotion(best, ctx.items);
      const combinableDiscount = combinable.reduce(
        (sum, p) => sum + this.calculateForPromotion(p, ctx.items),
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
    const applied: AppliedPromotion[] = [];
    let discountTotal = 0;

    for (const promo of toApply) {
      const applicableItems = ctx.items.filter((item) =>
        this.itemMatchesRules(item, promo.rules || [], promo.applies_to),
      );

      if (applicableItems.length === 0) continue;

      const { discountAmount, perItem } = this.calculatePromotionDiscount(
        promo,
        applicableItems,
      );

      if (discountAmount <= 0) continue;

      for (const [pid, amt] of Object.entries(perItem)) {
        itemDiscounts[Number(pid)] = (itemDiscounts[Number(pid)] || 0) + amt;
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
      applied,
      items: itemsWithDiscount,
    };
  }

  /**
   * Calcula el descuento total de una promoción (sin detallar por item).
   * Usado para comparar no-combinables vs combinables.
   */
  private calculateForPromotion(
    promo: Promotion,
    items: PromotionItem[],
  ): number {
    const applicable = items.filter((item) =>
      this.itemMatchesRules(item, promo.rules || [], promo.applies_to),
    );
    if (applicable.length === 0) return 0;
    const { discountAmount } = this.calculatePromotionDiscount(promo, applicable);
    return discountAmount;
  }
}

// Singleton
export const promotionEngine = new PromotionEngineService();
