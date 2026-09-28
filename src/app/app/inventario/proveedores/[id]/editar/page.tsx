'use client';

import { useParams } from 'next/navigation';
import { EditarProveedorForm } from '@/components/inventario/proveedores/editar';

export default function EditarProveedorPage() {
  const params = useParams();
  const supplierUuid = params?.id as string;

  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <EditarProveedorForm supplierUuid={supplierUuid} />
    </div>
  );
}