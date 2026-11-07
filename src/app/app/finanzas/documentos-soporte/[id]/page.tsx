'use client';

/**
 * Detalle de un documento soporte. La URL no cambia (la enlazan la factura de
 * compra y su listado); el contenido lo arma el servidor
 * (`GET /api/documentos-soporte/[id]`) y lo pinta `DetalleDocumentoSoporte`.
 */
import { use } from 'react';
import { DetalleDocumentoSoporte } from '@/components/finanzas/documentos-soporte/DetalleDocumentoSoporte';

export default function DocumentoSoporteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <DetalleDocumentoSoporte id={id} />;
}
