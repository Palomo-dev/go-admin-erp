'use client';

import FacturasCompraListado from '@/components/finanzas/facturas-compra/listado/FacturasCompraListado';

export default function FacturasCompra() {
  return (
    // Mismo margen que el resto de pantallas rediseñadas (p-4 · sm:p-6): el
    // componente no lo trae y todo quedaba pegado al borde (2026-09-28).
    <div className="p-4 sm:p-6">
      <FacturasCompraListado />
    </div>
  );
}
