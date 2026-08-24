'use client';

import React from 'react';
import { AnomalyPanel } from '@/components/finanzas/bancos/AnomalyPanel';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

// Pagina de deteccion de anomalias en transacciones bancarias.
// Obtiene el organizationId del hook cliente y lo pasa al panel.
export default function AnomaliasPage() {
  const organizationId = getOrganizationId();

  return <AnomalyPanel organizationId={organizationId} />;
}
