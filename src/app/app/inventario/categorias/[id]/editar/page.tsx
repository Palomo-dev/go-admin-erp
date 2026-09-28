'use client';

import React from 'react';
import { CategoryForm } from '@/components/inventario/categorias';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Editar categoría: el mismo formulario que el alta, con la ruta por `uuid`. */
export default function EditarCategoriaPage({ params }: PageProps) {
  const { id } = React.use(params);
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <CategoryForm categoryUuid={id} />
    </div>
  );
}
