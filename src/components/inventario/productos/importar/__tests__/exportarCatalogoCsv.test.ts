/// <reference types="jest" />
/**
 * La exportación del catálogo pagina imágenes, precios, stock y etiquetas.
 * Sin rango, PostgREST cortaría en 1.000 y el CSV perdería fotos.
 */
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => { throw new Error('el test inyecta el cliente'); },
    storage: { from: () => ({ getPublicUrl: (ruta: string) => ({ data: { publicUrl: ruta } }) }) },
  },
}));

import { exportarCatalogoCsv, type TextosExportacion } from '../exportarCatalogoCsv';

const textos: TextosExportacion = {
  cabeceras: Array.from({ length: 26 }, (_, i) => `c${i}`),
  producto: 'Producto',
  servicio: 'Servicio',
};

type Fila = Record<string, unknown>;

function cliente(tablas: Record<string, Fila[]>) {
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
      order(col: string) {
        filas = [...filas].sort((a, c) => Number(a[col]) - Number(c[col]));
        return b;
      },
      range(desde: number, hasta: number) {
        conRango = true;
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
  return { from };
}

test('el CSV trae las 1.200 imágenes aunque pasen el tope de 1.000 filas', async () => {
  const products = [1, 2, 3].map((id) => ({
    id,
    sku: `SKU-${id}`,
    name: `Producto ${id}`,
    description: null,
    product_type: 'product',
    unit_code: 'und',
    barcode: null,
    brand: null,
    reference: null,
    track_stock: true,
    variant_data: null,
    is_parent: false,
    station: null,
    status: 'active',
    categories: null,
    parent: null,
  }));
  const product_images = products.flatMap((p) =>
    Array.from({ length: 400 }, (_, n) => ({
      id: p.id * 1000 + n,
      product_id: p.id,
      storage_path: `https://cdn/${p.id}-${n}.jpg`,
      is_primary: n === 0,
      display_order: n,
    })),
  );
  const { csv, total } = await exportarCatalogoCsv(120, textos, undefined, cliente({ products, product_images }) as never);
  expect(total).toBe(3);
  const lineas = csv.replace(/^\uFEFF/, '').split('\n').slice(1);
  expect(lineas).toHaveLength(3);
  for (const [i, linea] of lineas.entries()) {
    const id = i + 1;
    const fotos = linea.split(',')[19].replace(/^"|"$/g, '');
    const esperadas = Array.from({ length: 400 }, (_, n) => `https://cdn/${id}-${n}.jpg`);
    expect(fotos.split(';')).toEqual(esperadas);
  }
});
