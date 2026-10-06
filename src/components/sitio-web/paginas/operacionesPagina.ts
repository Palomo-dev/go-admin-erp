/**
 * Operaciones puras sobre las páginas del documento V2 (Figma A/04a-04e): crear desde
 * plantilla, duplicar, cambiar dirección, ocultar o volver a publicar, eliminar y restaurar las
 * páginas base. Las aplican los route handlers sobre el borrador; nunca mutan la entrada.
 */
import { LIMITES_DOCUMENTO, type DocumentoSitio, type PaginaSitio } from '@/lib/website/contrato/documentoSitio';
import {
  alternarPaginaEnMenu,
  crearMenu,
  menusPie,
  nuevoItem,
  quitarPaginaDeMenus,
  reemplazarItemsMenu,
  type GenerarId,
} from './operacionesMenu';
import {
  construirPagina,
  construirPaginaBase,
  paginasBasePorGiro,
  slugDesdeTexto,
  slugLibre,
  type Giro,
  type PlantillaPagina,
} from './plantillasPagina';
import { esInicio, esPaginaLegal } from './tipoPagina';

export type ErrorPagina =
  | 'titulo_vacio'
  | 'slug_vacio'
  | 'slug_repetido'
  | 'slug_invalido'
  | 'limite_paginas'
  | 'pagina_no_existe'
  | 'no_se_elimina_inicio'
  | 'limite_items'
  | 'limite_menus';

export type ResultadoPagina = { ok: true; documento: DocumentoSitio; paginaId?: string; creadas?: number } | { ok: false; error: ErrorPagina };

const SLUG_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

/** Normaliza y valida la dirección que escribe la persona contra el documento. */
export function validarSlug(
  documento: DocumentoSitio,
  texto: string,
  excepto?: string,
): { ok: true; slug: string } | { ok: false; error: 'slug_vacio' | 'slug_repetido' | 'slug_invalido' } {
  const slug = slugDesdeTexto(texto.replace(/^\/+/, ''));
  if (!slug) return { ok: false, error: 'slug_vacio' };
  if (!SLUG_VALIDO.test(slug) || slug.length > LIMITES_DOCUMENTO.longitudSlug || slug.startsWith('plantillas/')) {
    return { ok: false, error: 'slug_invalido' };
  }
  if (documento.paginas.some((p) => p.slug === slug && p.id !== excepto)) return { ok: false, error: 'slug_repetido' };
  return { ok: true, slug };
}

function conMenu(resultado: ReturnType<typeof alternarPaginaEnMenu>, paginaId: string): ResultadoPagina {
  if (resultado.ok) return { ok: true, documento: resultado.documento, paginaId };
  return { ok: false, error: resultado.error === 'limite_menus' ? 'limite_menus' : resultado.error === 'pagina_no_existe' ? 'pagina_no_existe' : 'limite_items' };
}

export function crearPaginaDesdePlantilla(
  documento: DocumentoSitio,
  plantilla: PlantillaPagina,
  datos: { titulo: string; slug: string; enMenu: boolean },
  generarId: GenerarId,
): ResultadoPagina {
  if (!datos.titulo.trim()) return { ok: false, error: 'titulo_vacio' };
  if (documento.paginas.length >= LIMITES_DOCUMENTO.paginasMaximas) return { ok: false, error: 'limite_paginas' };
  const slug = validarSlug(documento, datos.slug);
  if (!slug.ok) return slug;
  const pagina = construirPagina(plantilla, { titulo: datos.titulo, slug: slug.slug }, generarId);
  const doc: DocumentoSitio = { ...documento, paginas: [...documento.paginas, pagina] };
  if (!datos.enMenu) return { ok: true, documento: doc, paginaId: pagina.id };
  return conMenu(alternarPaginaEnMenu(doc, pagina.id, true, generarId), pagina.id);
}

function buscar(documento: DocumentoSitio, id: string): PaginaSitio | undefined {
  return documento.paginas.find((p) => p.id === id);
}

function reemplazar(documento: DocumentoSitio, pagina: PaginaSitio): DocumentoSitio {
  return { ...documento, paginas: documento.paginas.map((p) => (p.id === pagina.id ? pagina : p)) };
}

/** Copia la página (secciones con ids nuevos) como «<título> (copia)», fuera del menú. */
export function duplicarPagina(documento: DocumentoSitio, paginaId: string, sufijo: string, generarId: GenerarId): ResultadoPagina {
  const original = buscar(documento, paginaId);
  if (!original) return { ok: false, error: 'pagina_no_existe' };
  if (documento.paginas.length >= LIMITES_DOCUMENTO.paginasMaximas) return { ok: false, error: 'limite_paginas' };
  const usados = new Set(documento.paginas.map((p) => p.slug));
  const copia: PaginaSitio = {
    ...JSON.parse(JSON.stringify(original)),
    id: generarId(),
    slug: slugLibre(`${original.slug || 'inicio'}-copia`.slice(0, 110), usados),
    titulo: `${original.titulo} ${sufijo}`.slice(0, LIMITES_DOCUMENTO.longitudTextoCorto),
    secciones: original.secciones.map((s) => ({ ...JSON.parse(JSON.stringify(s)), id: generarId() })),
  };
  return { ok: true, documento: { ...documento, paginas: [...documento.paginas, copia] }, paginaId: copia.id };
}

