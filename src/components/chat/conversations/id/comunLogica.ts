/**
 * Reglas puras compartidas por Actividad, Archivos y el buscador del hilo
 * (Figma 91-chat-11 y 91-chat-12). Sin React ni Supabase.
 */
import { toPlainDate } from '@/lib/utils/dateDisplay';
import { relacionDia } from '@/components/chat/conversations/hiloLogica';

/** Minúsculas y sin tildes: «Envío» encuentra «envio» y al revés. */
export function normalizarTexto(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** ¿Alguno de los textos contiene la búsqueda? Búsqueda vacía = todo coincide. */
export function coincideBusqueda(textos: readonly (string | null | undefined)[], busqueda: string): boolean {
  const q = normalizarTexto(busqueda);
  if (!q) return true;
  return textos.some((t) => normalizarTexto(t).includes(q));
}

/**
 * Cuándo, en corto (Figma: «hoy 10:41», «28 oct»): el día se calcula en la
 * zona de la organización, nunca en la del navegador ni en UTC.
 */
export function momentoCorto(
  instante: string | null | undefined,
  tz: string | undefined,
  hoy: string,
): { tipo: 'hoy' | 'ayer' | 'fecha'; instante: string } | null {
  if (!instante) return null;
  const fecha = new Date(instante);
  if (isNaN(fecha.getTime())) return null;
  const rel = relacionDia(toPlainDate(fecha, tz), hoy);
  return { tipo: rel === 'otro' ? 'fecha' : rel, instante };
}

/** Escapa los comodines de `ILIKE` (`%`, `_` y `\`) para buscar el texto tal cual. */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Parte un texto en tramos marcados y sin marcar según la búsqueda (sin
 * distinguir mayúsculas). Se pinta con React: el contenido del mensaje lo
 * escribe el cliente y nunca se inyecta como HTML.
 */
export function tramosResaltados(texto: string, busqueda: string): { texto: string; marcado: boolean }[] {
  const q = busqueda.trim();
  if (!texto) return [];
  if (!q) return [{ texto, marcado: false }];
  const bajo = texto.toLowerCase();
  const qBajo = q.toLowerCase();
  const tramos: { texto: string; marcado: boolean }[] = [];
  let desde = 0;
  let i = bajo.indexOf(qBajo, desde);
  while (i !== -1) {
    if (i > desde) tramos.push({ texto: texto.slice(desde, i), marcado: false });
    tramos.push({ texto: texto.slice(i, i + q.length), marcado: true });
    desde = i + q.length;
    i = bajo.indexOf(qBajo, desde);
  }
  if (desde < texto.length) tramos.push({ texto: texto.slice(desde), marcado: false });
  return tramos;
}

/** Índice siguiente o anterior, dando la vuelta. */
export function indiceCiclico(actual: number, total: number, paso: 1 | -1): number {
  if (total <= 0) return 0;
  return (((actual + paso) % total) + total) % total;
}
