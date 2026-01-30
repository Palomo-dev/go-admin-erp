'use client';

import { useParams } from 'next/navigation';
import { EditarProveedorForm } from '@/components/inventario/proveedores/editar';

export default function EditarProveedorPage() {
  const params = useParams();
  const supplierUuid = params.id as string;

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <EditarProveedorForm supplierUuid={supplierUuid} />
    </div>
  );
}
