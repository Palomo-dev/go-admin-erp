'use client';

import { useParams } from 'next/navigation';
import { CuponDetalle } from '@/components/pos/cupones/CuponDetalle';

export default function CuponDetallePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  if (!id) return null;
  return <CuponDetalle key={id} id={id} />;
}
