/**
 * «Crear ficha editable» / «Crear página editable» (Figma 2700:57498): la página de detalle nace
 * en la dirección que busca la tienda, con bloques que el editor conoce, pasa el contrato y no se
 * duplica.
 */
import { validarDocumentoSitio, VERSION_ESQUEMA_DOCUMENTO, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { getSectionDefinition } from '@/lib/services/websitePageBuilderService';
import { DEFAULT_PRODUCT_DETAIL_SECTIONS } from '@/lib/services/website/defaultProductDetailSections';
import { crearPaginaDetalle, SLUG_PAGINA_DETALLE, tiposDetalleFaltantes } from '../paginasDetalle';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

let n = 0;
const generarId = () => `id-${++n}`;

function documento(paginasExtra: unknown[] = []): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: VERSION_ESQUEMA_DOCUMENTO,
    tema: {},
    shell: { header: { composicion: 'H01', menuPrincipalId: 'principal' }, footer: { composicion: 'F03', menuIds: [] } },
    menus: [{ id: 'principal', nombre: 'Principal', items: [{ id: 'i1', etiqueta: 'Inicio', tipo: 'page', paginaId: 'p-inicio' }] }],
    paginas: [
      { id: 'p-inicio', slug: 'home', tipo: 'builtin', titulo: 'Inicio', publicada: true, secciones: [] },
      ...paginasExtra,
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

describe('crearPaginaDetalle', () => {
  it('sin ficha: faltan las dos páginas de detalle', () => {
    expect(tiposDetalleFaltantes(documento())).toEqual(['product_detail', 'category_detail']);
  });

  it('crea la ficha en plantillas/product-detail con los bloques por defecto, en su orden', () => {
    const base = documento();
    const r = crearPaginaDetalle(base, 'product_detail', generarId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pagina = r.documento.paginas.find((p) => p.id === r.paginaId)!;
    expect(pagina).toMatchObject({ slug: SLUG_PAGINA_DETALLE.product_detail, tipo: 'product_detail', publicada: true });
    expect(pagina.secciones.map((s) => s.tipo)).toEqual(DEFAULT_PRODUCT_DETAIL_SECTIONS.map((s) => s.section_type));
    expect(pagina.secciones.every((s) => s.visibilidad.movil && s.visibilidad.escritorio)).toBe(true);
    // Nada más del sitio cambia: las demás páginas y los menús quedan igual, y la entrada no se muta.
    expect(r.documento.paginas.filter((p) => p.id !== r.paginaId)).toEqual(base.paginas);
    expect(r.documento.menus).toEqual(base.menus);
    expect(base.paginas).toHaveLength(1);
    expect(validarDocumentoSitio(r.documento).ok).toBe(true);
    expect(tiposDetalleFaltantes(r.documento)).toEqual(['category_detail']);
  });

  it('crea la página de categoría con encabezado, filtros y cuadrícula', () => {
    const r = crearPaginaDetalle(documento(), 'category_detail', generarId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pagina = r.documento.paginas.find((p) => p.id === r.paginaId)!;
    expect(pagina.slug).toBe(SLUG_PAGINA_DETALLE.category_detail);
    expect(pagina.secciones.map((s) => s.tipo)).toEqual(['category_header', 'category_filters', 'category_products']);
    expect(validarDocumentoSitio(r.documento).ok).toBe(true);
  });

  it('el editor conoce todos los bloques que se crean', () => {
    for (const tipo of ['product_detail', 'category_detail'] as const) {
      const r = crearPaginaDetalle(documento(), tipo, generarId);
      if (!r.ok) throw new Error(r.error);
      const pagina = r.documento.paginas.find((p) => p.id === r.paginaId)!;
      expect(pagina.secciones.filter((s) => !getSectionDefinition(s.tipo)).map((s) => s.tipo)).toEqual([]);
    }
  });

  it('si ya existe no la duplica: devuelve la que hay sin tocar el documento', () => {
    const base = documento([{ id: 'p-ficha', slug: 'plantillas/producto', tipo: 'product_detail', titulo: 'Detalle', publicada: true, secciones: [] }]);
    const r = crearPaginaDetalle(base, 'product_detail', generarId);
    expect(r).toEqual({ ok: true, documento: base, paginaId: 'p-ficha', creadas: 0 });
  });

  it('si otra página ocupa la dirección canónica, no la pisa', () => {
    const base = documento([{ id: 'p-otra', slug: 'plantillas/product-detail', tipo: 'builtin', titulo: 'Otra', publicada: true, secciones: [] }]);
    expect(crearPaginaDetalle(base, 'product_detail', generarId)).toEqual({ ok: false, error: 'slug_repetido' });
  });
});
