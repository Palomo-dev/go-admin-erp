'use client';

/**
 * /app/sitio-web/seo — «SEO y redes» (Figma B/08-01…08-05). Página delgada:
 * todo vive en `components/sitio-web/seoanalitica`. Deja de usar la pestaña
 * vieja `BrandingSEOTab` (no se borra; lo decide el integrador). Las redes
 * sociales se editan aquí (B/08-04 nota 3).
 */
import { SeoYRedes } from '@/components/sitio-web/seoanalitica/SeoYRedes';

export default function SeoSitioWebPage() {
  return <SeoYRedes />;
}
