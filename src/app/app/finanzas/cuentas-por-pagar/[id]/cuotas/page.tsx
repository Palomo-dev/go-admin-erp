'use client';

import { use } from 'react';
import { CuotasPage } from '@/components/finanzas/cuentas-por-pagar/id/cuotas';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CuotasPageRoute({ params }: PageProps) {
  const resolvedParams = use(params);
  
  return <CuotasPage accountId={resolvedParams.id} />;
}
