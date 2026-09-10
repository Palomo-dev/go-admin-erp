import { validateAudience } from '../campaignStore';
import { classifyCandidate, applySegmentRule, resolveAudience } from '../campaignMaterialize';
import { makeSupabase, has } from './mockSupabase';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client en tests'); } }));
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: jest.fn(async () => 0.0125) }));

const base = { channel: 'whatsapp' as const, phone: '+57 310 000 0000', email: null, canContact: true, category: 'utility' as const, hasTemplate: true, windowOpen: false, duplicateRecent: false, channelIsQr: false };

describe('classifyCandidate (razones de exclusión)', () => {
  test('ok → pending con recipient normalizado', () => {
    expect(classifyCandidate(base)).toEqual({ recipient: '573100000000', reason: null });
  });
  test('sin teléfono / inválido', () => {
    expect(classifyCandidate({ ...base, phone: null }).reason).toBe('no_phone');
    expect(classifyCandidate({ ...base, phone: '123' }).reason).toBe('invalid_number');
  });
  test('opt-out (fn_can_contact=false)', () => {
    expect(classifyCandidate({ ...base, canContact: false }).reason).toBe('opted_out');
  });
  test('marketing a EE.UU. bloqueado', () => {
    expect(classifyCandidate({ ...base, category: 'marketing', phone: '+1 415 555 0100' }).reason).toBe('us_marketing');
    expect(classifyCandidate({ ...base, category: 'utility', phone: '+1 415 555 0100' }).reason).toBeNull();
  });
  test('sin plantilla exige ventana abierta (salvo canal QR)', () => {
    expect(classifyCandidate({ ...base, hasTemplate: false }).reason).toBe('window_required');
    expect(classifyCandidate({ ...base, hasTemplate: false, windowOpen: true }).reason).toBeNull();
    expect(classifyCandidate({ ...base, hasTemplate: false, channelIsQr: true }).reason).toBeNull();
  });
  test('misma plantilla en 7 días → duplicate_recent', () => {
    expect(classifyCandidate({ ...base, duplicateRecent: true }).reason).toBe('duplicate_recent');
  });
  test('email: valida formato y opt-out', () => {
    expect(classifyCandidate({ ...base, channel: 'email', email: 'x' }).reason).toBe('no_email');
    expect(classifyCandidate({ ...base, channel: 'email', email: 'a@b.co' })).toEqual({ recipient: 'a@b.co', reason: null });
  });
});

describe('applySegmentRule (misma semántica que SegmentosService.applyFilter)', () => {
  test('tags contains usa contains; ilike para texto; campos fuera de allow-list se ignoran', () => {
    const { sb, calls } = makeSupabase({ customers: () => ({ data: [] }) });
    let q = sb.from('customers').select('id');
    q = applySegmentRule(q, { field: 'tags', operator: 'contains', value: 'vip' });
    q = applySegmentRule(q, { field: 'city', operator: 'contains', value: 'Bog' });
    q = applySegmentRule(q, { field: 'password', operator: 'equals', value: 'x' });
    q = applySegmentRule(q, { field: 'health_score', operator: 'between', value: [10, 50] });
    const ops = calls[0].ops;
    expect(has(ops, 'contains', 'tags')).toBe(true);
    expect(has(ops, 'ilike', 'city', '%Bog%')).toBe(true);
    expect(has(ops, 'eq', 'password')).toBe(false);
    expect(has(ops, 'gte', 'health_score', 10) && has(ops, 'lte', 'health_score', 50)).toBe(true);
  });
});

describe('resolveAudience', () => {
  test('etapas: oportunidades abiertas de la org, dedupe por cliente conservando la oportunidad', async () => {
    const { sb, calls } = makeSupabase({
      opportunities: () => ({ data: [{ id: 'o1', customer_id: 'c1' }, { id: 'o2', customer_id: 'c1' }, { id: 'o3', customer_id: 'c2' }, { id: 'o4', customer_id: null }] }),
    });
    const r = await resolveAudience(7, { source: 'stage', stage_ids: ['s1', 's2'], pipeline_id: 'p1' }, sb);
    expect(r).toEqual([{ customer_id: 'c1', opportunity_id: 'o1' }, { customer_id: 'c2', opportunity_id: 'o3' }]);
    const ops = calls[0].ops;
    expect(has(ops, 'eq', 'organization_id', 7)).toBe(true);
    expect(has(ops, 'eq', 'status', 'open')).toBe(true);
    expect(has(ops, 'in', 'stage_id')).toBe(true);
    expect(has(ops, 'eq', 'pipeline_id', 'p1')).toBe(true);
  });

  test('manual: opportunity_ids + customer_ids', async () => {
    const { sb } = makeSupabase({
      opportunities: () => ({ data: [{ id: 'o1', customer_id: 'c1' }] }),
      customers: () => ({ data: [{ id: 'c2' }, { id: 'c1' }] }),
    });
    const r = await resolveAudience(7, { source: 'manual', opportunity_ids: ['o1'], customer_ids: ['c2', 'c1'] }, sb);
    expect(r.map((x) => x.customer_id).sort()).toEqual(['c1', 'c2']);
    expect(r.find((x) => x.customer_id === 'c1')?.opportunity_id).toBe('o1');
  });

  test('segmento de otra org → 404', async () => {
    const { sb } = makeSupabase({ segments: () => ({ data: null }) });
    await expect(resolveAudience(7, { source: 'segment', segment_id: 'seg-x' }, sb)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('validateAudience (source allow-list)', () => {
  test('source desconocido → 400 (antes materializaba 0 contactos en silencio)', () => {
    expect(() => validateAudience({ source: 'customers', customer_ids: ['c1'] } as never))
      .toThrow(/audience.source inválido/);
  });

  test('los tres sources válidos pasan', () => {
    expect(validateAudience({ source: 'manual', customer_ids: ['c1'] }).source).toBe('manual');
    expect(validateAudience({ source: 'segment', segment_id: 's1' }).source).toBe('segment');
    expect(validateAudience({ source: 'stage', stage_ids: ['st1'] }).source).toBe('stage');
  });
});
