/**
 * Dispositivos de la vista previa del sitio: UNA sola tabla para Diseño, Plantillas, el
 * asistente y el editor (Figma A/06a y A/07g; decisión del dueño de usar iconos en la barra
 * del editor). Puro, sin React.
 *
 * - `DISPOSITIVOS_VISTA`: los tres anchos de Diseño y Plantillas (1440 · 1024 · 390).
 * - `DISPOSITIVOS_EDITOR`: los cuatro de la barra del editor, con la tableta (768) que
 *   ya tenía el editor anterior.
 *
 * Los iconos están en `iconosSitio.ts` (`ICONO_DISPOSITIVO_VISTA`), con la misma clave.
 */
export type DispositivoVista = 'escritorio' | 'portatil' | 'tableta' | 'celular';

export const DISPOSITIVOS_VISTA: readonly DispositivoVista[] = ['escritorio', 'portatil', 'celular'];

export const DISPOSITIVOS_EDITOR: readonly DispositivoVista[] = ['escritorio', 'portatil', 'tableta', 'celular'];

export const VIEWPORT_DISPOSITIVO: Record<DispositivoVista, { ancho: number; alto: number }> = {
  escritorio: { ancho: 1440, alto: 900 },
  portatil: { ancho: 1024, alto: 720 },
  tableta: { ancho: 768, alto: 1024 },
  celular: { ancho: 390, alto: 844 },
};

/** Dispositivos que se pintan con marco de aparato (sin barra del navegador). */
export function esMarcoDeAparato(d: DispositivoVista): boolean {
  return d === 'tableta' || d === 'celular';
}

/**
 * Nombre del dispositivo en los inspectores de encabezado y pie, que heredaron los valores
 * en inglés del editor anterior (`DevicePreview`). Se define aquí para que no exista otra
 * lista de dispositivos.
 */
export type DispositivoInspector = 'desktop' | 'laptop' | 'tablet' | 'mobile';

export const DISPOSITIVO_INSPECTOR: Record<DispositivoVista, DispositivoInspector> = {
  escritorio: 'desktop',
  portatil: 'laptop',
  tableta: 'tablet',
  celular: 'mobile',
};

/**
 * Escala para meter un viewport de `anchoViewport` en `anchoDisponible` px:
 * nunca amplía (máximo 1) y nunca devuelve 0 ni negativos.
 */
export function escalaVista(anchoDisponible: number, anchoViewport: number): number {
  if (!Number.isFinite(anchoDisponible) || anchoDisponible <= 0 || anchoViewport <= 0) return 1;
  return Math.min(1, anchoDisponible / anchoViewport);
}

/** Origen de una URL para `postMessage` (nunca `*`); `null` si la URL no es válida o no es http(s). */
/**
 * Dirección que aplica en vivo lo que se edita (`goadmin:settings`): el sitio solo escucha con
 * `?preview=1`. La vista previa del borrador (`/vista-previa/<token>`) es una barra con el sitio
 * en un iframe interior (`?marco=1`), donde ningún mensaje llega: se pide directamente el marco.
 */
export function urlVistaEnVivo(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/vista-previa/')) u.searchParams.set('marco', '1');
    u.searchParams.set('preview', '1');
    return u.toString();
  } catch {
    return url;
  }
}

export function origenDe(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch {
    return null;
  }
}
