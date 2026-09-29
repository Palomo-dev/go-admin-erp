'use client';

import React from 'react';
import { NuevaTransferenciaForm } from '@/components/inventario/transferencias/nuevo/NuevaTransferenciaForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Editar un traslado pendiente (el mismo formulario del nuevo traslado). */
export default function EditarTransferenciaPage({ params }: PageProps) {
  const { id } = React.use(params);
  const n = /^\d{1,9}$/.test(id) ? Number(id) : 0;
  return <NuevaTransferenciaForm trasladoId={n} />;
}
