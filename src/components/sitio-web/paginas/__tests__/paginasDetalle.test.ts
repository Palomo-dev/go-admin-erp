/**
 * «Crear ficha editable» / «Crear página editable» (Figma 2700:57498): la página de detalle nace
 * en la dirección que busca la tienda, con bloques que el editor conoce, pasa el contrato y no se
 * duplica. Ficha «desde el inicio» (2026-11-22): `asegurarFichaProducto` reproduce el diseño fijo
 * de la tienda, es idempotente y nunca falla.
 */
import { LIMITES_DOCUMENTO, validarDocumentoSitio, VERSION_ESQUEMA_DOCUMENTO, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { getSectionDefinition } from '@/lib/services/websitePageBuilderService';
import { asegurarFichaProducto, crearPaginaDetalle, SLUG_PAGINA_DETALLE, tiposDetalleFaltantes } from '../paginasDetalle';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

let n = 0;
const generarId = () => `id-${++n}`;

const ORDEN_FICHA_FIJA = [
  'product_gallery',
  'product_info',
  'product_description',
  'product_actions',
  'product_benefits',
  'related_products',
  'product_reviews',
];

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

  it('crea la ficha en plantillas/product-detail con los bloques del diseño fijo de la tienda, en su orden', () => {
    const base = documento();
    const r = crearPaginaDetalle(base, 'product_detail', generarId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pagina = r.documento.paginas.find((p) => p.id === r.paginaId)!;
    expect(pagina).toMatchObject({ slug: SLUG_PAGINA_DETALLE.product_detail, tipo: 'product_detail', publicada: true });
    // goadmin-websites app/productos/[id]/page.tsx sin plantilla: galería | información → (contador)
    // → descripción → acciones → beneficios; relacionados y reseñas a todo el ancho.
    expect(pagina.secciones.map((s) => s.tipo)).toEqual(ORDEN_FICHA_FIJA);
    // Sin opciones ni estilo: cada bloque de la tienda pinta lo de siempre (sin SectionWrapper).
    expect(pagina.secciones.every((s) => Object.keys(s.contenido).length === 0 && Object.keys(s.diseno).length === 0)).toBe(true);
    expect(pagina.secciones.every((s) => s.variante === 'default' && s.visibilidad.movil && s.visibilidad.escritorio)).toBe(true);
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

describe('asegurarFichaProducto (ficha editable desde el inicio)', () => {
  it('sin ficha la agrega con el diseño fijo y nada más del sitio cambia', () => {
    const base = documento();
    const r = asegurarFichaProducto(base, generarId);
    expect(r.creada).toBe(true);
    const ficha = r.documento.paginas.find((p) => p.id === r.paginaId)!;
    expect(ficha).toMatchObject({ slug: 'plantillas/product-detail', tipo: 'product_detail', titulo: 'Ficha de producto', publicada: true });
    expect(ficha.secciones.map((s) => s.tipo)).toEqual(ORDEN_FICHA_FIJA);
    expect(r.documento.paginas.filter((p) => p.id !== r.paginaId)).toEqual(base.paginas);
    expect({ ...r.documento, paginas: [] }).toEqual({ ...base, paginas: [] });
    expect(validarDocumentoSitio(r.documento).ok).toBe(true);
    expect(base.paginas).toHaveLength(1);
  });

  it('es idempotente: aplicada dos veces da lo mismo que una y no duplica la ficha', () => {
    const una = asegurarFichaProducto(documento(), generarId);
    const dos = asegurarFichaProducto(una.documento, generarId);
    expect(dos.creada).toBe(false);
    expect(dos.documento).toBe(una.documento);
    expect(dos.paginaId).toBe(una.paginaId);
    expect(dos.documento.paginas.filter((p) => p.tipo === 'product_detail')).toHaveLength(1);
  });

  it('con ids estables, dos lecturas del mismo borrador dan la misma ficha', () => {
    const estable = () => {
      let i = 0;
      return () => `ficha-${i++}`;
    };
    expect(asegurarFichaProducto(documento(), estable()).documento).toEqual(asegurarFichaProducto(documento(), estable()).documento);
  });

  it('una ficha propia (otra dirección, otros bloques) se conserva tal cual', () => {
    const base = documento([
      { id: 'p-propia', slug: 'plantillas/producto', tipo: 'product_detail', titulo: 'Mi ficha', publicada: true, secciones: [{ id: 's1', tipo: 'product_gallery', variante: 'grid', version: 1, contenido: { gallery_layout: 'grid' } }] },
    ]);
    const r = asegurarFichaProducto(base, generarId);
    expect(r).toEqual({ documento: base, creada: false, paginaId: 'p-propia' });
  });

  it('nunca falla: dirección ocupada o tope de páginas → el documento tal cual', () => {
    const ocupada = documento([{ id: 'p-otra', slug: 'plantillas/product-detail', tipo: 'builtin', titulo: 'Otra', publicada: true, secciones: [] }]);
    expect(asegurarFichaProducto(ocupada, generarId)).toEqual({ documento: ocupada, creada: false, paginaId: null });
    const llena = { ...documento(), paginas: Array.from({ length: LIMITES_DOCUMENTO.paginasMaximas }, (_, i) => ({ id: `p${i}`, slug: `p${i}`, tipo: 'builtin', titulo: `P${i}`, publicada: true, secciones: [] })) };
    expect(asegurarFichaProducto(llena, generarId)).toEqual({ documento: llena, creada: false, paginaId: null });
  });
});
