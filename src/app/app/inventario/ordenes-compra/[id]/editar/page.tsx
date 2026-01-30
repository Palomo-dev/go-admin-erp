'use client';

import { useParams } from 'next/navigation';
import { EditarOrdenCompraForm } from '@/components/inventario/ordenes-compra/editar';

export default function EditarOrdenCompraPage() {
  const params = useParams();
  const orderUuid = params.id as string;

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <EditarOrdenCompraForm orderUuid={orderUuid} />
    </div>
  );
}
