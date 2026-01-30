'use client';

import { useParams } from 'next/navigation';
import { ProveedorDetalle } from '@/components/inventario/proveedores/detalle';

export default function ProveedorDetallePage() {
  const params = useParams();
  const supplierUuid = params.id as string;

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <ProveedorDetalle supplierUuid={supplierUuid} />
    </div>
  );
}
