'use client';

import { EgresoDetalle } from '@/components/finanzas/egresos';
import { useParams } from 'next/navigation';

export default function Page() {
  const params = useParams();
  const id = params.id as string;
  
  return <EgresoDetalle id={id} />;
}
