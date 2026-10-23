/// <reference types="jest" />
/**
 * Formato del catálogo de Meta: columnas, precio regular vs. rebajado,
 * disponibilidad, variantes agrupadas y exclusiones con motivo.
 */
import { atributosVariante, COLUMNAS_META, construirFeedMeta, csvMeta, disponibilidadMeta, formatearPrecioMeta, gtinValido, type ProductoMeta } from '../formatoMeta';

const p = (parcial: Partial<ProductoMeta> & { id: number }): ProductoMeta => ({
  uuid: `u-${parcial.id}`,
  sku: `S-${parcial.id}`,
  name: `Producto ${parcial.id}`,
  description: null,
  brand: null,
  barcode: null,
  status: 'active',
  product_type: 'product',
  track_stock: true,
  is_parent: false,
  parent_product_id: null,
  variant_data: {},
  categoria: null,
  precio: 10000,
  precioComparacion: 0,
  precioDesde: '2026-09-01T00:00:00.000Z',
  precioHasta: null,
  stock: 5,
  imagenes: ['https://img/1.jpg'],
  etiquetas: [],
  ...parcial,
});

const ctx = { moneda: 'COP', decimales: 0, dominio: 'tienda.example', nombreOrganizacion: 'Org', ahora: new Date('2026-09-24T00:00:00Z') };

describe('formato Meta', () => {
  it('las 31 columnas de siempre y additional_image_link al final', () => {
    expect(COLUMNAS_META).toHaveLength(32);
    expect(COLUMNAS_META[0]).toBe('id');
    expect(COLUMNAS_META[30]).toBe('style[0]');
    expect(COLUMNAS_META[31]).toBe('additional_image_link');
  });
  it('precio sin separador de miles y con los decimales de la moneda', () => {
    expect(formatearPrecioMeta(100000, 'COP', 0)).toBe('100000 COP');
    expect(formatearPrecioMeta(9.999, 'usd', 2)).toBe('10.00 USD');
  });
  it('disponibilidad: sin control de stock siempre disponible', () => {
    expect(disponibilidadMeta(false, 0)).toBe('in stock');
    expect(disponibilidadMeta(true, 0)).toBe('out of stock');
    expect(disponibilidadMeta(null, 2)).toBe('in stock');
  });
  it('gtin solo si es un código numérico válido', () => {
    expect(gtinValido('7701234567890')).toBe('7701234567890');
    expect(gtinValido('ABC-1')).toBe('');
    expect(gtinValido('123')).toBe('');
  });
  it('atributos de variante en español o inglés', () => {
    expect(atributosVariante({ Color: 'Rojo', Talla: 'M', Material: 'Algodón' })).toEqual({ color: 'Rojo', size: 'M', material: 'Algodón' });
    expect(atributosVariante('[{"type":"size","value":"L"}]')).toEqual({ size: 'L' });
    expect(atributosVariante('roto')).toEqual({});
  });
});

