/**
 * Coloca un documento legal en el documento del sitio y ajusta el menú «Legales».
 * Puro: lo usan el route, la plantilla y el backfill. No cobra ni llama a la IA.
 */
import type { DocumentoSitio, ItemMenu, PaginaSitio, SeccionSitio } from '@/lib/website/contrato/documentoSitio';
import { DOCUMENTOS_LEGALES, type ClaveLegal } from '@/lib/website/configuracionSitio';
import {
  caracteresLegales,
  fueEditado,
  hashTexto,
  metaLegal,
  textoPlano,
  type ResultadoPlantilla,
} from '@/lib/website/legales/plantillasLegales';
import {
  crearMenu,
  menusPie,
  nuevoItem,
  reemplazarItemsMenu,
  type GenerarId,
} from '@/components/sitio-web/paginas/operacionesMenu';

export const ETIQUETA_TRATAMIENTO = 'Tratamiento de datos';

/** Orden del menú «Legales». Tratamiento va al final, con su propia página. */
const ORDEN_MENU: readonly ClaveLegal[] = ['terminos', 'privacidad', 'envios', 'devoluciones', 'cookies', 'tratamiento'];

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

function bloqueTexto(pagina: PaginaSitio): SeccionSitio | undefined {
  return pagina.secciones.find((s) => s.tipo === 'text_block');
}

export function htmlDePagina(pagina: PaginaSitio): string {
  const bloque = bloqueTexto(pagina);
  if (!bloque) return '';
  return String(bloque.contenido.body ?? bloque.contenido.content ?? '');
}

export type AccionLegal = 'creada' | 'llenada' | 'reemplazada' | 'omitida';

export interface ResultadoColocar {
  documento: DocumentoSitio;
  accion: AccionLegal;
  paginaId: string | null;
  /** true si había texto editado o escrito a mano y no se tocó. */
  editado: boolean;
}

function seccionConTexto(id: string, titulo: string, resultado: ResultadoPlantilla, clave: ClaveLegal, ahoraIso: string): SeccionSitio {
  return {
    id,
    tipo: 'text_block',
    variante: 'left',
    version: 1,
    contenido: {
      title: titulo,
      body: resultado.body,
      legal: metaLegal(clave, resultado, ahoraIso),
    },
    diseno: {},
    visibilidad: { movil: true, escritorio: true },
  };
}

function escribirEnPagina(pagina: PaginaSitio, resultado: ResultadoPlantilla, clave: ClaveLegal, ahoraIso: string, generarId: GenerarId): PaginaSitio {
  const bloque = bloqueTexto(pagina);
  const seccion = seccionConTexto(bloque?.id ?? generarId(), pagina.titulo || definicionLegal(clave).titulo, resultado, clave, ahoraIso);
  const secciones = bloque ? pagina.secciones.map((s) => (s.id === bloque.id ? { ...seccion, diseno: s.diseno, visibilidad: s.visibilidad, version: s.version } : s)) : [...pagina.secciones, seccion];
  return { ...pagina, tipo: pagina.tipo === 'policy' ? 'legal' : pagina.tipo || 'legal', publicada: pagina.publicada, secciones };
}

/**
 * Crea la página o llena una vacía. Si el texto fue editado (o escrito a mano
 * y tiene cuerpo), no lo toca salvo `forzar`.
 */
export function colocarDocumentoLegal(
  documento: DocumentoSitio,
  clave: ClaveLegal,
  resultado: ResultadoPlantilla,
  ahoraIso: string,
  generarId: GenerarId,
  opts?: { forzar?: boolean },
): ResultadoColocar {
  const def = definicionLegal(clave);
  const actual = paginaPorClave(documento.paginas, clave);
  if (!actual) {
    const pagina: PaginaSitio = {
      id: generarId(),
      slug: def.slug,
      tipo: 'legal',
      titulo: def.titulo,
      publicada: true,
      secciones: [seccionConTexto(generarId(), def.titulo, resultado, clave, ahoraIso)],
    };
    return { documento: { ...documento, paginas: [...documento.paginas, pagina] }, accion: 'creada', paginaId: pagina.id, editado: false };
  }
  const bloque = bloqueTexto(actual);
  const html = htmlDePagina(actual);
  if (hashTexto(html) === resultado.hashGenerado && bloque?.contenido.legal) {
    return { documento, accion: 'omitida', paginaId: actual.id, editado: false };
  }
  const editado = fueEditado(bloque?.contenido);
  if (editado && !opts?.forzar) {
    return { documento, accion: 'omitida', paginaId: actual.id, editado: true };
  }
  const pagina = escribirEnPagina(actual, resultado, clave, ahoraIso, generarId);
  return {
    documento: { ...documento, paginas: documento.paginas.map((p) => (p.id === actual.id ? pagina : p)) },
    accion: editado ? 'reemplazada' : 'llenada',
    paginaId: actual.id,
    editado: false,
  };
}

function esMenuLegales(nombre: string): boolean {
  const n = nombre.trim().toLowerCase();
  return n === 'legales' || n === 'legal';
}

function esAliasTratamiento(item: ItemMenu): boolean {
  return item.tipo === 'page' && /^tratamiento de datos$/i.test(item.etiqueta.trim());
}

function sinPaginasRepetidas(items: ItemMenu[]): ItemMenu[] {
  const vistos = new Set<string>();
  return items.filter((item) => {
    if (item.tipo !== 'page') return true;
    if (vistos.has(item.paginaId)) return false;
    vistos.add(item.paginaId);
    return true;
  });
}

