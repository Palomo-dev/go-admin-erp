'use client';

import { use } from 'react';
import { CajaDetallePage } from '@/components/pos/cajas/detalle';
import { CajaInvalida, UUID_CAJA } from '@/components/pos/cajas/comunesCaja';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CajaDetalle({ params }: PageProps) {
  const { id } = use(params);
  if (!UUID_CAJA.test(id)) return <CajaInvalida />;
  return <CajaDetallePage sessionUuid={id} />;
}
