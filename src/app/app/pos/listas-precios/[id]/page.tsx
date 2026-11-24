'use client';

import { useParams } from 'next/navigation';
import { DetalleListaPrecios } from '@/components/listasPrecios/DetalleListaPrecios';

export default function Page() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : '';
  return <DetalleListaPrecios key={id} id={id} />;
}
