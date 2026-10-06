/**
 * Salud SEO de una página (Figma A/04a, columna «SEO»; B/08 «Calidad SEO por
 * página»): una sola regla para Páginas y para SEO y redes. Pura.
 *
 * - Página oculta del sitio → «Sin revisar» (no compite en buscadores).
 * - Falta título: ni título SEO ni título de la página.
 * - Falta descripción: la página no tiene descripción propia (en Inicio vale
 *   la del sitio, porque es la que usa la portada).
 * - Falta imagen al compartir: ni la página ni el sitio tienen imagen.
 * - Si no falta nada → «Completo».
 */
import type { CampoHeredable, DocumentoSitio, PaginaSitio } from '@/lib/website/contrato/documentoSitio';
import { esInicio } from './tipoPagina';

export type SaludSeo = 'completo' | 'falta_titulo' | 'falta_descripcion' | 'falta_imagen' | 'sin_revisar';

function texto(campo: CampoHeredable<string> | undefined): string {
  return campo && campo.mode === 'value' ? campo.value.trim() : '';
}

export function saludSeo(pagina: PaginaSitio, documento: Pick<DocumentoSitio, 'seo'>): SaludSeo {
  if (!pagina.publicada) return 'sin_revisar';
  const titulo = texto(pagina.seo?.titulo) || pagina.titulo.trim();
  if (!titulo) return 'falta_titulo';
  const descripcion = texto(pagina.seo?.descripcion) || (esInicio(pagina) ? texto(documento.seo?.descripcion) : '');
  if (!descripcion) return 'falta_descripcion';
  const imagen = texto(pagina.seo?.imagenOgUrl) || texto(documento.seo?.imagenOgUrl);
  if (!imagen) return 'falta_imagen';
  return 'completo';
}

/** Clave de `estadoTono.ts` para la insignia («completo» = éxito, «falta …» = advertencia). */
export const TONO_SALUD_SEO: Record<SaludSeo, 'exito' | 'advertencia' | 'neutro'> = {
  completo: 'exito',
  falta_titulo: 'advertencia',
  falta_descripcion: 'advertencia',
  falta_imagen: 'advertencia',
  sin_revisar: 'neutro',
};
