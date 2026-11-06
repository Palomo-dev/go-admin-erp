'use client';

import React, { use } from 'react';
import { AsientoPendientePage } from '@/components/finanzas/contabilidad/pendientes/AsientoPendientePage';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function Page({ params }: PageProps) {
  const { id } = use(params);
  return <AsientoPendientePage failureId={Number(id)} />;
}
