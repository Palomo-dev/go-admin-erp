'use client';

import { use } from 'react';
import { ComprobanteImprimible } from '@/components/finanzas/contabilidad/asientos/ComprobanteImprimible';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ComprobanteImprimible entryId={parseInt(id, 10)} />;
}
