import { leerAudienciaSegmento, type SegmentoRegistro } from '../segmentosAudiencia';
import { makeSupabase, opArg } from '../whatsapp/__tests__/mockSupabase';
import { U } from '@/app/api/crm/__tests__/ola1Fake';
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
const rows = Array.from({ length: 1206 }, (_, i) => ({ id: U(i + 1), city: 'Ciudad de prueba', full_name: `Cliente ${i}`,
  phone: '+12025550199', email: 'fixture@example.invalid', consent: { whatsapp: i % 2 ? 'unknown' : 'opted_in' },
  email_bounced: false, can_email: true, can_voice: true, can_whatsapp: true }));
function client(base = 1206) {
  return makeSupabase({ customers: ops => {
    const select = ops.find(op => op.method === 'select');
    if ((select?.args[1] as { head?: boolean })?.head) return { data: null, count: base };
    const after = opArg<string>(ops, 'gt', 1) ?? '';
    return { data: rows.filter(r => r.id > after).slice(0, opArg<number>(ops, 'limit') ?? 1000) };
  } }, (fn, args) => {
    if (fn === 'crm_segment_context_page') {
      const after = String(args.p_after ?? '');
      return { data: rows.filter(r => r.id > after && (!Array.isArray(args.p_customers) || args.p_customers.includes(r.id))).slice(0, Number(args.p_limit)) };
    }
    if (fn === 'crm_segment_excluded_phones') return { data: [{ phone: '+12025550199', source: 'rne' }] };
    throw new Error(`RPC inesperada ${fn}`);
  });
}
test('1206 coincidencias: conteo completo, tres muestras, miembros paginados y canales reales', async () => {
  const { sb, rpcCalls } = client();
  const result = await leerAudienciaSegmento(120, sb, { filter: [{ field: 'city', operator: 'equals', value: 'Ciudad de prueba' }],
    collectIds: true, page: 48, pageSize: 25 });
  expect(result.counts).toMatchObject({ total: 1206, base: 1206, rne_excluded: 1206, with_phone: 1206,
    voice_contactable: 0, whatsapp_opt_in: 603, whatsapp_contactable: 0, email_contactable: 1206 });
  expect(result.samples).toHaveLength(3); expect(result.members).toHaveLength(25);
  expect(result.members[0].id).toBe(U(1176)); expect(result.ids).toHaveLength(1206); expect(result.has_more).toBe(true);
  expect(rpcCalls.filter(c => c.fn === 'crm_segment_context_page')).toHaveLength(2);
  expect(new Set(rpcCalls.map(c => c.args.p_org))).toEqual(new Set([120]));
});
test('una audiencia mayor que el límite produce 413, nunca una lista recortada', async () => {
  await expect(leerAudienciaSegmento(120, client().sb, { filter: [], collectIds: true, maxIds: 1000 })).rejects.toMatchObject({ status: 413 });
});
test('estático lee el snapshot y no vuelve a evaluar sus reglas; histórico sin snapshot avisa', async () => {
  const segment = { id: U(5000), organization_id: 120, is_dynamic: false, filter_json: [{ field: 'country', operator: 'equals', value: 'x' }],
    members_snapshotted_at: '2026-10-01T00:00:00Z' } as SegmentoRegistro;
  const { sb, rpcCalls } = client(1300);
  const result = await leerAudienciaSegmento(120, sb, { segment });
  expect(result.counts).toMatchObject({ total: 1206, base: 1300 });
  expect(rpcCalls[0].args.p_segment).toBe(segment.id);
  await expect(leerAudienciaSegmento(120, sb, { segment: { ...segment, members_snapshotted_at: null } })).rejects.toMatchObject({ status: 409 });
});
test('un error de contexto o RNE se propaga y no se presenta como cero clientes', async () => {
  const failure = { code: 'XX000', message: 'fixture' };
  const { sb } = makeSupabase({}, () => ({ data: null, error: failure }));
  await expect(leerAudienciaSegmento(120, sb, { filter: [] })).rejects.toMatchObject(failure);
});
