'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { CategoryForm } from '@/components/inventario/categorias';

export default function NuevaCategoriaPage() {
  const searchParams = useSearchParams();
  const parentParam = searchParams.get('parent');
  const defaultParentId = parentParam ? parseInt(parentParam) : null;

  return <CategoryForm defaultParentId={defaultParentId} />;
}
