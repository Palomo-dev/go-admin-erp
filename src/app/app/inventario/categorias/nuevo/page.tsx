'use client';

import { useSearchParams } from 'next/navigation';
import { CategoryForm } from '@/components/inventario/categorias';

/** Nueva categoría. `?parent={id}` la crea como subcategoría («Agregar subcategoría»). */
export default function NuevaCategoriaPage() {
  const searchParams = useSearchParams();
  const padre = Number(searchParams?.get('parent') ?? '');
  const defaultParentId = Number.isInteger(padre) && padre > 0 ? padre : null;

  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <CategoryForm defaultParentId={defaultParentId} />
    </div>
  );
}
