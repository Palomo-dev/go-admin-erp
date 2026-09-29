'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import { DetallePlan } from '@/components/membresias/planes/DetallePlan';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Detalle del plan ligado a su producto (Figma B2 981:612094). El servidor valida que sea de la organización. */
export default function PlanDetallePage({ params }: PageProps) {
  const { id } = use(params);
  const n = /^\d{1,9}$/.test(id) ? Number(id) : 0;
  if (n <= 0) notFound();
  return (
    <div className="min-h-full bg-canvas">
      <DetallePlan key={n} id={n} />
    </div>
  );
}
