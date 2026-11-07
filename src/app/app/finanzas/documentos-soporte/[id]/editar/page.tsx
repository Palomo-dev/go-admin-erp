'use client';

/** Editar un documento soporte en borrador, rechazado o con error (`FormularioDocumentoSoporte`). */
import { use } from 'react';
import { FormularioDocumentoSoporte } from '@/components/finanzas/documentos-soporte/FormularioDocumentoSoporte';

export default function EditarDocumentoSoportePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <FormularioDocumentoSoporte id={id} />;
}
