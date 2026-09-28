import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { recipeService, type NecesidadIngrediente } from './recipeService';

export interface CompositeStockValidation {
  ok: boolean;
  message?: string;
  insufficientItems?: {
    productName: string;
    needed: number;
    available: number;
    unitCode: string;
  }[];
}

/** Hasta 3 decimales, sin ceros de relleno (1,5 · 0,333). */
const cifra = (n: number): string => String(Math.round(n * 1000) / 1000);

/** Mensaje y detalle a partir de las necesidades que devuelve el servidor. */
export function resultadoNecesidades(necesidades: readonly NecesidadIngrediente[]): CompositeStockValidation {
  const insufficientItems = necesidades
    .filter((n) => n.faltante > 0)
    .map((n) => ({ productName: n.nombre, needed: n.necesario, available: n.disponible, unitCode: n.unidad }));
  if (insufficientItems.length === 0) return { ok: true };
  const detalle = insufficientItems
    .map((i) => `"${i.productName}": necesitas ${cifra(i.needed)}${i.unitCode}, disponible ${cifra(i.available)}${i.unitCode}`)
    .join('; ');
  return { ok: false, message: `Stock insuficiente de ingredientes: ${detalle}`, insufficientItems };
}

/**
 * Valida que haya stock suficiente de los ingredientes de productos compuestos
 * antes de completar una venta.
 *
 * Una sola llamada por carrito a `fn_receta_necesidades`: el mismo resolutor y el
 * mismo cálculo que descuenta la venta (receta propia o la compartida del padre,
 * rinde, merma y conversión de unidades). Antes eran una receta y un stock por
 * ingrediente (N+1) y se ignoraban conversión y rendimiento.
 *
 * @param items - Items del carrito con product_id y quantity
 * @param branchId - ID de la sucursal donde se realiza la venta
 */
export async function validateCompositeStock(
  items: { product_id?: number; quantity: number }[],
  branchId: number
): Promise<CompositeStockValidation> {
  const conProducto = items
    .filter((i): i is { product_id: number; quantity: number } => !!i.product_id && Number(i.quantity) > 0)
    .map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity) }));
  if (conProducto.length === 0) return { ok: true };
  const necesidades = await recipeService.necesidades(getOrganizationId(), branchId, conProducto);
  return resultadoNecesidades(necesidades);
}
