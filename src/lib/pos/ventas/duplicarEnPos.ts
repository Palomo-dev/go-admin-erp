'use client';

/**
 * «Duplicar venta» / «Nueva venta» (D3 de docs/implementacion/CAJAS-VENTAS-PLAN.md):
 * la venta nueva se hace en la pantalla del POS, no en un carrito propio.
 *
 * Para duplicar se crea un carrito NUEVO del POS con las líneas de la venta
 * (`lineasDuplicadas`: cantidades conservadas, precio vigente de hoy) usando
 * el mismo servicio del POS (`POSService.createCart` / `addItemToCart`, que
 * guardan en `pos_carts_<org>`); al abrir `/app/pos` el POS lo carga con sus
 * demás carritos. Nada se cobra ni se escribe en la base aquí.
 */
import { POSService } from '@/lib/services/posService';
import { getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { pedirDetalleVenta } from './clienteVentas';
import { lineasDuplicadas } from './lineasDuplicadas';

export interface ResultadoDuplicarEnPos {
  agregadas: number;
  /** Líneas sin producto, producto inexistente o sin precio vigente. */
  omitidas: number;
}

export async function duplicarVentaEnPos(ventaId: string): Promise<ResultadoDuplicarEnPos> {
  const venta = await pedirDetalleVenta(ventaId);
  const { lineas, omitidas } = lineasDuplicadas(
    venta.lineas.map((l) => ({ product_id: l.product_id, quantity: l.cantidad, products: { name: l.nombre } })),
  );
  const sucursal = getCurrentBranchId() ?? venta.sucursal.id;
  const carrito = await POSService.createCart(sucursal);
  let agregadas = 0;
  let fallidas = 0;
  for (const linea of lineas) {
    try {
      const producto = await POSService.getProductById(linea.product_id);
      if (!producto) {
        fallidas++;
        continue;
      }
      await POSService.addItemToCart(carrito.id, producto, linea.quantity);
      agregadas++;
    } catch {
      // Sin precio vigente u otro rechazo del POS: la línea no se lleva.
      fallidas++;
    }
  }
  return { agregadas, omitidas: omitidas + fallidas };
}
