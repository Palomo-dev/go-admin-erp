'use client';

/**
 * Catálogo común › ficha de la persona (conductor o domiciliario). La pantalla vive en
 * `src/components/transporte/conductores/PersonaDetalle.tsx` y es la misma de
 * `/app/logistica/conductores/[id]` (que reexporta esta página).
 */
import { useParams } from 'next/navigation';
import { PersonaDetalle } from '@/components/transporte/conductores/PersonaDetalle';

export default function Page() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  return <PersonaDetalle key={id} id={id} />;
}
