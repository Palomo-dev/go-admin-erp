/** Rutas de la Carta del sitio (Figma B/13): lista, detalle, QR y vista previa. */
import { RAIZ_SITIO_WEB } from '../../rutasSitioWeb';

export const RUTA_CARTA = `${RAIZ_SITIO_WEB}/carta`;
export const RUTA_CARTA_QR = `${RUTA_CARTA}/qr`;

export function rutaDetalleCarta(id: string): string {
  return `${RUTA_CARTA}/${encodeURIComponent(id)}`;
}

export function rutaVistaPreviaCarta(opciones?: { menu?: string | null; sede?: number | null }): string {
  const q = new URLSearchParams();
  if (opciones?.menu) q.set('menu', opciones.menu);
  if (opciones?.sede) q.set('sede', String(opciones.sede));
  const s = q.toString();
  return `${RUTA_CARTA}/vista-previa${s ? `?${s}` : ''}`;
}
