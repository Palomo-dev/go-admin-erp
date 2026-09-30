/**
 * Lecturas del servidor de la tanda 4 del inicio: «Actividad reciente»
 * (`fn_inicio_actividad`) y «Primeros pasos». Todo con la organización del
 * contexto (nunca de la petición), la página convertida a desplazamiento, y
 * los enlaces solo a páginas del menú visible. Organización ficticia 120.
 */
jest.mock('@/lib/navigation/navegacionServidor', () => ({
  seccionesVisiblesServidor: async () => [
    { modulos: [{ paginas: [{ href: '/app/inventario/productos' }, { href: '/app/pos/ventas' }] }] },
  ],
}));
jest.mock('@/lib/services/moduleManagementService', () => ({ moduleManagementService: { getActiveModules: async () => [] } }));
jest.mock('@/lib/utils/zonaHorariaServidor', () => ({ zonaHorariaEnServidor: async () => 'America/Bogota' }));
jest.mock('@/lib/services/organizationOperatingHoursService', () => ({ getOperatingHours: async () => null }));

import { actividadDelInicio, primerosPasos, ventasDelPeriodo } from '../inicio.server';

const rango = { inicio: '2026-09-30T05:00:00.000Z', fin: '2026-09-30T18:00:00.000Z', inicioAnterior: 'c', finAnterior: 'd' };

test('actividad: organización del contexto, periodo, sucursal, tipo y desplazamiento de la página', async () => {
  const rpc = jest.fn(async () => ({ data: { tipos: ['venta'], conteos: { venta: 9 }, total: 9, filas: [] }, error: null }));
  const ctx = { organizationId: 120, userId: 'u', memberId: 1, supabase: { rpc } as never };
  const r = await actividadDelInicio(ctx, rango, 7, { tipo: 'venta', pagina: 3, tamano: 4 });
  expect(rpc).toHaveBeenCalledWith('fn_inicio_actividad', {
    p_organization_id: 120,
    p_desde: rango.inicio,
    p_hasta: rango.fin,
    p_branch_id: 7,
    p_tipo: 'venta',
    p_limite: 4,
    p_offset: 8,
  });
  expect(r.total).toBe(9);
});

test('actividad: un 42501 de la base llega como 403', async () => {
  const rpc = async () => ({ data: null, error: { code: '42501', message: 'sin_permiso' } });
  const ctx = { organizationId: 120, userId: 'u', memberId: 1, supabase: { rpc } as never };
  await expect(actividadDelInicio(ctx, rango, null, { tipo: null, pagina: 1, tamano: 4 })).rejects.toMatchObject({ status: 403 });
});

function consultas() {
  const filtros: Record<string, Array<[string, string, unknown]>> = {};
  const from = (tabla: string) => {
    const f = (filtros[tabla] ??= []);
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'limit']) q[m] = () => q;
    for (const m of ['eq', 'not', 'in']) {
      q[m] = (col: string, ...val: unknown[]) => {
        f.push([m, col, val.length > 1 ? val : val[0]]);
        return q;
      };
    }
    const conteo: Record<string, number> = { organization_modules: 2, branches: 1, organization_members: 1, products: 4, organization_taxes: 0, customers: 0 };
    const res = tabla in conteo ? { count: conteo[tabla], data: null, error: null } : { data: tabla === 'stock_movements' ? [{ id: 1 }] : [], error: null };
    q.then = (ok: (x: unknown) => void) => ok(res);
    return q;
  };
  return { filtros, from };
}

test('primeros pasos: conteos con la organización del contexto; «Ir» solo a páginas del menú', async () => {
  const { filtros, from } = consultas();
  const p = await primerosPasos({ organizationId: 120, userId: 'u', memberId: 1, supabase: { from } as never });
  for (const tabla of ['organization_modules', 'branches', 'organization_members', 'products', 'organization_taxes', 'customers', 'sales', 'invoice_sales', 'stock_movements', 'reservations']) {
    expect(filtros[tabla]).toContainEqual(['eq', 'organization_id', 120]);
  }
  // Los módulos de base no cuentan como «activar módulos».
  expect(filtros.organization_modules).toContainEqual(['not', 'module_code', ['in', '(clientes,organizations,roles,configuracion)']]);
  expect(filtros.organization_members).toContainEqual(['eq', 'is_active', true]);
  expect(p.hayMovimientos).toBe(true);
  expect(p.hechos).toBe(4);
  expect(p.pasos.find((x) => x.id === 'productos')).toEqual({ id: 'productos', hecho: true, href: '/app/inventario/productos' });
  expect(p.pasos.find((x) => x.id === 'impuestos')).toEqual({ id: 'impuestos', hecho: false, href: null });
  expect(p.hrefPos).toBeNull();
});

test('ventas: «Ver ventas» solo si la persona ve esa página', async () => {
  const rpc = async () => ({ data: { actual: { neto: 1, por_sucursal: {} }, anterior: { neto: 0 }, monedas: ['COP'], moneda_base: 'COP' }, error: null });
  const r = await ventasDelPeriodo({ organizationId: 120, userId: 'u', memberId: 1, supabase: { rpc } as never }, rango, null);
  expect(r.hrefVentas).toBe('/app/pos/ventas');
});
