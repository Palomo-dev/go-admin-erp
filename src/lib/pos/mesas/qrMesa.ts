/**
 * URL del QR de una mesa: la carta del sitio con la mesa preseleccionada.
 *
 * Contrato con goadmin-websites (`lib/restaurant/useMesaQR.ts`, paquete B):
 * `https://<host del sitio>/menu?mesa=<restaurant_tables.id>`. El sitio
 * resuelve el id contra `restaurant_tables` filtrando por la organización del
 * host (`/api/restaurant-tables/resolve`) y muestra «Mesa 4 · Terraza · Sede».
 * El host sale del dominio publicado de la organización (subdominio o dominio
 * propio verificado), nunca se cablea.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST = /^[a-z0-9.-]+(:\d+)?$/i;

export function urlQrMesa(host: string | null | undefined, tableId: string): string | null {
  const h = (host ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!h || !HOST.test(h) || !UUID.test(tableId)) return null;
  return `https://${h}/menu?mesa=${tableId.toLowerCase()}`;
}

/** Escapa texto para la hoja imprimible (nombre de mesa, zona, sede). */
export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
