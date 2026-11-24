/**
 * Registro de promociones de un pedido web (`sale_promotions`, migración 20261124235000): qué
 * promoción quedó, cuánto ahorró, cuántas unidades y en qué escalón. Módulo puro: lo usa
 * `exclusionPromocionPedido.ts` al quitar o devolver la promoción de una línea.
 */

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function redondear(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Fila de `sale_promotions` de un pedido web (`fn_pedido_web_promociones_guardar`). */
export interface FilaPromocionPedido {
  promotion_id: string;
  discount_amount: number;
  units: number;
  units_by_tier: Record<string, number> | null;
  summary: string | null;
}

/**
 * Ahorro, unidades, unidades por escalón y resumen («6 × Gaseosa») de cada promoción aplicada,
 * desde el resultado del motor (`montos_linea` / `escalon_linea`). Pura: la prueban los tests.
 */
export function filasPromocionesPedido(
  aplicadas: ReadonlyArray<{
    promotion_id: string;
    discount_amount: number;
    lineas: number[];
    montos_linea?: Record<number, number>;
    escalon_linea?: Record<number, number>;
  }>,
  items: ReadonlyArray<{ quantity: unknown; product_name?: string | null }>,
): FilaPromocionPedido[] {
  return aplicadas
    .filter((a) => n(a.discount_amount) > 0)
    .map((a) => {
      const montos = a.montos_linea ?? {};
      const lineas = a.lineas.filter((i) => items[i] && (a.montos_linea ? n(montos[i]) > 0 : true));
      const units = lineas.reduce((s, i) => s + n(items[i].quantity), 0);
      const porEscalon: Record<string, number> = {};
      for (const i of lineas) {
        const e = a.escalon_linea?.[i];
        if (e) porEscalon[String(e)] = (porEscalon[String(e)] ?? 0) + n(items[i].quantity);
      }
      const principal = [...lineas].sort((x, y) => n(montos[y]) - n(montos[x]) || x - y)[0];
      const it = principal !== undefined ? items[principal] : null;
      return {
        promotion_id: a.promotion_id,
        discount_amount: redondear(n(a.discount_amount)),
        units,
        units_by_tier: Object.keys(porEscalon).length > 0 ? porEscalon : null,
        summary: it ? `${n(it.quantity)} × ${String(it.product_name ?? '').trim()}`.slice(0, 160) : null,
      };
    });
}
