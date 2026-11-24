/**
 * Vocabulario de Pedidos online según el negocio (2026-11-24): un restaurante
 * «prepara» en cocina; una tienda «alista» el pedido para enviarlo o para que
 * lo recojan. Solo cambia la presentación (íconos y textos): los estados de
 * `web_orders` y la confirmación son los mismos para todos.
 *
 * La regla es la de los avisos al cliente (`rubroDeTipoOrg`, en
 * `avisosCliente.ts`) y la de la tienda web (`goadmin-websites/lib/orders/
 * consultaPedido.ts`): solo el tipo `restaurant` prepara; cualquier otro tipo
 * (comercio, servicios, hotel, gimnasio…) usa el vocabulario de tienda.
 *
 * Puro: sin React ni Supabase.
 */
import type { DatosAviso } from './avisosCliente';

export type RubroPedidos = NonNullable<DatosAviso['rubro']>;

/**
 * `organization_types.id` del tipo `restaurant` (verificado en la base el
 * 2026-11-24). En el navegador la organización solo trae `type_id`, no el
 * nombre del tipo: por eso esta versión de la regla va por id.
 */
export const ID_TIPO_ORG_RESTAURANTE = 1;

/**
 * Misma regla que `rubroDeTipoOrg`, a partir de `organizations.type_id`.
 * Sin dato: tienda, igual que el resto de Pedidos online (`type_id ?? 3`).
 */
export function rubroDeTipoOrgId(typeId: number | null | undefined): RubroPedidos {
  return typeId === ID_TIPO_ORG_RESTAURANTE ? 'restaurante' : 'tienda';
}

/**
 * Clave de next-intl según el rubro: la tienda lee la hermana `…Tienda` del
 * mismo namespace (`filaAcciones.preparar` → `filaAcciones.prepararTienda`).
 * El restaurante sigue con la clave de siempre.
 */
export function claveRubro(clave: string, rubro: RubroPedidos): string {
  return rubro === 'tienda' ? `${clave}Tienda` : clave;
}

/**
 * Estado del pedido (o de la línea) para `estados.${…}`: solo «preparing»
 * cambia de palabra («Alistando» en una tienda); el resto se llama igual.
 */
export function claveEstadoPedido(estado: string, rubro: RubroPedidos): string {
  return estado === 'preparing' ? claveRubro(estado, rubro) : estado;
}
