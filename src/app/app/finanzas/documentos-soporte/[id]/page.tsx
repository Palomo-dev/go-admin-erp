'use client';

import React from 'react';
import { SupportDocumentDetail } from '@/components/finanzas/documentos-soporte/SupportDocumentDetail';

export default function DocumentoSoporteDetallePage({ params }: { params: { id: string } }) {
  return <SupportDocumentDetail documentId={params.id} />;
}
