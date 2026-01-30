'use client';

import { TransferenciaDetalle } from '@/components/finanzas/transferencias';
import { useParams } from 'next/navigation';

export default function Page() {
  const params = useParams();
  const id = params.id as string;
  
  return <TransferenciaDetalle id={id} />;
}
