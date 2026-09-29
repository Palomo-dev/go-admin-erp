// ============================================================
// permisosMembresias: se resuelven en el servidor con la organización y el usuario de la sesión,
// nunca por el nombre de un rol (regla dura 6).
//   - super admin o rol 1/2 (isOrgAdminLike): todo;
//   - dueño de la organización: todo (igual que fn_membresias_int_exigir en la base);
//   - el resto: los códigos de get_user_permission_codes (rol + cargo);
//   - si la RPC falla: nada (fail-closed).
// ============================================================

jest.mock('@/lib/services/organizationTimezoneService', () => ({
  getOrganizationTimezone: async () => 'America/Bogota',
}));

import { permisosMembresias, exigir, patronBusqueda, paginacion } from '@/lib/services/membresias/membresias.server';
import type { ServerOrgContext } from '@/lib/utils/orgContext';

function ctx(opts: { roleId?: number; superAdmin?: boolean; owner?: string | null; codigos?: string[] | null; errorRpc?: boolean }): ServerOrgContext {
  const llamadas: Array<{ fn: string; args: unknown }> = [];
  const supabase = {
    llamadas,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { owner_user_id: opts.owner ?? null }, error: null }),
        }),
      }),
    }),
    rpc: async (fn: string, args: unknown) => {
      llamadas.push({ fn, args });
      if (opts.errorRpc) return { data: null, error: { message: 'caida' } };
      return { data: opts.codigos ?? [], error: null };
    },
  };
  return {
    userId: 'u-1',
    userEmail: null,
    organizationId: 120,
    organizationName: 'org 120',
    roleId: opts.roleId ?? 4,
    roleName: 'cualquiera',
    isSuperAdmin: opts.superAdmin ?? false,
    memberId: 1,
    supabase: supabase as unknown as ServerOrgContext['supabase'],
  };
}

describe('permisosMembresias', () => {
  it('super admin y roles 1/2: todos, sin consultar', async () => {
    const p = await permisosMembresias(ctx({ superAdmin: true }));
    expect(Object.values(p).every(Boolean)).toBe(true);
    const p2 = await permisosMembresias(ctx({ roleId: 2 }));
    expect(Object.values(p2).every(Boolean)).toBe(true);
  });

  it('dueño de la organización: todos', async () => {
    const p = await permisosMembresias(ctx({ owner: 'u-1', codigos: [] }));
    expect(Object.values(p).every(Boolean)).toBe(true);
  });

  it('empleado: solo los códigos que le da su rol o cargo', async () => {
    const c = ctx({ codigos: ['memberships.view', 'memberships.checkin', 'pos.create'] });
    const p = await permisosMembresias(c);
    expect(p).toEqual({ ver: true, planes: false, congelar: false, cancelar: false, checkin: true, clases: false, dispositivos: false });
    const llamadas = (c.supabase as unknown as { llamadas: Array<{ fn: string; args: { p_user_id: string; p_organization_id: number } }> }).llamadas;
    expect(llamadas[0].fn).toBe('get_user_permission_codes');
    expect(llamadas[0].args).toEqual({ p_user_id: 'u-1', p_organization_id: 120 });
  });

  it('un rol llamado «Admin» sin role_id 1/2 no obtiene nada por el nombre', async () => {
    const c = ctx({ roleId: 99, codigos: [] });
    (c as { roleName: string }).roleName = 'Admin de organización';
    const p = await permisosMembresias(c);
    expect(Object.values(p).some(Boolean)).toBe(false);
  });

  it('si la RPC falla: fail-closed', async () => {
    const p = await permisosMembresias(ctx({ errorRpc: true }));
    expect(Object.values(p).some(Boolean)).toBe(false);
  });

  it('exigir lanza 403 sin_permiso', async () => {
    await expect(exigir(ctx({ codigos: ['memberships.view'] }), 'cancelar')).rejects.toMatchObject({ codigo: 'sin_permiso', estado: 403 });
  });
});

describe('utilidades de consulta', () => {
  it('la búsqueda escapa comodines y caracteres del filtro or de PostgREST', () => {
    expect(patronBusqueda('100%_a,b(c)')).toBe('100\\%\\_a b c');
  });

  it('paginación con tope de 100 por página', () => {
    expect(paginacion(2, 500)).toEqual({ pagina: 2, porPagina: 100, desde: 100, hasta: 199 });
    expect(paginacion(undefined, undefined)).toEqual({ pagina: 1, porPagina: 20, desde: 0, hasta: 19 });
  });
});
