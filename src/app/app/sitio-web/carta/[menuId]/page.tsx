'use client';

/** /app/sitio-web/carta/[menuId] — detalle de una carta (Figma B/13-02). */
import { useParams } from 'next/navigation';
import { DetalleCarta } from '@/components/sitio-web/configuracion/carta/DetalleCarta';

export default function DetalleCartaPage() {
  const params = useParams<{ menuId: string }>();
  return <DetalleCarta menuId={decodeURIComponent(params?.menuId ?? '')} />;
}
