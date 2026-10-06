/**
 * Métodos con que se cobra en la caja de la sede un pedido web pagado en el
 * local (`fn_cobrar_pedido_web_en_caja`, migración E4). Una sola lista para el
 * detalle del pedido, el cobro en lote y la casilla «Marcar como pagado» del
 * diálogo de confirmación.
 *
 * La RPC exige un código activo de `payment_methods`. Verificado por MCP
 * (2026-10-06): `nequi` y `daviplata` existen con `is_active=false`, así que
 * cobrarlos tal cual daba METODO_INVALIDO. En caja son transferencias: se
 * cobran como `transfer`. Cualquier otro método (pasarela, crédito…) no es un
 * cobro de mostrador y cae en efectivo, como hacía el botón antes.
 */
export const METODOS_COBRO_EN_CAJA = ['cash', 'card', 'transfer', 'qr'] as const;

export type MetodoCobroEnCaja = (typeof METODOS_COBRO_EN_CAJA)[number];

const COMO_TRANSFERENCIA = new Set(['nequi', 'daviplata']);

export function metodoDeCobroEnCaja(metodoPedido: string | null | undefined): MetodoCobroEnCaja {
  const m = (metodoPedido ?? '').trim().toLowerCase();
  if ((METODOS_COBRO_EN_CAJA as readonly string[]).includes(m)) return m as MetodoCobroEnCaja;
  if (COMO_TRANSFERENCIA.has(m)) return 'transfer';
  return 'cash';
}
