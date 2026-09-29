'use client';

import { use } from 'react';
import { SerialDetailPage } from '@/components/inventario/seriales';

/**
 * Detalle de un serial. Un id que no es un entero positivo llega como 0: la
 * ruta de la API responde 404 y la pantalla muestra «no encontrado».
 */
export default function InventarioSerialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const serialId = /^\d{1,10}$/.test(id) ? Number(id) : 0;
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <SerialDetailPage serialId={serialId} />
    </div>
  );
}
