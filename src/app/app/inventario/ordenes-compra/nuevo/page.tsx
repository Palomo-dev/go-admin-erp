'use client';

import { NuevaOrdenCompraForm } from '@/components/inventario/ordenes-compra/nuevo';

export default function NuevaOrdenCompraPage() {
  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <NuevaOrdenCompraForm />
    </div>
  );
}
