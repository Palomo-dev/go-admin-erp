/**
 * Rutas del módulo «Sitio web» que se enlazan desde FUERA del menú (botones
 * «Abrir editor», «Configurar dominio», accesos desde otros módulos). Las
 * páginas del menú salen del catálogo (`src/lib/navigation/catalog.ts`); aquí
 * solo va lo que el catálogo no modela, como el editor con su `pageId`.
 */
export const RAIZ_SITIO_WEB = '/app/sitio-web';
export const RUTA_DOMINIOS_SITIO_WEB = `${RAIZ_SITIO_WEB}/dominios`;
export const RUTA_ANALITICA_SITIO_WEB = `${RAIZ_SITIO_WEB}/analitica`;

/**
 * Editor visual de una página del sitio. Vive bajo el módulo (puerta de
 * módulos del middleware) y se sirve a pantalla completa fuera del AppLayout
 * con un rewrite de next.config.js hacia /organizacion/branding/editor/:pageId.
 */
export function rutaEditorSitio(pageId: string): string {
  return `${RAIZ_SITIO_WEB}/editor/${encodeURIComponent(pageId)}`;
}
