/**
 * Textos derivados de una lista de precios (columna «Cómo se define», canales, vigencia), comunes
 * al listado, al detalle y a la ficha del cliente. Puros: reciben la función de traducción.
 */
import type { TonoBadge } from '@/components/kit';
import type { EstadoLista, ListaResumen } from '@/lib/listasPrecios/tipos';

type T = (clave: string, valores?: Record<string, string | number>) => string;

export const TONO_ESTADO_LISTA: Record<EstadoLista, TonoBadge> = {
  activa: 'exito',
  programada: 'informacion',
  vencida: 'neutro',
  inactiva: 'neutro',
  sin_clientes: 'advertencia',
};

export const RUTA_LISTAS = '/app/pos/listas-precios';
export const rutaLista = (id: string) => `${RUTA_LISTAS}/${encodeURIComponent(id)}`;
export const rutaEditarLista = (id: string) => `${RUTA_LISTAS}/${encodeURIComponent(id)}/editar`;
export const RUTA_NUEVA_LISTA = `${RUTA_LISTAS}/nueva`;

/** «10 % menos», «5 % más» o null si el ajuste es 0. */
export function ajustePorcentaje(t: T, pct: number | null | undefined): string | null {
  const n = Number(pct) || 0;
  if (n === 0) return null;
  const valor = Math.abs(n).toLocaleString('es-CO', { maximumFractionDigits: 2 });
  return n < 0 ? t('como.menos', { n: valor }) : t('como.mas', { n: valor });
}

/** Columna «Cómo se define»: «10 % menos + fijos», «Precio fijo», «Por categoría», «13 % menos + volumen». */
export function comoSeDefine(
  t: T,
  l: Pick<ListaResumen, 'base_mode' | 'base_percent' | 'productos_fijos' | 'reglas_categoria' | 'reglas_marca' | 'escalones'>,
): string {
  const partes: string[] = [];
  const general = l.base_mode === 'percent' ? ajustePorcentaje(t, l.base_percent) : null;
  if (general) partes.push(general);
  if (l.escalones > 0) partes.push(t('como.volumen'));
  else if (l.productos_fijos > 0) partes.push(partes.length > 0 ? t('como.fijos') : t('como.precioFijo'));
  if (l.reglas_categoria + l.reglas_marca > 0 && partes.length === 0) partes.push(t('como.porCategoria'));
  return partes.length > 0 ? partes.join(' + ') : t('como.sinReglas');
}

/** «POS · Web · Fact.» */
export function canalesLista(t: T, l: { applies_to_pos: boolean; applies_to_web: boolean; applies_to_documents: boolean }): string {
  const c = [
    l.applies_to_pos ? t('canales.pos') : null,
    l.applies_to_web ? t('canales.web') : null,
    l.applies_to_documents ? t('canales.documentos') : null,
  ].filter((x): x is string => !!x);
  return c.length > 0 ? c.join(' · ') : t('canales.ninguno');
}

/** Columna «Productos»: «Todos» con regla general, «120» con precios fijos, «3 categorías». */
export function productosLista(
  t: T,
  l: Pick<ListaResumen, 'base_mode' | 'productos_fijos' | 'reglas_categoria' | 'reglas_marca'>,
): string {
  if (l.base_mode === 'percent') return t('productos.todos');
  if (l.productos_fijos > 0) return String(l.productos_fijos);
  if (l.reglas_categoria > 0) return t('productos.categorias', { n: l.reglas_categoria });
  if (l.reglas_marca > 0) return t('productos.marcas', { n: l.reglas_marca });
  return '—';
}

/** «Sin fecha de fin», «Desde 1 dic», «1 nov – 31 dic». `formatear` es `formatPlain` (columnas date). */
export function vigenciaLista(
  t: T,
  l: { effective_from: string; effective_to: string | null },
  hoy: string,
  formatear: (fecha: string) => string,
): string {
  if (!l.effective_to) return l.effective_from > hoy ? t('vigencia.desde', { fecha: formatear(l.effective_from) }) : t('vigencia.sinFin');
  return t('vigencia.rango', { desde: formatear(l.effective_from), hasta: formatear(l.effective_to) });
}
