'use client';

/**
 * /app/sitio-web/seo — «SEO y redes» (Figma 01b): título, descripción, imagen
 * para compartir, verificación de buscadores. Viene de Branding › SEO.
 * Las redes sociales siguen en «Configuración» (BrandingContentTab) hasta que
 * ese formulario se parta en información y redes.
 */
import { BrandingSEOTab } from '@/components/organization/branding';
import { MarcoSitioWeb, EstadoAjustes } from '@/components/sitio-web/MarcoSitioWeb';
import { useAjustesSitio } from '@/components/sitio-web/useAjustesSitio';

export default function SeoSitioWebPage() {
  const a = useAjustesSitio();

  return (
    <MarcoSitioWeb href="/app/sitio-web/seo">
      <EstadoAjustes cargando={a.cargando} hayAjustes={!!a.settings} onReintentar={() => void a.recargar()}>
        {a.settings && (
          <BrandingSEOTab settings={a.settings} onSave={a.guardar} onUploadImage={a.subirImagen} isSaving={a.guardando} />
        )}
      </EstadoAjustes>
    </MarcoSitioWeb>
  );
}
