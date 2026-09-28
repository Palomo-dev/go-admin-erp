'use client';

import { useParams } from 'next/navigation';
import { ProveedorDetalle } from '@/components/inventario/proveedores/detalle';

export default function ProveedorDetallePage() {
  const params = useParams();
  const supplierUuid = params?.id as string;

  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <ProveedorDetalle supplierUuid={supplierUuid} />
    </div>
  );
}