describe('construirFeedMeta', () => {
  it('price = regular y sale_price = rebajado (antes iban al revés)', () => {
    const r = construirFeedMeta([p({ id: 1, precio: 80000, precioComparacion: 100000 })], ctx);
    expect(r.filas[0].price).toBe('100000 COP');
    expect(r.filas[0].sale_price).toBe('80000 COP');
    expect(r.filas[0].sale_price_effective_date).toBe('2026-09-01T00:00:00.000Z/2027-09-24T00:00:00.000Z');
  });
  it('sin oferta no hay sale_price', () => {
    const r = construirFeedMeta([p({ id: 1, precio: 50000 })], ctx);
    expect(r.filas[0]).toMatchObject({ price: '50000 COP', sale_price: '', link: 'https://tienda.example/productos/u-1', brand: 'Org', description: 'Producto 1', condition: 'new' });
  });
  it('excluye inactivos, servicios, sin precio y sin imagen, con su motivo', () => {
    const r = construirFeedMeta(
      [p({ id: 1, status: 'inactive' }), p({ id: 2, product_type: 'service' }), p({ id: 3, precio: 0 }), p({ id: 4, imagenes: [] }), p({ id: 5 })],
      ctx,
    );
    expect(r.filas.map((f) => f.id)).toEqual(['S-5']);
    expect(r.excluidos.map((e) => e.motivo)).toEqual(['inactivo', 'servicio', 'sinPrecio', 'sinImagen']);
    expect(r.resumen).toMatchObject({ incluidos: 1, excluidos: 4 });
  });
  it('variantes agrupadas por item_group_id; el padre no sale como artículo y las hijas heredan', () => {
    const padre = p({ id: 10, is_parent: true, description: 'Desc padre', brand: 'Marca', categoria: 'Ropa', imagenes: ['https://img/p.jpg', 'https://img/p2.jpg'], etiquetas: ['nuevo'] });
    const hija = p({ id: 11, parent_product_id: 10, precio: 0, imagenes: [], variant_data: { Color: 'Azul' }, stock: 0 });
    const hijaInactiva = p({ id: 12, parent_product_id: 10, status: 'inactive' });
    const r = construirFeedMeta([padre, hija, hijaInactiva], ctx);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({
      id: 'S-11',
      item_group_id: 'S-10',
      description: 'Desc padre',
      brand: 'Marca',
      google_product_category: 'Ropa',
      price: '10000 COP',
      image_link: 'https://img/p.jpg',
      additional_image_link: 'https://img/p2.jpg',
      color: 'Azul',
      availability: 'out of stock',
      quantity_to_sell_on_facebook: '0',
      'product_tags[0]': 'nuevo',
    });
    expect(r.excluidos.map((e) => e.motivo)).toEqual(['padreConVariantes', 'inactivo']);
    expect(r.resumen.variantes).toBe(1);
    expect(r.resumen.excluidos).toBe(1); // el padre con variantes no cuenta como excluido
  });
  it('hijas de un padre inactivo no salen', () => {
    const r = construirFeedMeta([p({ id: 1, status: 'inactive' }), p({ id: 2, parent_product_id: 1 })], ctx);
    expect(r.filas).toHaveLength(0);
    expect(r.excluidos.map((e) => e.motivo)).toEqual(['inactivo', 'padreInactivo']);
  });
  it('conversión de moneda con factor y sin dominio no hay link', () => {
    const r = construirFeedMeta([p({ id: 1, precio: 400000 })], { moneda: 'USD', decimales: 2, factor: 1 / 4000, dominio: null });
    expect(r.filas[0].price).toBe('100.00 USD');
    expect(r.filas[0].link).toBe('');
    expect(r.resumen.sinEnlace).toBe(true);
  });
  it('additional_image_link trae el resto de las imágenes, y repetir el armado da el mismo CSV', () => {
    const imagenes = Array.from({ length: 6 }, (_, i) => `https://img/${i + 1}.jpg`);
    const r = construirFeedMeta([p({ id: 1, imagenes })], ctx);
    expect(r.filas[0].image_link).toBe('https://img/1.jpg');
    expect(r.filas[0].additional_image_link).toBe(imagenes.slice(1).join(','));
    expect(r.resumen.porMotivo.sinImagen).toBeUndefined();
    expect(csvMeta(construirFeedMeta([p({ id: 1, imagenes })], ctx).filas)).toBe(csvMeta(r.filas));
  });
  it('un padre sin fotos usa las de sus variantes activas', () => {
    const padre = p({ id: 10, is_parent: true, imagenes: [] });
    const sinFoto = p({ id: 11, parent_product_id: 10, imagenes: [] });
    const conFoto = p({ id: 12, parent_product_id: 10, imagenes: ['https://img/a.jpg', 'https://img/b.jpg'] });
    const r = construirFeedMeta([padre, sinFoto, conFoto], ctx);
    expect(r.filas.map((f) => f.id).sort()).toEqual(['S-11', 'S-12']);
    expect(r.filas.find((f) => f.id === 'S-11')).toMatchObject({ image_link: 'https://img/a.jpg', additional_image_link: 'https://img/b.jpg' });
    expect(r.filas.find((f) => f.id === 'S-12')).toMatchObject({ image_link: 'https://img/a.jpg', additional_image_link: 'https://img/b.jpg' });
    expect(r.excluidos.map((e) => e.motivo)).toEqual(['padreConVariantes']);
  });
  it('sin control de stock: disponible y sin cantidad', () => {
    const r = construirFeedMeta([p({ id: 1, track_stock: false, stock: 0 })], ctx);
    expect(r.filas[0]).toMatchObject({ availability: 'in stock', quantity_to_sell_on_facebook: '' });
  });
  it('CSV sin BOM, con cabecera y escapado', () => {
    const r = construirFeedMeta([p({ id: 1, name: 'Camiseta, "roja"' })], ctx);
    const csv = csvMeta(r.filas);
    expect(csv.charCodeAt(0)).toBe('i'.charCodeAt(0));
    const [cab, fila] = csv.split('\n');
    expect(cab.split(',')).toHaveLength(32);
    expect(fila).toContain('"Camiseta, ""roja"""');
  });
});
