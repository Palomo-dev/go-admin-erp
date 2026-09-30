'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { FormularioOportunidadPagina } from '@/components/crm/oportunidad/FormularioOportunidadPagina';

/**
 * Nueva oportunidad en página (CRM ola 3B, plan §4.7; Figma 778:32176). Puntos
 * de entrada por query: `pipeline`, `etapa`, `cliente` (ficha y listado de
 * clientes) y `nombreCliente`.
 */
function NuevaOportunidadContent() {
  const sp = useSearchParams();
  return (
    <FormularioOportunidadPagina
      modo="create"
      inicial={{ pipelineId: sp?.get('pipeline') || null, etapaId: sp?.get('etapa') || null, clienteId: sp?.get('cliente') || null, clienteNombre: sp?.get('nombreCliente') || null }}
    />
  );
}

export default function NuevaOportunidadPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-canvas p-6" />}>
      <NuevaOportunidadContent />
    </Suspense>
  );
}
