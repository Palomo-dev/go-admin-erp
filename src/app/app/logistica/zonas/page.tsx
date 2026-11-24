'use client';

/**
 * /app/logistica/zonas — «Zonas y tarifas de domicilio» (Figma 2792:413), con el simulador
 * «¿Cuánto cuesta enviar a…?». Catálogo del módulo; los ajustes viven en Configuración › Logística.
 */
import { ZonasTarifas } from '@/components/logistica/zonas/ZonasTarifas';
import { useOrganization } from '@/lib/hooks/useOrganization';

export default function ZonasLogisticaPage() {
  const { organization } = useOrganization();
  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:gap-6 lg:p-6">
      {organization?.id ? <ZonasTarifas organizationId={organization.id} /> : null}
    </div>
  );
}
