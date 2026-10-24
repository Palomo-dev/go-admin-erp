'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { PageHeaderSkeleton, DetailSkeleton } from '@/components/common/PageSkeletons';
import { DetalleProducto } from '@/components/inventario/productos/detalle/DetalleProducto';

/**
 * Detalle de producto. El parámetro de la URL es el id numérico o el uuid; la
 * organización sale de la sesión y todas las lecturas filtran por ella.
 */
export default function ProductoDetallePage() {
  const params = useParams();
  const ident = (params?.id as string) ?? '';

  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-4 sm:p-6">
          <PageHeaderSkeleton />
          <DetailSkeleton />
        </div>
      }
    >
      <DetalleProducto ident={ident} />
    </Suspense>
  );
}
