'use client';

import { useOrganization } from '@/lib/hooks/useOrganization';
import { SaludView } from '@/components/crm/health/SaludView';
import { SaludTablaCargando } from '@/components/crm/health/SaludTabla';

/**
 * /app/crm/salud — Salud de clientes del CRM (Figma 1415:19, lista priorizada).
 * Mientras se resuelve la organización, el mismo esqueleto de la tabla.
 */
export default function CrmSaludPage() {
  const { organization } = useOrganization();
  const orgId = organization?.id || 0;

  if (!orgId) {
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
        <SaludTablaCargando />
      </div>
    );
  }

  return <SaludView organizationId={orgId} />;
}
