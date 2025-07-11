import React from 'react';
import StockMinimoReporte from '@/components/inventario/stock-minimo/StockMinimoReporte';

/**
 * Página de reabastecimiento y alertas de stock mínimo
 * 
 * Esta página muestra los productos que están por debajo del umbral de stock mínimo
 * y permite generar órdenes de compra en lote, así como enviar notificaciones.
 * 
 * Funcionalidades:
 * - Reporte de ítems que están por debajo del umbral
 * - Generación de órdenes de compra en lote
 * - Notificaciones push/email
 */
export default function StockMinimoPage() {
  return (
    <div className="container mx-auto py-6 px-4">
      <StockMinimoReporte />
    </div>
  );
}
