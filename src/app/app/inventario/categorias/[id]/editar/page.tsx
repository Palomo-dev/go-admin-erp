'use client';

import React from 'react';
import { CategoryForm } from '@/components/inventario/categorias';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditarCategoriaPage({ params }: PageProps) {
  const { id } = React.use(params);
  return <CategoryForm categoryUuid={id} />;
}
