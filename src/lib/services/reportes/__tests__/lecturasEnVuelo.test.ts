// Lecturas del centro de reportes que varias pantallas piden en el mismo
// montaje (contador de favoritos y «Recientes»; nombre de quien usa el chat):
// una sola petición mientras está en vuelo.

const getUser = jest.fn();
const consultas: string[] = [];
jest.mock('@/lib/supabase/config', () => {
  const cadena = (tabla: string) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'not', 'order', 'neq']) c[m] = () => c;
    c.limit = async () => {
      consultas.push(tabla);
      return { data: [{ id: 'g1', report_id: 'ventas-periodo', is_favorite: true, last_filters: {}, last_used_at: null }], error: null };
    };
    return c;
  };
  return { supabase: { auth: { getUser: (...a: unknown[]) => getUser(...a) }, from: (t: string) => cadena(t) } };
});

import { compartirEnVuelo, listarGuardados, usuarioDeSesion } from '../lecturasReportes';

beforeEach(() => {
  getUser.mockReset();
  consultas.length = 0;
});

describe('compartirEnVuelo', () => {
  it('comparte la promesa mientras está en vuelo y la olvida al terminar', async () => {
    const mapa = new Map<string, Promise<number>>();
    const crear = jest.fn(async () => 1);
    const [a, b] = await Promise.all([compartirEnVuelo(mapa, 'k', crear), compartirEnVuelo(mapa, 'k', crear)]);
    expect([a, b]).toEqual([1, 1]);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(mapa.size).toBe(0);
    await compartirEnVuelo(mapa, 'k', crear);
    expect(crear).toHaveBeenCalledTimes(2);
  });

  it('un fallo no queda guardado', async () => {
    const mapa = new Map<string, Promise<number>>();
    await expect(compartirEnVuelo(mapa, 'k', async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(mapa.size).toBe(0);
  });
});

describe('lecturas compartidas', () => {
  it('dos listarGuardados simultáneos: un getUser y una consulta', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const [a, b] = await Promise.all([listarGuardados(5), listarGuardados(5)]);
    expect(a).toBe(b);
    expect(a[0]).toMatchObject({ reportId: 'ventas-periodo', favorito: true });
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(consultas).toEqual(['saved_reports']);
  });

  it('usuarioDeSesion comparte la llamada con los favoritos', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.co' } } });
    const [u] = await Promise.all([usuarioDeSesion(), listarGuardados(5)]);
    expect(u?.email).toBe('a@b.co');
    expect(getUser).toHaveBeenCalledTimes(1);
  });
});
