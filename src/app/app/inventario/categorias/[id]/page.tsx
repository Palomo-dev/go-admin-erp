'use client';

import React from 'react';
import { DetalleCategoria } from '@/components/inventario/categorias/DetalleCategoria';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Detalle de categoría: la ruta usa el `uuid` (`categories.uuid`). */
export default function CategoriaDetallePage({ params }: PageProps) {
  const { id } = React.use(params);
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <DetalleCategoria uuid={id} />
    </div>
  );
}
