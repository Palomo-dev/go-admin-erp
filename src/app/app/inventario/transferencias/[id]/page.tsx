'use client';

import React from 'react';
import { TransferenciaDetalle } from '@/components/inventario/transferencias/id/TransferenciaDetalle';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function TransferenciaDetallePage({ params }: PageProps) {
  const { id } = React.use(params);
  return <TransferenciaDetalle transferenciaId={/^\d{1,9}$/.test(id) ? Number(id) : 0} />;
}
