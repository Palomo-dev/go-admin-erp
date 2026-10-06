'use client';

/**
 * /app/sitio-web/configuracion — «Configuración» (Figma 01b): información,
 * horarios, redes y galería (Branding › Contenido) y código propio, píxeles y
 * analítica (Branding › Avanzado). Cada bloque guarda por su cuenta.
 */
import { BrandingAdvancedTab, BrandingContentTab } from '@/components/organization/branding';
import { MarcoSitioWeb, EstadoAjustes } from '@/components/sitio-web/MarcoSitioWeb';
import { useAjustesSitio } from '@/components/sitio-web/useAjustesSitio';

export default function ConfiguracionSitioWebPage() {
  const a = useAjustesSitio();

  return (
    <MarcoSitioWeb href="/app/sitio-web/configuracion">
      <EstadoAjustes cargando={a.cargando} hayAjustes={!!a.settings} onReintentar={() => void a.recargar()}>
        {a.settings && (
          <div className="space-y-4 sm:space-y-6">
            <BrandingContentTab settings={a.settings} onSave={a.guardar} onUploadImage={a.subirImagen} isSaving={a.guardando} />
            <BrandingAdvancedTab settings={a.settings} onSave={a.guardar} isSaving={a.guardando} />
          </div>
        )}
      </EstadoAjustes>
    </MarcoSitioWeb>
  );
}
