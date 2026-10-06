/**
 * Datos de las vistas previas de Menú y navegación (Figma A/04c y D/04-09), sacados del
 * documento del borrador: tema del SITIO (no del ERP), enlaces del encabezado y columnas del
 * megamenú con las categorías reales del Inventario. Puro.
 */
import type { CampoHeredable, DocumentoSitio, ItemMenu } from '@/lib/website/contrato/documentoSitio';
import { contraste } from '@/lib/utils/contrasteColor';
import { TEMA_VISTA_RESPALDO, type TemaVistaSitio } from '@/components/sitio-web/ui/temaVistaSitio';
import type { DisposicionEncabezado } from '@/components/sitio-web/ui/HeaderLayoutThumb';
import type { ColumnaMegaMenu } from '@/components/sitio-web/ui/MegaMenuPreview';
import type { EnlaceVista } from '@/components/sitio-web/ui/SiteHeaderPreview';
import { menuEncabezado } from './operacionesMenu';
import type { CategoriaInventarioMenu } from './tiposPaginas';

function valor<T>(campo: CampoHeredable<T> | undefined): T | null {
  return campo && campo.mode === 'value' ? campo.value : null;
}

/** Tema de la vista previa: colores y fuentes del borrador, con el respaldo neutro si faltan. */
export function temaDesdeDocumento(documento: DocumentoSitio | null): TemaVistaSitio {
  if (!documento) return TEMA_VISTA_RESPALDO;
  const c = documento.tema.colores ?? {};
  const fondo = valor(c.fondo) ?? TEMA_VISTA_RESPALDO.fondo;
  const texto = valor(c.texto) ?? TEMA_VISTA_RESPALDO.texto;
  const acento = valor(c.acento) ?? valor(c.primario) ?? TEMA_VISTA_RESPALDO.acento;
  const contraFondo = contraste(acento, fondo) ?? 0;
  const contraTexto = contraste(acento, texto) ?? 0;
  const titulos = valor(documento.tema.tipografia?.titulos);
  const cuerpo = valor(documento.tema.tipografia?.cuerpo);
  return {
    ...TEMA_VISTA_RESPALDO,
    fondo,
    texto,
    fondoSecundario: fondo,
    textoSuave: texto,
    linea: texto,
    acento,
    textoAcento: contraFondo >= contraTexto ? fondo : texto,
    fuenteTitulos: titulos ? `'${titulos}', sans-serif` : TEMA_VISTA_RESPALDO.fuenteTitulos,
    fuenteTexto: cuerpo ? `'${cuerpo}', sans-serif` : TEMA_VISTA_RESPALDO.fuenteTexto,
  };
}

const DISPOSICION: Record<string, DisposicionEncabezado> = {
  centered: 'logo_centrado',
  logo_centrado: 'logo_centrado',
  split: 'dividido',
  dividido: 'dividido',
  minimal: 'minimo',
  minimo: 'minimo',
  mega: 'megamenu',
  megamenu: 'megamenu',
};

export function disposicionEncabezado(documento: DocumentoSitio | null): DisposicionEncabezado {
  return (documento && DISPOSICION[documento.shell.header.composicion]) || 'clasico';
}

export function nombreMarca(documento: DocumentoSitio | null, respaldo: string): string {
  return (documento && valor(documento.identidad?.nombre)) || respaldo;
}

export function logoMarca(documento: DocumentoSitio | null): string | null {
  return (documento && valor(documento.identidad?.logoUrl)) || null;
}

/** Enlaces del primer nivel del menú del encabezado; `activo` = el elegido en el árbol. */
export function enlacesEncabezado(documento: DocumentoSitio | null, activoId: string | null): EnlaceVista[] {
  const menu = documento ? menuEncabezado(documento) : null;
  return (menu?.items ?? []).map((i) => ({
    etiqueta: i.etiqueta,
    tieneSubmenu: (i.hijos?.length ?? 0) > 0,
    activo: i.id === activoId || (i.hijos ?? []).some((h) => h.id === activoId),
  }));
}

/** Columnas del megamenú: una por categoría hija del enlace, con sus productos reales. */
export function columnasMegaMenu(
  item: ItemMenu | null,
  categorias: ReadonlyMap<string, CategoriaInventarioMenu>,
  textoDetalle: (productos: number) => string,
  maximo = 6,
): ColumnaMegaMenu[] {
  if (!item) return [];
  return (item.hijos ?? [])
    .filter((h) => h.tipo === 'entity' && h.entidad === 'category')
    .slice(0, maximo)
    .map((h) => {
      const c = categorias.get((h as { entidadId: string }).entidadId);
      return {
        titulo: h.etiqueta,
        detalle: c ? textoDetalle(c.productos) : undefined,
        imagenUrl: c?.imagenUrl ?? null,
        enlaces: (c?.muestra ?? []).map((nombre) => ({ etiqueta: nombre })),
      };
    });
}
