'use client';

import { IngresoDetalle } from '@/components/finanzas/ingresos';
import { useParams } from 'next/navigation';

export default function Page() {
  const params = useParams();
  const id = params.id as string;
  
  return <IngresoDetalle id={id} />;
}
