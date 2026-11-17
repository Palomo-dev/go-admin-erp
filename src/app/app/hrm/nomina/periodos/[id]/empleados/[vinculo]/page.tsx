import { Suspense } from 'react';
import { DetalleEmpleadoPeriodo } from '@/components/hrm/nomina/DetalleEmpleadoPeriodo';

/** Nómina › período › detalle de una persona (Figma 20.18). */
export default async function Page({ params }: { params: Promise<{ id: string; vinculo: string }> }) {
  const { id, vinculo } = await params;
  return (
    <Suspense>
      <DetalleEmpleadoPeriodo id={id} vinculo={vinculo} />
    </Suspense>
  );
}
