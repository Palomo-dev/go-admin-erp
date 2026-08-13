'use client';

import { use } from 'react';
import { GarantiaDetailPage } from '@/components/inventario/garantias';

export default function InventarioGarantiaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return <GarantiaDetailPage claimId={id} />;
}
