/**
 * Promociones y listas de precios (decisión 1 del dueño, 2026-11-24): una promoción con
 * `applies_with_price_lists = false` («No aplica a clientes con lista de precios») no toca las
 * líneas que van con precio de lista: el cliente paga su precio de lista.
 *
 * No se cambia el motor puro (`motorPromociones.ts`, idéntico byte a byte al de la tienda): se
 * adapta la FILA de la promoción antes de evaluarla, con reglas `exclude_product` para los
 * productos con lista. Una promoción de toda la cuenta (`applies_to = all`) pasa a «productos»
 * con solo exclusiones y la compra mínima sobre la cuenta (`min_purchase_scope = cart`), que en
 * el motor es exactamente «toda la cuenta menos lo excluido».
 */

interface ReglaMinima {
  rule_type: string;
  product_id?: number | null;
}

interface PromocionMinima {
  applies_to: string;
  applies_with_price_lists?: boolean | null;
  min_purchase_scope?: string | null;
  promotion_rules?: ReglaMinima[] | null;
  rules?: ReglaMinima[] | null;
}

interface ItemMinimo {
  product_id: number;
  price_list_id?: string | null;
}

export function promocionesConListas<P extends PromocionMinima>(promociones: readonly P[], items: readonly ItemMinimo[]): P[] {
  const conLista = Array.from(new Set(items.filter((i) => !!i.price_list_id && i.product_id > 0).map((i) => i.product_id)));
  if (conLista.length === 0) return [...promociones];
  return promociones.map((p) => {
    if (p.applies_with_price_lists !== false) return p;
    const exclusiones: ReglaMinima[] = conLista.map((id) => ({ rule_type: 'exclude_product', product_id: id }));
    const reglas = [...(p.promotion_rules ?? p.rules ?? []), ...exclusiones];
    if (p.applies_to === 'all') {
      return { ...p, applies_to: 'products', min_purchase_scope: p.min_purchase_scope ?? 'cart', promotion_rules: reglas, rules: reglas };
    }
    return { ...p, promotion_rules: reglas, rules: reglas };
  });
}
