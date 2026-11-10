/**
 * Entradas fijas de `plantillasTienda.test.ts`: un borrador de tienda importado del sitio viejo y
 * datos de una tienda de prueba (sin nombres reales). Las MISMAS entradas generaron las huellas de
 * `huellasPlantillasMain.json` en la rama base (`claude/plantillas-editor`, 422350cee): así la
 * prueba comprueba que «Solo estilo» y «Plantilla completa» de las plantillas de antes dan el mismo
 * documento, byte a byte, que antes de las 7 plantillas de tienda nuevas.
 *
 * No cambiar sin regenerar las huellas en la rama base.
 */
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';

export function generadorIds(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

/** Borrador de una tienda importada: carrito, checkout, una ficha propia, Inicio y una legal. */
export function borradorTienda(): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    identidad: { alturaLogo: { mode: 'value', value: 64 } },
    tema: {
      colores: { acento: { mode: 'value', value: '#FF6600' } },
      tipografia: {},
      tokens: { radio: { mode: 'value', value: 'suave' }, boton: { forma: { mode: 'value', value: 'redondeado' } } },
    },
    seo: {},
    contenido: {},
    shell: {
      header: { composicion: 'mega', menuPrincipalId: 'paginas-encabezado', opciones: {} },
      footer: { composicion: 'default', menuIds: ['paginas-pie'], opciones: {} },
    },
    menus: [
      { id: 'paginas-encabezado', nombre: 'Páginas del encabezado', items: [{ id: 'i1', etiqueta: 'Inicio', tipo: 'page', paginaId: 'home' }] },
      { id: 'paginas-pie', nombre: 'Páginas del pie', items: [] },
    ],
    paginas: [
      { id: 'cart', slug: 'plantillas/cart', tipo: 'cart', titulo: 'Carrito', publicada: true, secciones: [] },
      { id: 'checkout', slug: 'plantillas/checkout', tipo: 'checkout', titulo: 'Checkout', publicada: true, secciones: [] },
      {
        id: 'ficha',
        slug: 'plantillas/product-detail',
        tipo: 'product_detail',
        titulo: 'Detalle del producto',
        publicada: false,
        secciones: [{ id: 'f1', tipo: 'product_gallery', variante: 'default', version: 1, contenido: { layout: 'grilla' } }],
      },
      {
        id: 'home',
        slug: 'home',
        tipo: 'builtin',
        titulo: 'Inicio',
        publicada: true,
        secciones: [{ id: 's1', tipo: 'hero', variante: 'slider', version: 1, contenido: { title: 'Bienvenidos', image_url: 'https://example.com/banner.jpg' } }],
      },
      {
        id: 'terminos',
        slug: 'terminos',
        tipo: 'legal',
        titulo: 'Términos y condiciones',
        publicada: true,
        secciones: [{ id: 's-t', tipo: 'text_block', variante: 'left', version: 1, contenido: { title: 'Términos', body: 'Texto real' } }],
      },
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

/** Datos de una tienda de prueba (sintéticos). `slug`, `color` e `imagenUrl` los leen solo las 7 nuevas. */
export const DATOS_TIENDA = {
  nombre: 'Tienda de prueba',
  descripcion: 'Muebles hechos a mano. Despachamos a todo el país.',
  ciudad: 'Medellín',
  direccion: 'Calle 1 # 2-3',
  telefono: '3000000000',
  portadaUrl: null,
  productos: [
    { id: 21, nombre: 'Silla', imagenUrl: 'https://example.com/p21.jpg', categoriaId: 1 },
    { id: 22, nombre: 'Mesa', imagenUrl: 'https://example.com/p22.jpg', categoriaId: 1 },
    { id: 23, nombre: 'Lámpara', imagenUrl: 'https://example.com/p23.jpg', categoriaId: 2 },
    { id: 24, nombre: 'Cojín', imagenUrl: 'https://example.com/p24.jpg', categoriaId: 3 },
    { id: 25, nombre: 'Tapete', imagenUrl: 'https://example.com/p25.jpg', categoriaId: 4 },
    { id: 26, nombre: 'Jarrón', imagenUrl: null, categoriaId: 5 },
  ],
  categorias: [
    { id: 1, nombre: 'Sala', slug: 'sala', color: '#C2410C', imagenUrl: 'https://example.com/c1.jpg' },
    { id: 2, nombre: 'Iluminación', slug: 'iluminacion', color: 'azul', imagenUrl: null },
    { id: 3, nombre: 'Textiles', slug: 'textiles', color: null, imagenUrl: null },
    { id: 4, nombre: 'Alfombras', slug: 'alfombras', color: '#1F3FD8', imagenUrl: null },
    { id: 5, nombre: 'Decoración', slug: 'decoracion', color: null, imagenUrl: null },
    { id: 6, nombre: 'Exterior', slug: 'exterior', color: null, imagenUrl: null },
  ],
  testimonios: 0,
};
