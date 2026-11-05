/**
 * Servicio de la revisión antes de publicar: lee el borrador guardado (que ya valida que el sitio
 * sea de la organización) y los datos del ERP SIEMPRE filtrados por la organización de la sesión.
 * En el sitio de una sede revisa solo esa sede.
 */
const obtenerBorrador = jest.fn();
jest.mock('@/lib/services/website/siteDocumentService', () => ({ obtenerBorrador: (...a: unknown[]) => obtenerBorrador(...a) }));

import { avisosDePublicacion } from '../avisosPublicacionService';

type Filtro = unknown[];
function clienteFalso(datos: Record<string, unknown[]>) {
  const llamadas: { tabla: string; filtros: Filtro[] }[] = [];
  const cliente = {
    from(tabla: string) {
      const reg = { tabla, filtros: [] as Filtro[] };
      llamadas.push(reg);
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'lte', 'or']) {
        q[m] = (...args: unknown[]) => {
          reg.filtros.push([m, ...args]);
          return q;
        };
      }
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: datos[tabla] ?? [], count: tabla === 'product_branch_prices' ? 0 : null, error: null }).then(ok);
      return q;
    },
  };
  return { cliente: cliente as unknown as Parameters<typeof avisosDePublicacion>[0], llamadas };
}

const documento = {
  paginas: [
    {
      id: 'p',
      slug: 'home',
      tipo: 'builtin',
      titulo: 'Inicio',
      publicada: true,
      secciones: [
        { id: 'a', tipo: 'reservation', variante: 'floor_plan', version: 1, contenido: { branch_ids: [2] } },
        { id: 'b', tipo: 'menu_full', variante: 'dotted', version: 1, contenido: {} },
      ],
    },
  ],
};

const datos = {
  branches: [
    { id: 1, name: 'Sede Laureles', is_active: true, is_web_published: true },
    { id: 2, name: 'Sede Envigado', is_active: true, is_web_published: false },
  ],
  restaurant_tables: [{ branch_id: 1, zone: 'Salón', position_x: 10, position_y: 20 }],
  restaurant_floor_elements: [],
  restaurant_booking_settings: [{ branch_id: null, is_enabled: true }],
};

describe('avisosDePublicacion', () => {
  beforeEach(() => obtenerBorrador.mockReset());

  test('sitio de una sede: revisa solo esa sede y filtra todo por la organización', async () => {
    obtenerBorrador.mockResolvedValue({ sitio: { branchId: 1 }, documento });
    const { cliente, llamadas } = clienteFalso(datos);
    const avisos = await avisosDePublicacion(cliente, 120, 'sitio-1');
    expect(obtenerBorrador).toHaveBeenCalledWith(cliente, 120, 'sitio-1');
    expect(avisos.every((a) => a.valores.sede === undefined || a.valores.sede === 'Sede Laureles')).toBe(true);
    expect(avisos.map((a) => a.clave)).toEqual(['planoListo', 'reservasActivas', 'precioGeneral']);
    for (const l of llamadas) expect(l.filtros).toContainEqual(['eq', 'organization_id', 120]);
  });

  test('sitio principal: la sede que eligió el plano y las sedes con sitio para la carta', async () => {
    obtenerBorrador.mockResolvedValue({ sitio: { branchId: null }, documento });
    const { cliente } = clienteFalso(datos);
    const avisos = await avisosDePublicacion(cliente, 120, 'sitio-1');
    expect(avisos.map((a) => `${a.clave}:${a.valores.sede}`)).toEqual(['sinMesas:Sede Envigado', 'precioGeneral:Sede Laureles']);
  });

  test('sin variantes del café no consulta nada más', async () => {
    obtenerBorrador.mockResolvedValue({ sitio: { branchId: null }, documento: { paginas: [] } });
    const { cliente, llamadas } = clienteFalso(datos);
    expect(await avisosDePublicacion(cliente, 120, 'sitio-1')).toEqual([]);
    expect(llamadas).toEqual([]);
  });
});
