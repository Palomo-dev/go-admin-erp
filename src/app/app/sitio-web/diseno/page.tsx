'use client';

/**
 * /app/sitio-web/diseno — «Diseño» (Figma 01b): estilo del sitio, colores,
 * tipografía, cabecera. Viene de Branding › Tema (BrandingThemeTab).
 */
import { BrandingThemeTab } from '@/components/organization/branding';
import { MarcoSitioWeb, EstadoAjustes } from '@/components/sitio-web/MarcoSitioWeb';
import { useAjustesSitio } from '@/components/sitio-web/useAjustesSitio';

export default function DisenoSitioWebPage() {
  const a = useAjustesSitio();

  return (
    <MarcoSitioWeb href="/app/sitio-web/diseno">
      <EstadoAjustes cargando={a.cargando} hayAjustes={!!a.settings} onReintentar={() => void a.recargar()}>
        {a.settings && (
          <BrandingThemeTab
            settings={a.settings}
            onSave={a.guardar}
            isSaving={a.guardando}
            organizationTypeId={a.organizationTypeId}
            organizationId={a.organizationId ?? null}
            subdomain={a.subdominio}
          />
        )}
      </EstadoAjustes>
    </MarcoSitioWeb>
  );
}
