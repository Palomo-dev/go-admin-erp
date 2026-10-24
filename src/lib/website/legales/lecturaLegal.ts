/**
 * Lectura de un documento legal ya guardado. No toca menús: el servidor de voz
 * llega hasta aquí para armar la URL de la política y no puede arrastrar módulos
 * de la interfaz.
 */
import type { PaginaSitio } from '@/lib/website/contrato/documentoSitio';
import { DOCUMENTOS_LEGALES, type ClaveLegal } from '@/lib/website/configuracionSitio';
import { caracteresLegales } from '@/lib/website/legales/plantillasLegales';

export function definicionLegal(clave: ClaveLegal) {
  const def = DOCUMENTOS_LEGALES.find((d) => d.clave === clave);
  if (!def) throw new Error(`clave legal desconocida: ${clave}`);
  return def;
}

export function paginaPorClave(paginas: readonly PaginaSitio[], clave: ClaveLegal): PaginaSitio | undefined {
  const slugs = definicionLegal(clave).slugs as readonly string[];
  return paginas.find((p) => slugs.includes(p.slug));
}

export function caracteresDePagina(pagina: PaginaSitio): number {
  return pagina.secciones.reduce((n, s) => (s.tipo === 'text_block' ? n + caracteresLegales(s.contenido) : n), 0);
}
