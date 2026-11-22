'use client';

/**
 * «Registrar venta nueva» (Figma 2719:190584): cuando la nota crédito de una
 * devolución ya fue aceptada por la DIAN, la devolución no se anula; si el
 * cliente se queda otra vez con el producto, se hace una venta nueva con su
 * factura nueva. Aquí solo se prepara el carrito del POS con los productos de
 * la devolución, con el mismo mecanismo de «Duplicar venta»
 * (`llevarLineasAlPos`): nada se cobra ni se escribe en la base. El carrito
 * lleva la devolución (`resale_of_return_id`): si se cobra, `pos_checkout_v1`
 * enlaza la venta nueva con la devolución; si se abandona, no queda nada.
 */
import { llevarLineasAlPos, type ResultadoDuplicarEnPos } from '@/lib/pos/ventas/duplicarEnPos';
import { pedirDetalleDevolucion } from './clienteDevoluciones';

export async function venderDeNuevoEnPos(devolucionId: string): Promise<ResultadoDuplicarEnPos> {
  const dev = await pedirDetalleDevolucion(devolucionId);
  return llevarLineasAlPos(
    dev.lineas.map((l) => ({ product_id: l.producto.id, quantity: l.cantidad, products: { name: l.producto.nombre } })),
    dev.sucursal.id,
    { reventaDeDevolucion: dev.id },
  );
}
