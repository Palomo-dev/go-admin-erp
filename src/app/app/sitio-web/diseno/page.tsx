'use client';

/**
 * /app/sitio-web/diseno — «Diseño» (Figma A/06a, A/06f, A/06g): estilo global
 * del sitio con vista previa en vivo, acceso al editor para el encabezado y el
 * pie, y logo y favicon. Todo sobre el borrador V2 (`PaginaDiseno`). Ya no usa
 * la pestaña vieja de Branding (BrandingThemeTab).
 */
import { PaginaDiseno } from '@/components/sitio-web/diseno/PaginaDiseno';

export default function DisenoSitioWebPage() {
  return <PaginaDiseno />;
}
