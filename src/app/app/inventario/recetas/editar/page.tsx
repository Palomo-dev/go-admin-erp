'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { EditorRecetaPagina } from '@/components/inventario/recetas';

function Contenido() {
  const params = useSearchParams();
  const valor = params?.get('producto') ?? '';
  const productoId = /^\d{1,9}$/.test(valor) ? Number(valor) : null;
  return <EditorRecetaPagina key={productoId ?? 'nueva'} productoId={productoId} />;
}

/** Crear (sin `?producto`) o editar la receta de un producto con el mismo editor del formulario. */
export default function InventarioEditarRecetaPage() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <Suspense fallback={null}>
        <Contenido />
      </Suspense>
    </div>
  );
}
