'use client';

/**
 * /app/sitio-web/dominios/[dominioId] — detalle de un dominio (Figma B/07-21):
 * registros DNS, certificado, redirecciones, renovación, transferencia y
 * quitar. El id se valida en el servidor contra la organización de la sesión.
 */
import { use } from 'react';
import { DetalleDominio } from '@/components/sitio-web/dominios/DetalleDominio';

export default function DetalleDominioPage({ params }: { params: Promise<{ dominioId: string }> }) {
  const { dominioId } = use(params);
  return <DetalleDominio dominioId={dominioId} />;
}
