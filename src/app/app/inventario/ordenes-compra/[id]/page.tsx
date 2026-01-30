'use client';

import { useParams } from 'next/navigation';
import { OrdenCompraDetalle } from '@/components/inventario/ordenes-compra/detalle';

export default function OrdenCompraDetallePage() {
  const params = useParams();
  const orderUuid = params.id as string;

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <OrdenCompraDetalle orderUuid={orderUuid} />
    </div>
  );
}
