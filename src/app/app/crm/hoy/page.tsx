'use client';

import { useOrganization } from '@/lib/hooks/useOrganization';
import { HoyView } from '@/components/crm/hoy/HoyView';

/**
 * Página "Hoy" del CRM.
 * Lista accionable única: contactos vencidos, estancadas, leads sin primer contacto.
 */
export default function CrmHoyPage() {
  const { organization } = useOrganization();
  const orgId = organization?.id || 0;

  if (!orgId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-gray-500">Cargando organización...</p>
      </div>
    );
  }

  return <HoyView organizationId={orgId} />;
}
