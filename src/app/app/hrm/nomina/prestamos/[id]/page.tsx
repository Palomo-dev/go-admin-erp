import { Suspense } from 'react';
import { DetallePrestamo } from '@/components/hrm/nomina/DetallePrestamo';

/** Nómina › Préstamos y embargos › préstamo con sus cuotas (Figma 20.21.2). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <DetallePrestamo id={id} />
    </Suspense>
  );
}
