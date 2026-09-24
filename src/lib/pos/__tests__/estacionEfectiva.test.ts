/**
 * Estación de cocina heredada (decisión del dueño, 2026-09-24): el producto usa
 * la estación de su categoría salvo que tenga una propia; products.station
 * NULL = hereda. Misma regla que fn_estacion_efectiva (migración 20260924191000).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { esEstacionCocina, estacionDeCategoria, estacionEfectiva } from '../estacionEfectiva';

const raiz = process.cwd();
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8');

describe('estacionEfectiva', () => {
  it('sin estación propia hereda la de la categoría', () => {
    expect(estacionEfectiva({ propia: null, categoria: 'hot_kitchen' })).toBe('hot_kitchen');
  });
  it('la propia gana a la de la categoría', () => {
    expect(estacionEfectiva({ propia: 'bar', categoria: 'hot_kitchen' })).toBe('bar');
  });
  it('una variante sin propia usa la propia del padre antes que la categoría', () => {
    expect(estacionEfectiva({ propia: null, propiaPadre: 'cold_kitchen', categoria: 'hot_kitchen' })).toBe('cold_kitchen');
  });
  it('una variante con propia gana al padre', () => {
    expect(estacionEfectiva({ propia: 'bar', propiaPadre: 'cold_kitchen', categoria: 'hot_kitchen' })).toBe('bar');
  });
  it('si la categoría cambia, el producto que hereda cambia con ella', () => {
    const producto = { propia: null };
    expect(estacionEfectiva({ ...producto, categoria: 'hot_kitchen' })).toBe('hot_kitchen');
    expect(estacionEfectiva({ ...producto, categoria: 'bar' })).toBe('bar');
  });
  it('cadena vacía cuenta como «hereda»', () => {
    expect(estacionEfectiva({ propia: '', propiaPadre: '  ', categoria: 'bar' })).toBe('bar');
  });
  it('sin ninguna estación devuelve null', () => {
    expect(estacionEfectiva({})).toBeNull();
  });
});

describe('estacionDeCategoria', () => {
  it('acepta objeto, arreglo (embed de PostgREST) o nulo', () => {
    expect(estacionDeCategoria({ station: 'bar' })).toBe('bar');
    expect(estacionDeCategoria([{ station: 'cold_kitchen' }])).toBe('cold_kitchen');
    expect(estacionDeCategoria([])).toBeNull();
    expect(estacionDeCategoria(null)).toBeNull();
  });
});

describe('esEstacionCocina', () => {
  it('solo admite los valores del CHECK de products/categories', () => {
    for (const e of ['hot_kitchen', 'cold_kitchen', 'bar', 'cashier', 'all']) expect(esEstacionCocina(e)).toBe(true);
    expect(esEstacionCocina('kitchen')).toBe(false);
    expect(esEstacionCocina(null)).toBe(false);
  });
});

describe('migración 20260924191000 — estación heredada', () => {
  const sql = leer('supabase/migrations/20260924191000_estacion_cocina_heredada.sql');

  it('la BD resuelve en el mismo orden: propia → padre → categoría', () => {
    expect(sql).toContain('coalesce(p.station, pp.station, c.station)');
    expect(sql).toContain('coalesce(p.category_id, pp.category_id)');
  });
  it('respalda antes de pasar a «hereda» y solo lo que no cambia de estación efectiva', () => {
    expect(sql.indexOf('insert into private.respaldo_estacion_productos_20260924')).toBeLessThan(sql.indexOf('set station = null'));
    expect(sql).toContain('p.station = c.station');
    expect(sql).toContain('v.station = coalesce(pp.station, c.station)');
  });
  it('las funciones no quedan abiertas a anon', () => {
    expect(sql).toMatch(/revoke all on function public\.fn_estacion_efectiva\(integer\) from public, anon;/);
    expect(sql).toMatch(/revoke all on function public\.fn_estaciones_efectivas\(integer, integer\[\]\) from public, anon;/);
    expect(sql).toMatch(/revoke all on table private\.respaldo_estacion_productos_20260924 from public, anon, authenticated;/);
  });
});

describe('lectores de la estación', () => {
  it('el formulario ya no copia la estación de la categoría como valor fijo', () => {
    const fuente = leer('src/components/inventario/productos/formulario/secciones/SeccionInformacion.tsx');
    expect(fuente).not.toMatch(/station:\s*categoria\.station/);
    expect(fuente).not.toMatch(/\{\s*station\s*\}/);
  });

  // Reapuntado en el paso 1 del rediseño del POS (docs/implementacion/POS-PLAN.md):
  // la estación de la comanda (antes en page.tsx, handleSendComanda) pasó a
  // src/lib/pos/venta/enviarCocina.ts y la de la variante elegida o escaneada
  // (antes en ProductSearch.tsx) a src/lib/pos/venta/catalogo.ts. Se exige el
  // import en los archivos que ahora resuelven, y page.tsx y ProductSearch.tsx
  // siguen sin poder volver a «categoría primero» (abajo).
  it.each([
    'src/lib/pos/venta/enviarCocina.ts',
    'src/lib/pos/venta/catalogo.ts',
    'src/components/pos/mesas/id/AddProductDialog.tsx',
  ])('%s resuelve con estacionEfectiva (sin «categoría primero»)', (ruta) => {
    const fuente = leer(ruta);
    expect(fuente).toContain("from '@/lib/pos/estacionEfectiva'");
    expect(fuente).not.toMatch(/station\s*\|\|\s*product\?\.station/);
    expect(fuente).not.toMatch(/inheritedCategory\?\.station\s*\|\|/);
  });

  it.each([
    'src/app/app/pos/page.tsx',
    'src/components/pos/ProductSearch.tsx',
  ])('%s delega la estación en src/lib/pos/venta y no la resuelve con «categoría primero»', (ruta) => {
    const fuente = leer(ruta);
    expect(fuente).toContain("from '@/lib/pos/venta/");
    expect(fuente).not.toMatch(/station\s*\|\|\s*product\?\.station/);
    expect(fuente).not.toMatch(/inheritedCategory\?\.station\s*\|\|/);
  });

  it.each([
    'src/lib/services/printJobsService.ts',
    'src/lib/services/webOrderConfirmationService.ts',
  ])('%s consulta la estación efectiva en el servidor', (ruta) => {
    const fuente = leer(ruta);
    expect(fuente).toContain("rpc('fn_estaciones_efectivas'");
    expect(fuente).not.toMatch(/cat\.station\s*\|\|\s*p\.station/);
  });
});
