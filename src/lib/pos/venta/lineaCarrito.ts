/**
 * Línea del carrito del POS (paso 6 del plan): cómo una línea del carrito
 * (`CartItem`) se pinta con `CartLine` y `CartTag` del kit. Sin React.
 *
 * **No calcula importes**: el total, el precio unitario y el impuesto de la
 * línea llegan ya calculados por `POSService` y se pasan tal cual (L25; la
 * semántica de «Excluir impuesto» e «Incluido» no cambia,
 * POS-CARRITO-LINEAS-NOTAS.md §7). Aquí solo se decide QUÉ texto y qué tono.
 */
import type { Category, CartItem, Product } from '@/components/pos/types';
import type { ImpuestoLinea } from '@/components/kit/cartLineLogica';
import type { TonoCartTag } from '@/components/kit/cartTagLogica';
import type { KitchenTicket } from '@/lib/services/kitchenService';
import type { EstadoCocinaLinea } from '@/lib/pos/cocina/lineasCarrito';

/**
 * `item.product` en el carrito trae más que `Product`: la categoría puede
 * venir como objeto o como array (según el join), y las variantes traen
 * `variant_data`. Solo lo que el carrito lee. (Movido literal de CartView.)
 */
export type CartProduct = Product & {
  categories?: Category | Category[] | null;
  variant_data?: Record<string, string> | null;
};

/** ¿La categoría del producto exige preparación en cocina? (objeto o array, según el join). Movido literal de CartView. */
export function requiresPreparation(product: CartProduct | undefined): boolean {
  const cat = product?.category ?? product?.categories;
  const first = Array.isArray(cat) ? cat[0] : cat;
  return first?.requires_preparation === true;
}

/**
 * Impuesto de la línea para `CartLine`, con lo que ya trae la línea:
 * - excluida por el cajero (`tax_excluded`) → «Sin impuesto» y la etiqueta
 *   «Sin impuesto (excluido)» (la pone `CartLine`);
 * - sin impuesto configurado (ni producto ni organización: `useLineasSinImpuesto`,
 *   la regla de `resolveLineTax`) → «Sin impuesto asignado» (antes
 *   `EtiquetaSinImpuesto`);
 * - si no, el `tax_amount` del servicio, incluido o encima según `tax_included`
 *   (como hoy: solo se dice algo con importe > 0).
 */
export function impuestoDeLinea(
  item: Pick<CartItem, 'tax_excluded' | 'tax_included' | 'tax_amount'>,
  sinImpuestoAsignado: boolean,
): ImpuestoLinea {
  if (item.tax_excluded) return { modo: 'excluido' };
  if (sinImpuestoAsignado) return { modo: 'sinAsignar' };
  return { modo: item.tax_included ? 'incluido' : 'encima', importe: item.tax_amount ?? null };
}

/**
 * Variante elegida en gris junto al nombre («Talla: 40 · Color: Negro»). Los
 * valores vacíos se omiten (el mismo filtro `!!v` de antes).
 */
export function varianteDeProducto(product: Pick<CartProduct, 'variant_data'> | undefined | null): string | null {
  const datos = product?.variant_data;
  if (!datos) return null;
  const partes = Object.entries(datos)
    .filter(([, v]) => !!v)
    .map(([atributo, valor]) => `${atributo}: ${valor}`);
  return partes.length > 0 ? partes.join(' · ') : null;
}

export type EstadoTicketCocina = KitchenTicket['status'];

/** Etiqueta del estado del ticket de cocina en una línea que se prepara (clave de `posVenta.carrito.cocina`). */
export function vistaEstadoTicket(estado: string): { clave: EstadoTicketCocina; tono: TonoCartTag } {
  switch (estado) {
    case 'preparing':
      return { clave: 'preparing', tono: 'informacion' };
    case 'ready':
      return { clave: 'ready', tono: 'exito' };
    case 'delivered':
      return { clave: 'delivered', tono: 'neutro' };
    default:
      // Estado desconocido: como hoy, se lee como «Enviado a cocina».
      return { clave: 'new', tono: 'informacion' };
  }
}

/** Tono de la etiqueta del estado de la línea frente a lo enviado a cocina (`sin_enviar` no lleva etiqueta). */
export function tonoEstadoCocinaLinea(estado: EstadoCocinaLinea): TonoCartTag | null {
  if (estado === 'sin_enviar') return null;
  return estado === 'enviada' ? 'neutro' : 'advertencia';
}

/** Tono de la nota de la línea: cocina azul, alergia peligro, cliente éxito (POS-CARRITO-LINEAS-NOTAS). */
export function tonoNota(destino: 'cocina' | 'cliente', alergia: boolean): TonoCartTag {
  if (destino === 'cliente') return 'exito';
  return alergia ? 'peligro' : 'informacion';
}

/**
 * Qué hacer cuando la línea pide otra cantidad: llegar a 0 (o menos) con «−»
 * pide confirmación antes de quitar (C-11); cualquier otra cantidad se cambia
 * directo. El servicio sigue quitando la línea con cantidad ≤ 0 (L7).
 */
export function accionCantidad(pedida: number): 'confirmarQuitar' | 'cambiar' {
  return pedida <= 0 ? 'confirmarQuitar' : 'cambiar';
}

/**
 * Líneas recién agregadas (resaltado de ~1 s, D3c): ids que no estaban en la
 * versión anterior del MISMO carrito. Sin versión anterior (primer render o
 * cambio de carrito) no se resalta nada.
 */
export function lineasRecienAgregadas(anteriores: ReadonlySet<string> | null, ids: readonly string[]): string[] {
  if (!anteriores) return [];
  return ids.filter((id) => !anteriores.has(id));
}

/** Id de la línea vecina para ↑ / ↓ (sin salirse de la lista), o `null` si no hay líneas. */
export function lineaVecina(ids: readonly string[], actual: string | null, paso: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const i = actual ? ids.indexOf(actual) : -1;
  if (i < 0) return ids[0];
  return ids[Math.min(ids.length - 1, Math.max(0, i + paso))];
}
