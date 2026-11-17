import { Suspense } from 'react';
import { ColillaPage } from '@/components/hrm/nomina/ColillaPage';

/** Nómina › período › colilla de una persona (Figma 20.23.1 y 23.2). */
export default async function Page({ params }: { params: Promise<{ id: string; vinculo: string }> }) {
  const { id, vinculo } = await params;
  return (
    <Suspense>
      <ColillaPage id={id} vinculo={vinculo} />
    </Suspense>
  );
}
