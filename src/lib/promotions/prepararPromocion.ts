import type { CreatePromotionData, CreatePromotionRuleData } from '@/components/pos/promociones/types';

/** Entero mayor que cero. Vacío, cero o negativo quedan en null. */
export function enteroPositivoONull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Deja en null lo que el tipo no usa. El formulario arranca con
 * `buy_quantity = 2` y `get_quantity = 1` para Compra X Lleva Y; en los
 * demás tipos eso no significa nada y no debe guardarse. El mínimo de
 * unidades queda en `min_quantity`. No se copia `buy_quantity` al guardar:
 * en una promo nueva ese 2 es el valor por defecto del otro tipo. Las filas
 * que ya lo tienen guardado las lee el motor.
 *
 * Si no viene `promotion_type` (activar o desactivar), no toca cantidades:
 * un update parcial no puede borrar la configuración.
 */
export function prepararPromocion<T extends Partial<CreatePromotionData>>(datos: T): T {
  if (!('promotion_type' in datos) || datos.promotion_type == null) return datos;
  const out: T = { ...datos };
  const tipo = out.promotion_type;
  if (tipo !== 'buy_x_get_y') {
    out.buy_quantity = null;
    out.get_quantity = null;
  }
  const conMinimo = tipo === 'percentage' || tipo === 'fixed_amount' || tipo === 'bundle';
  out.min_quantity = conMinimo ? enteroPositivoONull(out.min_quantity) : null;
  const conRepeticion = tipo === 'percentage' || tipo === 'fixed_amount';
  out.repeat_every_quantity = conRepeticion ? enteroPositivoONull(out.repeat_every_quantity) : null;
  const alcance = out.min_purchase_scope;
  if (out.applies_to === 'all' || (alcance !== 'cart' && alcance !== 'eligible')) {
    out.min_purchase_scope = null;
  }
  return out;
}

/** Unidades de la regla que se persisten. Fuera de un paquete incluido, null. */
export function cantidadDeRegla(rule: CreatePromotionRuleData, tipo: string | undefined): number | null {
  if (tipo !== 'bundle' || rule.rule_type !== 'include_product') return null;
  return enteroPositivoONull(rule.quantity) ?? 1;
}
