'use client';

import React from 'react';
import { EditarCategoriaForm } from '@/components/inventario/categorias/editar/EditarCategoriaForm';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function EditarCategoriaPage({ params }: PageProps) {
  const { id } = React.use(params);
  return <EditarCategoriaForm categoriaId={parseInt(id)} />;
}
