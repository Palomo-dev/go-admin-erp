'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { PageHeaderSkeleton, DetailSkeleton } from '@/components/common/PageSkeletons';
import { DetalleProducto } from '@/components/inventario/productos/detalle/DetalleProducto';

/**
 * Detalle de producto. El id de la URL es el uuid; la organización sale de la
 * sesión y todas las lecturas filtran por ella.
 */
export default function ProductoDetallePage() {
  const params = useParams();
  const uuid = (params?.id as string) ?? '';

  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-4 sm:p-6">
          <PageHeaderSkeleton />
          <DetailSkeleton />
        </div>
      }
    >
      <DetalleProducto uuid={uuid} />
    </Suspense>
  );
}
