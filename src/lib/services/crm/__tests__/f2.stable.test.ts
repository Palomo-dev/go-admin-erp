/// <reference types="jest" />
/**
 * F2 — casos estables consolidados (origen: tester de F2, `stageGateDiscovery.tester`,
 * consolidado el 2026-09-21). Complementa a `stageGateDiscovery.test.ts` con los
 * bordes que solo estaban aquí:
 *
 *  - valores límite en `discovery_data`: "", "   ", null, [], {}, 0, false,
 *    ["a"] — 0 y false SON respuesta (un «N° sedes: 0» es un dato, no un
 *    hueco); "" / espacios / null / [] no lo son.
 *  - plantilla inactiva, sin plantilla, `sections` no array, error de BD →
 *    campos por defecto (10) y jamás revienta; plantilla activa con
 *    `sections: []` (el DEFAULT de la columna) → campos por defecto (decisión 2026-09-21).
 *  - `requiredKeys` intacto (no toca la plantilla, no consulta la BD).
 *  - forma antigua `completed_sections/total_sections`: NaN, negativos, 0/0.
 *  - la puerta plana `require_discovery: false` no lee plantillas.
 *  - la lectura de la plantilla lleva organization_id y is_active.
 */
import { discoveryDataProgress } from '../discoveryProgress';
import { DEFAULT_DISCOVERY_FIELDS, type DiscoveryField } from '../discoveryTemplateService';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 120, useOrganization: () => ({ organizationId: 120 }) }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120 }));

import { supabase } from '@/lib/supabase/config';
import StageGateService, { evaluateStageGate, type StageRequirement } from '../stageGateService';

const CAMPOS: DiscoveryField[] = [
  { id: 'users_count', label: 'N° usuarios', type: 'number', required: true },
  { id: 'has_erp', label: 'Tiene ERP', type: 'select', options: ['true', 'false'], required: true },
  { id: 'notes', label: 'Notas', type: 'textarea' },
];

/** Doble encadenable que registra filtros; `single`/`maybeSingle` resuelven al resultado de la tabla. */
function makeClient(tables: Record<string, { data: unknown; error?: unknown }>) {
  const queries: { table: string; filters: [string, unknown][] }[] = [];
  const from = (table: string) => {
    const q = { table, filters: [] as [string, unknown][] };
    queries.push(q);
    const result = { data: tables[table]?.data ?? null, error: tables[table]?.error ?? null };
    const self: Record<string, unknown> = {
      select: () => self,
      eq: (k: string, v: unknown) => { q.filters.push([k, v]); return self; },
      order: () => self,
      limit: () => self,
      single: async () => result,
      maybeSingle: async () => result,
    };
    return self;
  };
  return { client: { from } as unknown as Parameters<typeof evaluateStageGate>[0], queries };
}

const opp = (discovery_data: unknown) => ({ id: 'op-1', customer_id: null, salesperson_id: null, amount: 1, expected_close_date: null, discovery_data });

