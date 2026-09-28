/**
 * L21 (docs/implementacion/POS-PLAN.md §2.2): favorito de producto y de
 * categoría. Optimista (se ve al instante), se sincroniza con el valor real
 * del servicio y se revierte si falla. `alternarFavorito` y `conFavorito` son
 * la extracción literal de `handleToggleFavorite` y
 * `handleToggleCategoryFavorite` de `src/components/pos/ProductSearch.tsx`.
 * (Sin red, la escritura la encola la capa offline del cliente Supabase:
 * `src/lib/utils/offlineCache.ts`, fuera de esta pantalla.)
 */
import { alternarFavorito, conFavorito } from '@/lib/pos/venta/catalogo';

type Item = { id: number; name: string; is_favorite?: boolean };
const lista: Item[] = [{ id: 1, name: 'A', is_favorite: false }, { id: 2, name: 'B' }];

describe('favoritos (L21)', () => {
  it('conFavorito cambia solo el elemento pedido y no muta la lista', () => {
    const nueva = conFavorito(lista, 2, true);
    expect(nueva).toEqual([{ id: 1, name: 'A', is_favorite: false }, { id: 2, name: 'B', is_favorite: true }]);
    expect(lista[1].is_favorite).toBeUndefined();
  });

  it('optimista y luego el valor REAL del servicio (aunque difiera: carrera con otra caja)', async () => {
    const aplicados: boolean[] = [];
    const r = await alternarFavorito({ antes: false, aplicar: (v) => aplicados.push(v), alternar: async () => false });
    expect(aplicados).toEqual([true, false]);
    expect(r).toEqual({ ok: true, valor: false });
  });

  it('si el servicio falla, se revierte al valor de antes y devuelve el error', async () => {
    const aplicados: boolean[] = [];
    const error = new Error('sin permiso');
    const r = await alternarFavorito({ antes: true, aplicar: (v) => aplicados.push(v), alternar: async () => { throw error; } });
    expect(aplicados).toEqual([false, true]);
    expect(r).toEqual({ ok: false, error });
  });
});
