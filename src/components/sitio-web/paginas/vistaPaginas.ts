/**
 * Vista de la lista de Páginas (Figma A/04a): del documento del borrador y de lo que hoy ve el
 * público (revisión publicada o, si el sitio nunca publicó en V2, su importación legacy) a las
 * filas de la tabla con estado, «En el menú», legal, salud SEO y cambios sin publicar. Pura: la
 * usa el route handler `GET /api/sitio-web/paginas`; el navegador recibe el resultado.
 */
import { serializarDeterminista, type DocumentoSitio, type PaginaSitio } from '@/lib/website/contrato/documentoSitio';
import { menuEncabezado, paginasEnMenu } from './operacionesMenu';
import { saludSeo, type SaludSeo } from './saludSeo';
import { claveTipoPagina, esInicio, esPaginaLegal, esPlantillaTienda, type ClaveTipoPagina } from './tipoPagina';

/** Estado de publicación de UNA página (mismos tipos que `EstadoPublicacion`, sin fechas). */
export type EstadoPaginaPublicacion = { tipo: 'publicado' } | { tipo: 'cambios'; cantidad: number } | { tipo: 'sin_publicar' };

export interface FilaPagina {
  id: string;
  titulo: string;
  /** Dirección con «/» delante; Inicio es «/». */
  ruta: string;
  slug: string;
  tipo: ClaveTipoPagina;
  /** `pagina.publicada`: la página sale en el sitio (Ocultar del sitio / Volver a publicar). */
  publicada: boolean;
  estado: EstadoPaginaPublicacion;
  enMenu: boolean;
  legal: boolean;
  inicio: boolean;
  seo: SaludSeo;
  /** Instante de la última modificación conocida (ISO) o `null`. */
  actualizadaEn: string | null;
}

export type PestanaPaginas = 'todas' | 'menu' | 'ocultas' | 'legales';

export interface ContadoresPaginas {
  todas: number;
  menu: number;
  ocultas: number;
  legales: number;
  /** Páginas con cambios sin publicar (subtítulo «1 con cambios sin publicar»). */
  conCambios: number;
}

/** Páginas que se listan: todas menos las plantillas de detalle que viven en Tienda. */
export function paginasListables(documento: DocumentoSitio): PaginaSitio[] {
  return documento.paginas.filter((p) => !esPlantillaTienda(p));
}

/** Diferencias entre la página del borrador y la publicada: secciones distintas + 1 si cambió la ficha. */
export function cambiosDePagina(borrador: PaginaSitio, publicada: PaginaSitio): number {
  const porId = new Map(publicada.secciones.map((s) => [s.id, serializarDeterminista(s)]));
  const idsBorrador = new Set(borrador.secciones.map((s) => s.id));
  let n = 0;
  for (const s of borrador.secciones) if (porId.get(s.id) !== serializarDeterminista(s)) n += 1;
  for (const s of publicada.secciones) if (!idsBorrador.has(s.id)) n += 1;
  if (n === 0 && borrador.secciones.map((s) => s.id).join() !== publicada.secciones.map((s) => s.id).join()) n += 1;
  const ficha = (p: PaginaSitio) => serializarDeterminista({ slug: p.slug, titulo: p.titulo, publicada: p.publicada, seo: p.seo ?? null, tipo: p.tipo });
  if (ficha(borrador) !== ficha(publicada)) n += 1;
  return n;
}

export interface EntradaVistaPaginas {
  documento: DocumentoSitio;
  /** Lo que hoy ve el público (revisión publicada o importación legacy). `null` = nada publicado. */
  publicado: DocumentoSitio | null;
  /** Fecha de la última modificación del borrador (o `updated_at` legacy por página). */
  actualizadoBorrador: string | null;
  /** Fecha de la publicación vigente; las páginas sin cambios se fechan con ella. */
  publicadoEn: string | null;
  /** Fechas legacy por página (`website_pages.updated_at`) cuando no hay sitio V2. */
  fechasLegacy?: ReadonlyMap<string, string>;
}

export function filasPaginas(e: EntradaVistaPaginas): FilaPagina[] {
  const enMenu = paginasEnMenu(menuEncabezado(e.documento));
  const publicadas = new Map((e.publicado?.paginas ?? []).map((p) => [p.id, p]));
  return paginasListables(e.documento).map((p) => {
    const anterior = publicadas.get(p.id);
    const cantidad = anterior ? cambiosDePagina(p, anterior) : 0;
    const estado: EstadoPaginaPublicacion =
      !p.publicada || !anterior || !anterior.publicada
        ? { tipo: 'sin_publicar' }
        : cantidad > 0
          ? { tipo: 'cambios', cantidad }
          : { tipo: 'publicado' };
    const legal = esPaginaLegal(p);
    const inicio = esInicio(p);
    const fechaLegacy = e.fechasLegacy?.get(p.id) ?? null;
    return {
      id: p.id,
      titulo: p.titulo,
      ruta: inicio ? '/' : `/${p.slug}`,
      slug: p.slug,
      tipo: claveTipoPagina(p),
      publicada: p.publicada,
      estado,
      enMenu: enMenu.has(p.id),
      legal,
      inicio,
      seo: saludSeo(p, e.documento),
      actualizadaEn: fechaLegacy ?? (!anterior || cantidad > 0 ? e.actualizadoBorrador : e.publicadoEn ?? e.actualizadoBorrador),
    };
  });
}

/** Ocultas: no están en el menú del encabezado y no son legales (las legales viven en el pie). */
export function enPestana(fila: FilaPagina, pestana: PestanaPaginas): boolean {
  switch (pestana) {
    case 'menu':
      return fila.enMenu;
    case 'ocultas':
      return !fila.enMenu && !fila.legal;
    case 'legales':
      return fila.legal;
    default:
      return true;
  }
}

export function contarPaginas(filas: readonly FilaPagina[]): ContadoresPaginas {
  return {
    todas: filas.length,
    menu: filas.filter((f) => enPestana(f, 'menu')).length,
    ocultas: filas.filter((f) => enPestana(f, 'ocultas')).length,
    legales: filas.filter((f) => enPestana(f, 'legales')).length,
    conCambios: filas.filter((f) => f.estado.tipo === 'cambios').length,
  };
}
