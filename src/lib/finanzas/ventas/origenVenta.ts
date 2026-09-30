/**
 * Eslabón «Venta» de la cadena del detalle de factura según el canal de la
 * venta de origen (`sales.source`). Antes se rotulaba siempre «Venta del POS»,
 * también cuando la factura nació de un pedido de la tienda web.
 */
export interface OrigenVenta {
  canal: string | null;
  pedidoWebId: string | null;
  pedidoWebNumero: string | null;
}

export type ClaveOrigenVenta = 'ventaOrigen' | 'ventaWeb' | 'ventaFactura';

export interface EslabonVentaOrigen {
  /** Clave de `facturasVenta.detalle` para el rótulo; si hay `numero`, se muestra ese en su lugar. */
  clave: ClaveOrigenVenta;
  numero: string | null;
  href: string;
}

export function eslabonVentaOrigen(saleId: string, origen: OrigenVenta | null | undefined): EslabonVentaOrigen {
  const canal = origen?.canal ?? null;
  if (canal === 'web') {
    return {
      clave: 'ventaWeb',
      numero: origen?.pedidoWebNumero ?? null,
      href: origen?.pedidoWebId ? `/app/pos/pedidos-online/${origen.pedidoWebId}` : `/app/pos/ventas/${saleId}`,
    };
  }
  if (canal === 'invoice') return { clave: 'ventaFactura', numero: null, href: `/app/pos/ventas/${saleId}` };
  // «pos» y ventas sin canal conocido conservan el rótulo de siempre.
  return { clave: 'ventaOrigen', numero: null, href: `/app/pos/ventas/${saleId}` };
}