// ═══════════════════════════════════════════════════════════════════════
describe('discoveryDataProgress · valores límite', () => {
  it.each<[string, unknown, boolean]>([
    ['cadena vacía', '', false],
    ['solo espacios', '   ', false],
    ['null', null, false],
    ['undefined', undefined, false],
    ['array vacío', [], false],
    ['cero', 0, true],
    ['false', false, true],
    ['true', true, true],
    ['array con valor', ['a'], true],
    ['número negativo', -1, true],
    ['objeto vacío (String → "[object Object]")', {}, true],
  ])('%s → respondido=%s', (_n, valor, respondido) => {
    const p = discoveryDataProgress({ users_count: valor, has_erp: 'true', notes: 'x' }, CAMPOS);
    expect(p.completed).toBe(respondido ? 3 : 2);
    expect(p.missing).toEqual(respondido ? [] : ['N° usuarios']);
  });

  it('0 y false en obligatorias cuentan como respuesta: la puerta pasa', () => {
    const p = discoveryDataProgress({ users_count: 0, has_erp: false }, CAMPOS);
    expect(p).toEqual({ completed: 2, total: 3, missing: [] });
  });

  it('claves de más en discovery_data no cuentan ni rompen', () => {
    const p = discoveryDataProgress(JSON.parse('{"users_count":3,"has_erp":"false","ajena":"x","__proto__":{"notes":"y"}}'), CAMPOS);
    expect(p).toEqual({ completed: 2, total: 3, missing: [] });
  });

  it('ids de campo que existen en Object.prototype (toString, constructor) NO cuentan como respondidos', () => {
    const raros: DiscoveryField[] = [
      { id: 'toString', label: 'Cadena', type: 'text', required: true },
      { id: 'constructor', label: 'Constructor', type: 'text', required: true },
      { id: 'hasOwnProperty', label: 'Propia', type: 'text' },
    ];
    expect(discoveryDataProgress({}, raros)).toEqual({ completed: 0, total: 3, missing: ['Cadena', 'Constructor'] });
    expect(discoveryDataProgress({ toString: 'sí', constructor: 'sí' }, raros).missing).toEqual([]);
  });

  it('discovery_data no objeto (cadena, número, array) → como vacío', () => {
    for (const dd of ['texto', 7, true]) {
      expect(discoveryDataProgress(dd, CAMPOS).missing).toEqual(['N° usuarios', 'Tiene ERP']);
    }
    // Un array ES objeto: sus índices no coinciden con ningún id de campo → vacío.
    expect(discoveryDataProgress(['a'], CAMPOS).completed).toBe(0);
  });

  it('sin campos (plantilla activa con sections: []) → 0/0 y sin missing: la regla «total > 0» impide pasar', () => {
    expect(discoveryDataProgress({ a: 1 }, [])).toEqual({ completed: 0, total: 0, missing: [] });
  });

  it('forma antigua: NaN, negativos y 0/0 no revientan y no pasan', () => {
    expect(discoveryDataProgress({ completed_sections: Number.NaN, total_sections: 3 }, CAMPOS).missing).toEqual([]);
    expect(discoveryDataProgress({ completed_sections: 0, total_sections: 0 }, CAMPOS)).toEqual({ completed: 0, total: 0, missing: [] });
    expect(discoveryDataProgress({ completed_sections: -1, total_sections: 2 }, CAMPOS).missing).toHaveLength(1);
    // Solo se respeta si AMBOS son numéricos: con cadenas se evalúa la forma real.
    expect(discoveryDataProgress({ completed_sections: '3', total_sections: '3' }, CAMPOS).total).toBe(3);
  });

  it('plantilla con campos sin label: no revienta (missing lleva undefined, se documenta)', () => {
    const raros = [{ id: 'x', type: 'text', required: true }] as unknown as DiscoveryField[];
    expect(() => discoveryDataProgress({}, raros)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe("criterio 'discovery' estructurado · plantilla", () => {
  beforeEach(() => (supabase.from as jest.Mock).mockReset());

  const evalDiscovery = async (dd: unknown, req: StageRequirement = { type: 'discovery' }) =>
    new StageGateService(120).evaluateRequirementPublic(req, opp(dd) as never, [], 'op-1');

  it('la lectura de discovery_templates lleva organization_id=120 e is_active=true', async () => {
    const { client, queries } = makeClient({ discovery_templates: { data: { sections: CAMPOS } } });
    (supabase.from as jest.Mock).mockImplementation(client.from);
    await evalDiscovery({});
    const q = queries.find((x) => x.table === 'discovery_templates')!;
    expect(q.filters).toEqual(expect.arrayContaining([['organization_id', 120], ['is_active', true]]));
  });

  it('error de BD al leer la plantilla → campos por defecto, mensaje honesto, sin reventar', async () => {
    const { client } = makeClient({ discovery_templates: { data: null, error: { message: 'boom' } } });
    (supabase.from as jest.Mock).mockImplementation(client.from);
    const r = await evalDiscovery({});
    expect(r.passed).toBe(false);
    expect(r.message).toBe(`Discovery: 0 de ${DEFAULT_DISCOVERY_FIELDS.length} secciones completas (faltan: ${DEFAULT_DISCOVERY_FIELDS.map((f) => f.label).join(', ')})`);
  });

  it('from() que lanza → campos por defecto (catch)', async () => {
    (supabase.from as jest.Mock).mockImplementation(() => { throw new Error('caído'); });
    const r = await evalDiscovery({});
    expect(r.passed).toBe(false);
    expect(r.message).toContain('de 10 secciones');
  });

  it('sections no array (objeto anidado de discoveryService) → campos por defecto', async () => {
    const { client } = makeClient({ discovery_templates: { data: { sections: { sections: [{ answers: [] }] } } } });
    (supabase.from as jest.Mock).mockImplementation(client.from);
    const r = await evalDiscovery({});
    expect(r.message).toContain('de 10 secciones');
  });

  it('plantilla activa con sections: [] → se evalúa con los campos por defecto (decisión 2026-09-21: nunca «0/0» imposible)', async () => {
    const { client } = makeClient({ discovery_templates: { data: { sections: [] } } });
    (supabase.from as jest.Mock).mockImplementation(client.from);
    const r = await evalDiscovery({ a: 'b' });
    expect(r.message).not.toContain('0/0');
    expect(r.message).toMatch(/de \d+ secciones/);
  });

  it('mensaje en español con nombres de campo, en el orden de la plantilla; completo con opcionales vacías pasa', async () => {
    const { client } = makeClient({ discovery_templates: { data: { sections: CAMPOS } } });
    (supabase.from as jest.Mock).mockImplementation(client.from);
    expect(await evalDiscovery({ notes: 'solo notas' })).toEqual({ passed: false, message: 'Discovery: 1 de 3 secciones completas (faltan: N° usuarios, Tiene ERP)' });
    expect(await evalDiscovery({ users_count: 0, has_erp: false })).toEqual({ passed: true, message: 'Discovery: 2 de 3 secciones completas' });
  });

  it('requiredKeys intacto: 0 sigue contando como falta (`!dd[k]`), no consulta la plantilla', async () => {
    const r = await evalDiscovery({ users_count: 0 }, { type: 'discovery', requiredKeys: ['users_count'] });
    expect(r.passed).toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('requiredKeys: [] equivale a «sin requiredKeys»: se evalúa contra la plantilla, no pasa en vacío', async () => {
    const { client } = makeClient({ discovery_templates: { data: { sections: CAMPOS } } });
    (supabase.from as jest.Mock).mockImplementation(client.from);
    const r = await evalDiscovery({}, { type: 'discovery', requiredKeys: [] });
    expect(r.passed).toBe(false);
    expect(r.message).toBe('Discovery: 0 de 3 secciones completas (faltan: N° usuarios, Tiene ERP)');
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('puerta plana require_discovery', () => {
  const gate = (exit_criteria: unknown, discovery_data: unknown, sections: unknown = CAMPOS) =>
    makeClient({
      stages: { data: { exit_criteria, pipeline_id: 'p1' } },
      opportunities: { data: { id: 'op-1', discovery_data, customers: null } },
      discovery_templates: { data: sections === null ? null : { sections } },
    });

  it('require_discovery: false → no se lee ninguna plantilla y pasa', async () => {
    const { client, queries } = gate({ require_discovery: false }, null);
    const r = await evaluateStageGate(client, 120, { opportunityId: 'op-1', targetStageId: 's1' });
    expect(r.ok).toBe(true);
    expect(queries.some((q) => q.table === 'discovery_templates')).toBe(false);
  });

  it('require_discovery: true con 0/false en obligatorias → pasa; con "" → no pasa y nombra el campo', async () => {
    const ok = gate({ require_discovery: true }, { users_count: 0, has_erp: false });
    expect((await evaluateStageGate(ok.client, 120, { opportunityId: 'op-1', targetStageId: 's1' })).ok).toBe(true);
    expect(ok.queries.find((q) => q.table === 'discovery_templates')!.filters).toEqual(expect.arrayContaining([['organization_id', 120], ['is_active', true]]));

    const ko = gate({ require_discovery: true }, { users_count: '', has_erp: false });
    const r = await evaluateStageGate(ko.client, 120, { opportunityId: 'op-1', targetStageId: 's1' });
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual([{ type: 'discovery', label: 'Discovery', detail: 'Discovery: 1 de 3 secciones completas (faltan: N° usuarios)' }]);
  });

  it('sin plantilla (inactiva o inexistente) → 10 campos por defecto, todos requeridos de facto', async () => {
    const dd = Object.fromEntries(DEFAULT_DISCOVERY_FIELDS.map((f) => [f.id, 'x']));
    const ok = gate({ require_discovery: true }, dd, null);
    expect((await evaluateStageGate(ok.client, 120, { opportunityId: 'op-1', targetStageId: 's1' })).ok).toBe(true);
    const ko = gate({ require_discovery: true }, { ...dd, budget: null }, null);
    const r = await evaluateStageGate(ko.client, 120, { opportunityId: 'op-1', targetStageId: 's1' });
    expect(r.missing[0].detail).toBe('Discovery: 9 de 10 secciones completas (faltan: Presupuesto)');
  });

  it('forma antigua completa en la puerta plana → pasa; incompleta → detalle genérico', async () => {
    const ok = gate({ require_discovery: true }, { completed_sections: 2, total_sections: 2 });
    expect((await evaluateStageGate(ok.client, 120, { opportunityId: 'op-1', targetStageId: 's1' })).ok).toBe(true);
    const ko = gate({ require_discovery: true }, { completed_sections: 1, total_sections: 2 });
    const r = await evaluateStageGate(ko.client, 120, { opportunityId: 'op-1', targetStageId: 's1' });
    expect(r.missing[0].detail).toBe('Discovery: 1 de 2 secciones completas (faltan: secciones pendientes (dato en formato antiguo, sin detalle))');
  });
});
