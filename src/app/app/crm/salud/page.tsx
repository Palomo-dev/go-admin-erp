'use client';

import { useOrganization } from '@/lib/hooks/useOrganization';
import { SaludView } from '@/components/crm/health/SaludView';

/**
 * Pagina de Salud de Clientes del CRM (FASE 4 - Post-venta).
 * Panel de salud con scores, bandas e indicadores.
 */
export default function CrmSaludPage() {
  const { organization } = useOrganization();
  const orgId = organization?.id || 0;

  if (!orgId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-gray-500">Cargando organizacion...</p>
      </div>
    );
  }

  return <SaludView organizationId={orgId} />;
}
