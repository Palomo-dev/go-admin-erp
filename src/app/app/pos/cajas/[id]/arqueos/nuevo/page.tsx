'use client';

import { use } from 'react';
import { NuevoArqueoPage } from '@/components/pos/cajas/arqueos';
import { CajaInvalida, UUID_CAJA } from '@/components/pos/cajas/comunesCaja';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function NuevoArqueo({ params }: PageProps) {
  const { id } = use(params);
  if (!UUID_CAJA.test(id)) return <CajaInvalida />;
  return <NuevoArqueoPage sessionUuid={id} />;
}
