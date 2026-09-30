'use client';

import { use } from 'react';
import { FormularioOportunidadPagina } from '@/components/crm/oportunidad/FormularioOportunidadPagina';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Editar oportunidad en página (CRM ola 3B, plan §4.7; Figma 778:33132). */
export default function EditarOportunidadPage({ params }: PageProps) {
  const { id } = use(params);
  return <FormularioOportunidadPagina modo="edit" id={id} />;
}
