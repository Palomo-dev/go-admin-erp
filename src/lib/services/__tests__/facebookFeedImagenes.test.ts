/// <reference types="jest" />
/**
 * El feed deja de perder imágenes cuando un lote supera las 1.000 filas
 * de PostgREST. Datos sintéticos: 200 productos, 11 fotos cada uno.
 */
import { construirFeedMeta } from '@/lib/services/facebookCatalog/formatoMeta';
import { cargarProductosMeta } from '@/lib/services/facebookFeedService';

const PRODUCTOS = 200;
const FOTOS = 11;

type Fila = Record<string, unknown>;

function cliente(tablas: Record<string, Fila[]>) {
  const paginas: Array<{ tabla: string; desde: number; hasta: number }> = [];
  function from(tabla: string) {
    let filas = [...(tablas[tabla] ?? [])];
    let conRango = false;
    const b = {
      select: () => b,
      eq(col: string, valor: unknown) {
        filas = filas.filter((f) => !(col in f) || f[col] === valor);
        return b;
      },
      neq: () => b,
      in(col: string, valores: readonly number[]) {
        const ids = new Set(valores);
        filas = filas.filter((f) => ids.has(Number(f[col])));
        return b;
      },
      or: () => b,
      order(col: string) {
        filas = [...filas].sort((a, c) => Number(a[col]) - Number(c[col]));
        return b;
      },
      range(desde: number, hasta: number) {
        conRango = true;
        paginas.push({ tabla, desde, hasta });
        filas = filas.slice(desde, hasta + 1);
        return b;
      },
      then(ok: (v: { data: Fila[]; error: null }) => unknown) {
        const data = conRango ? filas : filas.slice(0, 1000);
        return Promise.resolve({ data, error: null }).then(ok);
      },
    };
    return b;
  }
  return {
    paginas,
    from,
    storage: { from: () => ({ getPublicUrl: (ruta: string) => ({ data: { publicUrl: `https://cdn/${ruta}` } }) }) },
  };
}

function mundo() {
  const products = Array.from({ length: PRODUCTOS }, (_, i) => ({
    id: i + 1,
    uuid: `u-${i + 1}`,
    sku: `SKU-${i + 1}`,
    name: `Producto ${i + 1}`,
    description: null,
    brand: null,
    barcode: null,
    status: 'active',
    product_type: 'product',
    track_stock: true,
    is_parent: false,
    parent_product_id: null,
    variant_data: {},
    categories: null,
  }));
  const product_images = products.flatMap((p) =>
    Array.from({ length: FOTOS }, (_, n) => ({
      id: p.id * 100 + n,
      product_id: p.id,
      storage_path: `products/${p.id}-${n}.jpg`,
      is_primary: n === 0,
      display_order: n,
      archivo_disponible: true,
    })),
  );
  const product_prices = products.map((p) => ({
    id: p.id,
    product_id: p.id,
    price: 10000,
    compare_price: null,
    effective_from: '2026-01-01T00:00:00.000Z',
    effective_to: null,
  }));
  const stock_levels = products.map((p) => ({ id: p.id, product_id: p.id, qty_on_hand: 3, qty_reserved: 0 }));
  return cliente({ products, product_images, product_prices, stock_levels, product_tag_relations: [] });
}

describe('cargarProductosMeta', () => {
  it('devuelve todas las imágenes de cada producto aunque el lote pase de 1.000 filas, y la segunda corrida es igual', async () => {
    const sb = mundo();
    const primera = await cargarProductosMeta(120, sb as never);
    const sb2 = mundo();
    const segunda = await cargarProductosMeta(120, sb2 as never);

    expect(primera).toHaveLength(PRODUCTOS);
    for (const p of primera) {
      expect(p.imagenes).toHaveLength(FOTOS);
      expect(p.imagenes[0]).toBe(`https://cdn/products/${p.id}-0.jpg`);
      expect(p.imagenes[FOTOS - 1]).toBe(`https://cdn/products/${p.id}-${FOTOS - 1}.jpg`);
    }
    expect(segunda).toEqual(primera);
    expect(sb.paginas.some((p) => p.tabla === 'product_images' && p.desde === 1000)).toBe(true);

    const feed = construirFeedMeta(primera, { moneda: 'COP', decimales: 0, dominio: 'tienda.example' });
    expect(feed.resumen.porMotivo.sinImagen ?? 0).toBe(0);
    expect(feed.filas).toHaveLength(PRODUCTOS);
    const extra = feed.filas[0].additional_image_link.split(',');
    expect(extra).toHaveLength(FOTOS - 1);
    expect([feed.filas[0].image_link, ...extra]).toEqual(primera[0].imagenes);
  });

  it('no manda a Meta las fotos cuyo archivo ya no existe en el bucket (archivo_disponible = false)', async () => {
    // Producto 1: la principal perdida; producto 2: todas perdidas.
    const sbRotas = cliente({
      products: [{ id: 1, uuid: 'u-1', sku: 'SKU-1', name: 'P1', description: null, brand: null, barcode: null, status: 'active', product_type: 'product', track_stock: true, is_parent: false, parent_product_id: null, variant_data: {}, categories: null }, { id: 2, uuid: 'u-2', sku: 'SKU-2', name: 'P2', description: null, brand: null, barcode: null, status: 'active', product_type: 'product', track_stock: true, is_parent: false, parent_product_id: null, variant_data: {}, categories: null }],
      product_images: [
        { id: 1, product_id: 1, storage_path: 'products/1-0.jpg', is_primary: true, display_order: 0, archivo_disponible: false },
        { id: 2, product_id: 1, storage_path: 'products/1-1.jpg', is_primary: false, display_order: 1, archivo_disponible: true },
        { id: 3, product_id: 2, storage_path: 'products/2-0.jpg', is_primary: true, display_order: 0, archivo_disponible: false },
      ],
      product_prices: [1, 2].map((id) => ({ id, product_id: id, price: 10000, compare_price: null, effective_from: '2026-01-01T00:00:00.000Z', effective_to: null })),
      stock_levels: [1, 2].map((id) => ({ id, product_id: id, qty_on_hand: 3, qty_reserved: 0 })),
      product_tag_relations: [],
    });
    const productos = await cargarProductosMeta(120, sbRotas as never);
    expect(productos.find((p) => p.id === 1)?.imagenes).toEqual(['https://cdn/products/1-1.jpg']);
    expect(productos.find((p) => p.id === 2)?.imagenes).toEqual([]);
  });
});
