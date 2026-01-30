'use client';

import { NotaCreditoDetalle } from '@/components/finanzas/notas-credito';
import { useParams } from 'next/navigation';

export default function Page() {
  const params = useParams();
  const id = params.id as string;
  
  return <NotaCreditoDetalle id={id} />;
}
