'use client';

import React, { use } from 'react';
import { MovimientosPage } from '@/components/finanzas/bancos/cuentas/MovimientosPage';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function MovimientosBancariosPage({ params }: PageProps) {
  const { id } = use(params);
  return <MovimientosPage accountId={id} />;
}
