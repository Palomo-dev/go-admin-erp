'use client';

/**
 * /app/sitio-web/plantillas — «Plantillas» (Figma 01b): restablecer el sitio a
 * una plantilla. Viene de Branding › Publicación (bloque «Restablecer»).
 */
import { useTranslations } from 'next-intl';
import { BrandingPublishTab } from '@/components/organization/branding';
import { MarcoSitioWeb, EstadoAjustes } from '@/components/sitio-web/MarcoSitioWeb';
import { useAjustesSitio } from '@/components/sitio-web/useAjustesSitio';

export default function PlantillasSitioWebPage() {
  const tb = useTranslations('org.branding');
  const a = useAjustesSitio();

  return (
    <MarcoSitioWeb href="/app/sitio-web/plantillas">
      <EstadoAjustes cargando={a.cargando} hayAjustes={!!a.settings} onReintentar={() => void a.recargar()}>
        {a.settings && (
          <BrandingPublishTab
            vista="plantillas"
            settings={a.settings}
            organizationName={a.organizationName || tb('myOrganization')}
            subdomain={a.subdominio || undefined}
            onPublish={a.publicar}
            onUnpublish={a.despublicar}
            onResetToTemplate={a.restablecerPlantilla}
            isPublishing={a.guardando}
          />
        )}
      </EstadoAjustes>
    </MarcoSitioWeb>
  );
}
