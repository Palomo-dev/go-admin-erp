import React from 'react';
import { SupportDocumentDetail } from '@/components/finanzas/documentos-soporte/SupportDocumentDetail';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DocumentoSoporteDetallePage({ params }: PageProps) {
  const { id } = await params;

  return <SupportDocumentDetail documentId={id} />;
}
