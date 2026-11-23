'use client';

/**
 * /app/logistica/reglas — «Reglas de despacho» (Figma 2794:1488). Catálogo del módulo; los ajustes
 * viven en Configuración › Logística.
 */
import { ReglasDespacho } from '@/components/logistica/zonas/ReglasDespacho';
import { useOrganization } from '@/lib/hooks/useOrganization';

export default function ReglasDespachoPage() {
  const { organization } = useOrganization();
  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:gap-6 lg:p-6">
      {organization?.id ? <ReglasDespacho organizationId={organization.id} /> : null}
    </div>
  );
}
