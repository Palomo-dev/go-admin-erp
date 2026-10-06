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

// La regla del host público vive en `src/lib/website/hostSitio.ts` (un solo punto, lo usan el
// servidor y el cron de reservas); aquí se reexporta para las pantallas del módulo.
export { DOMINIO_SITIOS, hostSitio, type DominioDelSitio } from '@/lib/website/hostSitio';

/**
 * Dominios con un diálogo abierto (Figma B/07): Sedes en la web, el asistente
 * y las alertas del Resumen llegan con `?accion=conectar|comprar&sede=<id>`.
 */
export function rutaDominios(opciones?: { accion?: 'conectar' | 'comprar'; sede?: number | null }): string {
  const q = new URLSearchParams();
  if (opciones?.accion) q.set('accion', opciones.accion);
  if (opciones?.accion && opciones.sede) q.set('sede', String(opciones.sede));
  const s = q.toString();
  return s ? `${RUTA_DOMINIOS_SITIO_WEB}?${s}` : RUTA_DOMINIOS_SITIO_WEB;
}

/** Detalle de un dominio (B/07-21). */
export function rutaDetalleDominio(id: string): string {
  return `${RUTA_DOMINIOS_SITIO_WEB}/${encodeURIComponent(id)}`;
}
