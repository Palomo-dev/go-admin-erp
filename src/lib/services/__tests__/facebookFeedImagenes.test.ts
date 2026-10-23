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
      eq: () => b,
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
});
