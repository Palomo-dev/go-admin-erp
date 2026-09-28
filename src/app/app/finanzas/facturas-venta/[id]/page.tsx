'use client';

/**
 * Detalle de una factura de venta. La URL no cambia (hay enlaces desde otras
 * pantallas); el contenido lo arma el servidor (`GET /api/facturas-venta/[id]`)
 * y lo pinta `DetalleFacturaVenta` con el kit.
 */
import React from 'react';
import { DetalleFacturaVenta } from '@/components/finanzas/facturas-venta/detalle/DetalleFacturaVenta';

export default function FacturaDetallesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  return <DetalleFacturaVenta id={id} />;
}
