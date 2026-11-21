'use client';

import React from 'react';
import { TransferenciasPage } from '@/components/inventario/transferencias/TransferenciasPage';

// Mismo contenedor que Producción y las demás páginas de Inventario: sin él, el contenido
// quedaba pegado al menú lateral y se salía por la derecha.
export default function InventarioTransferenciasPage() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <TransferenciasPage />
    </div>
  );
}
