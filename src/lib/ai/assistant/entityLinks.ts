/**
 * GO Asistente — «Ver <entidad>» en la tarjeta completada (Figma pantalla 07,
 * `667:36967`: «Ver cliente»).
 *
 * Las herramientas devuelven `entity: { type, id }` y solo la factura de venta
 * traía además su `url`. Sin esto, la tarjeta completada de «Crear cliente» —la
 * única acción que se ha usado de verdad— no podía llevar al cliente creado.
 *
 * No es una lista de módulos ni de menú: es la ficha de detalle de cada tipo
 * de entidad que el asistente puede crear. Cada ruta la comprueba
 * `goAssistantFigmaEscritorio.test.ts` contra `src/app/app/**` (que exista la
 * carpeta `[id]`), así que no puede apuntar a una pantalla que no existe. Si
 * la persona no tiene acceso a ese módulo, la propia página se lo dice: el
 * enlace no concede nada.
 */

export type TipoEntidadEnlazable =
  | 'customer'
  | 'product'
  | 'sale'
  | 'purchase_order'
  | 'inventory_transfer'
  | 'inventory_adjustment'
  | 'invoice_purchase'
  | 'invoice_sales';

/** Carpeta de la ficha de detalle (debe tener un `[id]/page.tsx`). */
export const RUTAS_DETALLE: Readonly<Record<TipoEntidadEnlazable, string>> = Object.freeze({
  customer: '/app/clientes',
  product: '/app/inventario/productos',
  sale: '/app/pos/ventas',
  purchase_order: '/app/inventario/ordenes-compra',
  inventory_transfer: '/app/inventario/transferencias',
  inventory_adjustment: '/app/inventario/ajustes',
  invoice_purchase: '/app/finanzas/facturas-compra',
  invoice_sales: '/app/finanzas/facturas-venta',
});

export interface EntidadResultado {
  type: string;
  id: string | number;
  url?: string;
}

/** Solo rutas internas del ERP: nada de `//host` ni `javascript:`. */
function esRutaInterna(url: string): boolean {
  return url.startsWith('/app/') && !url.startsWith('//') && !/[\s<>"']/.test(url);
}

/**
 * Enlace a la entidad resultante. Manda la `url` del servidor si la trae (y es
 * interna); si no, la ficha de su tipo. `null` cuando no hay a dónde ir (una
 * carga masiva, un adjunto) o el id no es válido.
 */
export function enlaceEntidad(entidad: EntidadResultado | null | undefined): string | null {
  if (!entidad) return null;
  if (typeof entidad.url === 'string' && esRutaInterna(entidad.url)) return entidad.url;
  const base = RUTAS_DETALLE[entidad.type as TipoEntidadEnlazable];
  if (!base) return null;
  const id = String(entidad.id ?? '').trim();
  // uuid o entero positivo; cualquier otra cosa no se pega a una URL.
  if (!/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[1-9]\d*)$/i.test(id)) return null;
  return `${base}/${id}`;
}

/** Tipo de entidad para el texto del botón («Ver cliente»); `null` = «Ver». */
export function tipoEnlazable(tipo: string | null | undefined): TipoEntidadEnlazable | null {
  return tipo && tipo in RUTAS_DETALLE ? (tipo as TipoEntidadEnlazable) : null;
}
