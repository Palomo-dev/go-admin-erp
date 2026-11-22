'use client';

import { DistribucionPage } from '@/components/inventario/distribucion';

// Mismo contenedor que Producción y las demás páginas de Inventario: sin él, el contenido
// quedaba pegado al menú lateral.
export default function Page() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <DistribucionPage />
    </div>
  );
}
