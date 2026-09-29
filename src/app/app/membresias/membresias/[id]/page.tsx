'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import DetalleMembresia from '@/components/membresias/detalle/DetalleMembresia';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Detalle de una membresía (Figma C2 984:611992 · móvil C7 985:618292). El servidor valida que sea de la organización. */
export default function MembresiaDetallePage({ params }: PageProps) {
  const { id } = use(params);
  const n = /^\d{1,9}$/.test(id) ? Number(id) : 0;
  if (n <= 0) notFound();
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <DetalleMembresia key={n} id={n} />
    </div>
  );
}
