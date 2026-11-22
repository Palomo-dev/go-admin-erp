'use client';

import { Suspense, use } from 'react';
import { LiquidacionDetalle } from '@/components/pos/propinas/LiquidacionDetalle';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Detalle de una liquidación de propinas (LIQ-000001). El servidor valida el id y la organización. */
export default function LiquidacionPropinasRoute({ params }: PageProps) {
  const { id } = use(params);
  return (
    <Suspense>
      <LiquidacionDetalle id={id} />
    </Suspense>
  );
}
