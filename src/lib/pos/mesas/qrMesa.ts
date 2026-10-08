/**
 * URL del QR de una mesa: la carta del sitio con la mesa preseleccionada.
 *
 * Contrato con goadmin-websites (`lib/restaurant/useMesaQR.ts`, paquete B):
 * `https://<sitio de la sede de la mesa>/menu?mesa=<restaurant_tables.id>`. El sitio
 * resuelve el id contra `restaurant_tables` filtrando por la organización del
 * host (`/api/restaurant-tables/resolve`) y muestra «Mesa 4 · Terraza · Sede».
 * El host sale del dominio publicado de la organización (subdominio o dominio
 * propio verificado), nunca se cablea.
 *
 * Sede de la mesa: si la mesa es de una sede que el sitio sirve aparte (publicada en la web,
 * con `/<slug>` o dominio propio, `baseWebDeSede`) y no es la sede principal, el QR lleva a la
 * carta de ESA sede (`https://marca.goadmin.io/<slug>/menu?mesa=…`): ahí está su página
 * «Carta QR», su carta, su precio y su caja. Es el mismo destino al que el sitio ya redirigía
 * esa mesa desde el principal (`cartaDeSede` del resolve). Sin sede, sede principal o sede sin
 * sitio aparte: `https://<host>/menu?mesa=…`, exactamente como antes.
 */
import { baseWebDeSede, type SedeWeb } from '@/lib/organizacion/sucursales';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST = /^[a-z0-9.-]+(:\d+)?$/i;

/** Sede de la mesa (`branches`), con lo que decide dónde vive su carta. */
export type SedeQr = SedeWeb;

/** `https://<host>` del sitio principal, o `null` si el host no es usable. */
function basePrincipal(host: string | null | undefined): string | null {
  const h = (host ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return h && HOST.test(h) ? `https://${h}` : null;
}

/**
 * Base de la carta de la sede de una mesa: la de la sede si el sitio la sirve aparte y no es la
 * principal; si no, la del sitio principal (como siempre). `null` sin host usable.
 */
export function baseCartaDeSede(host: string | null | undefined, sede?: SedeQr | null): string | null {
  const principal = basePrincipal(host);
  if (!principal) return null;
  if (sede && sede.is_main !== true) {
    return baseWebDeSede(host, sede) ?? principal;
  } else {
    // Sin sede o sede principal: el sitio principal, como antes.
    return principal;
  }
}

export function urlQrMesa(host: string | null | undefined, tableId: string, sede?: SedeQr | null): string | null {
  const base = baseCartaDeSede(host, sede);
  if (!base || !UUID.test(tableId)) return null;
  return `${base}/menu?mesa=${tableId.toLowerCase()}`;
}

/** Carta sin mesa (QR general «solo ver la carta») de la sede, con la misma regla. */
export function urlCartaGeneral(host: string | null | undefined, sede?: SedeQr | null): string | null {
  const base = baseCartaDeSede(host, sede);
  return base ? `${base}/menu` : null;
}

/** Escapa texto para la hoja imprimible (nombre de mesa, zona, sede). */
export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
