'use client';

import { use } from 'react';
import { NuevoMovimientoPage } from '@/components/pos/cajas/movimientos';
import { CajaInvalida, UUID_CAJA } from '@/components/pos/cajas/comunesCaja';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function NuevoMovimiento({ params }: PageProps) {
  const { id } = use(params);
  if (!UUID_CAJA.test(id)) return <CajaInvalida />;
  return <NuevoMovimientoPage sessionUuid={id} />;
}
