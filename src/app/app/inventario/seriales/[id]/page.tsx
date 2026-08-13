'use client';

import { use } from 'react';
import { SerialDetailPage } from '@/components/inventario/seriales';

export default function InventarioSerialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const serialId = parseInt(id, 10);

  if (isNaN(serialId)) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">ID de serial inválido</p>
      </div>
    );
  }

  return <SerialDetailPage serialId={serialId} />;
}
