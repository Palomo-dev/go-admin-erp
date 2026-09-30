/**
 * Eslabón de origen de la cadena del detalle de factura según el canal de la
 * venta (`sales.source`). Antes se rotulaba siempre «Venta del POS», también
 * cuando la factura nació de un pedido de la tienda web.
 *
 * Calca Figma `07 Finanzas` › «Facturas de venta — detalle (B.2)» › «Detalle
 * factura de venta — origen de la venta»: web = «Pedido web» + número del
 * pedido (icono de pedido); POS = «Venta · Venta del POS»; creada desde una
 * factura = «Venta · Venta por factura».
 */
export interface OrigenVenta {
  canal: string | null;
  pedidoWebId: string | null;
  pedidoWebNumero: string | null;
}

/** Claves de `facturasVenta.detalle`. */
export type ClaveOrigenVenta = 'ventaOrigen' | 'ventaWeb' | 'ventaFactura';

export interface EslabonVentaOrigen {
  tipo: 'pedido' | 'venta';
  /** Rótulo del eslabón; `null` = el nombre del tipo («Venta»). */
  claveEtiqueta: 'ventaWeb' | null;
  /** Número a mostrar; si es `null`, se muestra el texto de `claveNumero`. */
  numero: string | null;
  claveNumero: ClaveOrigenVenta;
  href: string;
}

export function eslabonVentaOrigen(saleId: string, origen: OrigenVenta | null | undefined): EslabonVentaOrigen {
  const venta = `/app/pos/ventas/${saleId}`;
  const canal = origen?.canal ?? null;
  if (canal === 'web') {
    return {
      tipo: 'pedido',
      claveEtiqueta: 'ventaWeb',
      numero: origen?.pedidoWebNumero ?? null,
      claveNumero: 'ventaWeb',
      href: origen?.pedidoWebId ? `/app/pos/pedidos-online/${origen.pedidoWebId}` : venta,
    };
  }
  if (canal === 'invoice') return { tipo: 'venta', claveEtiqueta: null, numero: null, claveNumero: 'ventaFactura', href: venta };
  // «pos» y ventas sin canal conocido conservan el rótulo de siempre.
  return { tipo: 'venta', claveEtiqueta: null, numero: null, claveNumero: 'ventaOrigen', href: venta };
}