/**
 * El menú «Legales» apunta «Tratamiento de datos» a su página (solo si hoy
 * apunta a privacidad) y agrega los documentos del catálogo que falten.
 * No quita enlaces custom ni páginas que no son del catálogo.
 */
export function ajustarMenusLegales(documento: DocumentoSitio, generarId: GenerarId): { documento: DocumentoSitio; cambios: string[] } {
  const cambios: string[] = [];
  const privacidad = paginaPorClave(documento.paginas, 'privacidad');
  const tratamiento = paginaPorClave(documento.paginas, 'tratamiento');
  let doc = documento;
  const menus = menusPie(doc).filter((m) => esMenuLegales(m.nombre));

  if (menus.length === 0) {
    const items = ORDEN_MENU.flatMap((clave) => {
      const pagina = paginaPorClave(doc.paginas, clave);
      if (!pagina) return [];
      const etiqueta = clave === 'tratamiento' ? ETIQUETA_TRATAMIENTO : pagina.titulo;
      return [nuevoItem({ tipo: 'page', paginaId: pagina.id }, etiqueta, generarId)];
    });
    if (items.length === 0) return { documento: doc, cambios };
    const creado = crearMenu(doc, { nombre: 'Legales', ubicacion: { tipo: 'pie', columna: doc.shell.footer.menuIds.length + 1 }, items }, generarId);
    if (!creado.ok) return { documento: doc, cambios };
    return { documento: creado.documento, cambios: ['menu_creado'] };
  }

  for (const menu of menus) {
    let items = menu.items.map((item) => {
      if (!tratamiento || !privacidad || !esAliasTratamiento(item)) return item;
      if (item.tipo !== 'page' || item.paginaId !== privacidad.id) return item;
      cambios.push('tratamiento_propia_pagina');
      return { ...item, paginaId: tratamiento.id, etiqueta: ETIQUETA_TRATAMIENTO };
    });
    const apuntan = new Set(items.filter((i) => i.tipo === 'page').map((i) => (i as { paginaId: string }).paginaId));
    for (const clave of ORDEN_MENU) {
      const pagina = paginaPorClave(doc.paginas, clave);
      if (!pagina || apuntan.has(pagina.id)) continue;
      const etiqueta = clave === 'tratamiento' ? ETIQUETA_TRATAMIENTO : pagina.titulo;
      items = [...items, nuevoItem({ tipo: 'page', paginaId: pagina.id }, etiqueta, generarId)];
      apuntan.add(pagina.id);
      cambios.push(`menu_${clave}`);
    }
    const limpios = sinPaginasRepetidas(items);
    doc = reemplazarItemsMenu(doc, menu.id, limpios);
  }
  return { documento: doc, cambios };
}

/** Al guardar el editor: escribe `body`, deja de usar `content` y marca `editadoEn` si el hash cambió. */
export function contenidoTrasEditarBody(contenido: Record<string, unknown>, body: string, ahoraIso: string): Record<string, unknown> {
  const siguiente: Record<string, unknown> = { ...contenido, body };
  delete siguiente.content;
  const legal = siguiente.legal;
  if (!legal || typeof legal !== 'object') return siguiente;
  const hash = (legal as { hashGenerado?: unknown }).hashGenerado;
  const editadoEn = typeof hash === 'string' && hashTexto(body) !== hash ? ahoraIso : null;
  siguiente.legal = { ...(legal as Record<string, unknown>), editadoEn };
  return siguiente;
}

/** Párrafos que salen y que entran, para el diálogo de regenerar. */
export function diffPlano(antes: string, despues: string): string {
  const partir = (html: string) => textoPlano(html).split(/(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean);
  const a = partir(antes);
  const b = partir(despues);
  const setA = new Set(a);
  const setB = new Set(b);
  const lineas = [
    ...a.filter((x) => !setB.has(x)).map((x) => `- ${x}`),
    ...b.filter((x) => !setA.has(x)).map((x) => `+ ${x}`),
  ];
  return lineas.join('\n');
}

export interface DiagnosticoClave {
  clave: ClaveLegal;
  estado: 'falta' | 'vacio' | 'texto';
}

export function diagnosticarLegales(documento: DocumentoSitio, claves: readonly ClaveLegal[]): DiagnosticoClave[] {
  return claves.map((clave) => {
    const pagina = paginaPorClave(documento.paginas, clave);
    if (!pagina) return { clave, estado: 'falta' };
    return { clave, estado: caracteresDePagina(pagina) < 80 ? 'vacio' : 'texto' };
  });
}

export function tratamientoApuntaAPrivacidad(documento: DocumentoSitio): boolean {
  const privacidad = paginaPorClave(documento.paginas, 'privacidad');
  if (!privacidad) return false;
  return menusPie(documento)
    .filter((m) => esMenuLegales(m.nombre))
    .some((m) => m.items.some((i) => esAliasTratamiento(i) && i.tipo === 'page' && i.paginaId === privacidad.id));
}

export function enviosEnMenu(documento: DocumentoSitio): boolean {
  const envios = paginaPorClave(documento.paginas, 'envios');
  if (!envios) return false;
  return menusPie(documento)
    .filter((m) => esMenuLegales(m.nombre))
    .some((m) => m.items.some((i) => i.tipo === 'page' && i.paginaId === envios.id));
}
