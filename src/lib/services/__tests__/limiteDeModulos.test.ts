/**
 * `plans.max_modules = NULL` significa «sin límite». moduleManagementService lo
 * convertía en 0 (`max_modules || 0`): POST /api/modules respondía 400 «límite de
 * módulos de tu plan (0)» a todas las organizaciones en Ultimate y la corrección de
 * inconsistencias habría desactivado todos sus módulos pagos.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import { limiteDeModulos, moduleManagementService } from '@/lib/services/moduleManagementService';

describe('limiteDeModulos', () => {
  it('NULL o undefined = ilimitado: siempre se puede activar y nunca sobra nada', () => {
    for (const max of [null, undefined]) {
      expect(limiteDeModulos(max, 0)).toEqual({ maxPermitidos: null, ilimitado: true, puedeActivarMas: true, excedente: 0 });
      expect(limiteDeModulos(max, 40)).toEqual({ maxPermitidos: null, ilimitado: true, puedeActivarMas: true, excedente: 0 });
    }
  });

  it('con tope: deja activar hasta el tope y no más', () => {
    expect(limiteDeModulos(13, 12)).toMatchObject({ maxPermitidos: 13, ilimitado: false, puedeActivarMas: true, excedente: 0 });
    expect(limiteDeModulos(13, 13)).toMatchObject({ puedeActivarMas: false, excedente: 0 });
    expect(limiteDeModulos(13, 15)).toMatchObject({ puedeActivarMas: false, excedente: 2 });
  });

  it('un 0 explícito sí es tope de cero', () => {
    expect(limiteDeModulos(0, 0)).toEqual({ maxPermitidos: 0, ilimitado: false, puedeActivarMas: false, excedente: 0 });
    expect(limiteDeModulos(0, 3)).toMatchObject({ excedente: 3 });
  });
});

/** Cliente falso: cada tabla devuelve lo indicado, con cualquier cadena de filtros. */
function clienteFalso(planMaxModules: number | null, activos: string[]) {
  const modulos = [
    { code: 'organizations', is_core: true, rank: 1 },
    { code: 'inventory', is_core: false, rank: 2 },
    { code: 'pos', is_core: false, rank: 3 },
    { code: 'crm', is_core: false, rank: 4 },
  ];
  const respuestas: Record<string, unknown> = {
    organizations: { data: { id: 333, name: 'org 333' }, error: null },
    subscriptions: { data: { metadata: {} }, error: null },
    organization_modules: { data: activos.map((c) => ({ module_code: c, is_active: true })), error: null },
    modules: { data: modulos, error: null },
  };
  const consulta = (tabla: string) => {
    const r = respuestas[tabla];
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order']) q[m] = () => q;
    q.single = async () => r;
    q.maybeSingle = async () => r;
    q.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(r).then(ok, ko);
    return q;
  };
  return {
    from: consulta,
    rpc: async () => ({
      data: [{ plan_id: 5, plan_code: 'ultimate', plan_name: 'Plan Ultimate', max_modules: planMaxModules, max_branches: 15 }],
      error: null,
    }),
  } as never;
}

describe('getOrganizationModuleStatus con un plan sin límite', () => {
  it('max_modules NULL: is_unlimited, max_modules_allowed null y deja activar', async () => {
    const estado = await moduleManagementService.getOrganizationModuleStatus(333, clienteFalso(null, ['organizations', 'inventory']));
    expect(estado.is_unlimited).toBe(true);
    expect(estado.max_modules_allowed).toBeNull();
    expect(estado.can_activate_more).toBe(true);
    expect(estado.paid_modules_count).toBe(1);
  });

  it('max_modules 1 con 1 pago activo: no deja activar más', async () => {
    const estado = await moduleManagementService.getOrganizationModuleStatus(333, clienteFalso(1, ['organizations', 'inventory']));
    expect(estado.is_unlimited).toBe(false);
    expect(estado.max_modules_allowed).toBe(1);
    expect(estado.can_activate_more).toBe(false);
  });
});