export function cambiarDireccion(documento: DocumentoSitio, paginaId: string, texto: string): ResultadoPagina {
  const pagina = buscar(documento, paginaId);
  if (!pagina) return { ok: false, error: 'pagina_no_existe' };
  const slug = validarSlug(documento, texto, paginaId);
  if (!slug.ok) return slug;
  return { ok: true, documento: reemplazar(documento, { ...pagina, slug: slug.slug }), paginaId };
}

export function renombrarPagina(documento: DocumentoSitio, paginaId: string, titulo: string): ResultadoPagina {
  const pagina = buscar(documento, paginaId);
  if (!pagina) return { ok: false, error: 'pagina_no_existe' };
  const limpio = titulo.trim().slice(0, LIMITES_DOCUMENTO.longitudTextoCorto);
  if (!limpio) return { ok: false, error: 'titulo_vacio' };
  return { ok: true, documento: reemplazar(documento, { ...pagina, titulo: limpio }), paginaId };
}

/** «Ocultar del sitio» / «Volver a publicar en el sitio» (campo `publicada`). */
export function fijarPublicada(documento: DocumentoSitio, paginaId: string, publicada: boolean): ResultadoPagina {
  const pagina = buscar(documento, paginaId);
  if (!pagina) return { ok: false, error: 'pagina_no_existe' };
  return { ok: true, documento: reemplazar(documento, { ...pagina, publicada }), paginaId };
}

export function fijarEnMenu(documento: DocumentoSitio, paginaId: string, enMenu: boolean, generarId: GenerarId): ResultadoPagina {
  return conMenu(alternarPaginaEnMenu(documento, paginaId, enMenu, generarId), paginaId);
}

/** Elimina la página y sus enlaces en todos los menús. Inicio no se elimina. */
export function eliminarPagina(documento: DocumentoSitio, paginaId: string): ResultadoPagina {
  const pagina = buscar(documento, paginaId);
  if (!pagina) return { ok: false, error: 'pagina_no_existe' };
  if (esInicio(pagina)) return { ok: false, error: 'no_se_elimina_inicio' };
  const sinEnlaces = quitarPaginaDeMenus(documento, paginaId);
  return { ok: true, documento: { ...sinEnlaces, paginas: sinEnlaces.paginas.filter((p) => p.id !== paginaId) } };
}

/** Añade las páginas base del giro que falten (por dirección); las que ya existen no se tocan. */
export function restaurarPaginasBase(documento: DocumentoSitio, giro: Giro, generarId: GenerarId): ResultadoPagina {
  const usados = new Set(documento.paginas.map((p) => p.slug));
  const faltan = paginasBasePorGiro(giro).filter((b) => !usados.has(b.slug));
  if (documento.paginas.length + faltan.length > LIMITES_DOCUMENTO.paginasMaximas) return { ok: false, error: 'limite_paginas' };
  let doc: DocumentoSitio = documento;
  const legales: PaginaSitio[] = [];
  for (const base of faltan) {
    const pagina = construirPaginaBase(base, generarId);
    doc = { ...doc, paginas: [...doc.paginas, pagina] };
    if (base.enMenu) {
      const r = alternarPaginaEnMenu(doc, pagina.id, true, generarId);
      if (!r.ok) return conMenu(r, pagina.id);
      doc = r.documento;
    } else if (esPaginaLegal(pagina)) {
      legales.push(pagina);
    }
  }
  // Las legales viven en el pie (A/04a): van al grupo «Legales» del pie, que se crea si falta.
  if (legales.length > 0) {
    const items = legales.map((p) => nuevoItem({ tipo: 'page', paginaId: p.id }, p.titulo, generarId));
    const grupo = menusPie(doc).find((m) => m.nombre.trim().toLowerCase() === 'legales');
    if (grupo) {
      doc = reemplazarItemsMenu(doc, grupo.id, [...grupo.items, ...items]);
    } else {
      const r = crearMenu(doc, { nombre: 'Legales', ubicacion: { tipo: 'pie', columna: doc.shell.footer.menuIds.length + 1 }, items }, generarId);
      if (r.ok) doc = r.documento;
    }
  }
  return { ok: true, documento: doc, creadas: faltan.length };
}
