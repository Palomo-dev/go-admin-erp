'use client';

/**
 * /app/sitio-web/paginas — «Páginas» (Figma A/04a-04h): páginas del sitio con su estado, si
 * salen en el menú, su salud SEO y las acciones sobre el borrador. «Menú y navegación» vive en
 * /app/sitio-web/paginas/menu. Ya no usa la pestaña vieja de Branding (BrandingPagesTab).
 */
import { PaginasLista } from '@/components/sitio-web/paginas/PaginasLista';

export default function PaginasSitioWebPage() {
  return <PaginasLista />;
}
