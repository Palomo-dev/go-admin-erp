import type { SupabaseClient } from '@supabase/supabase-js';
import { fakeSupabase, makeDb, seed, ORG, U } from '@/app/api/crm/referrals/__tests__/f12Fake';
import { readAllF12, referralStats, partnerNetworkStats, summarizeF12Money, readF12Period } from '../f12ReadService';
import { getPartners } from '../partnerService';
import { getReferrals } from '../referralsService';

const now = new Date('2026-10-01T02:00:00Z'); // September in Bogotá, October in Madrid.
const sb = (tables = seed()) => fakeSupabase(makeDb(tables)) as unknown as SupabaseClient;
const money = { base: 'COP', timezone: 'America/Bogota', date: '2026-09-30', rates: [{ base_currency: 'USD', target_currency: 'COP', rate: 4000, effective_date: '2026-09-01' }] };
describe('red comercial: lecturas completas y cifras comparables', () => {
  it('incluye 1.205 partners y sus deals después de la primera página', async () => {
    const tables = seed();
    tables.partners = Array.from({ length: 1205 }, (_, i) => ({ ...tables.partners[0], id: U(1000 + i) }));
    tables.partner_deals = [{ ...tables.partner_deals[0], partner_id: U(2204) }];
    const result = await getPartners(ORG, sb(tables));
    expect(result).toHaveLength(1205);
    expect(result.find(p => p.id === U(2204))?.deals_count).toBe(1);
    expect(result.find(p => p.id === U(2204))?.revenue?.total).toBe(1000000);
  });
  it('suma USD y COP por el kit canónico; una tasa futura no entra', () => {
    const result = summarizeF12Money([{ monto: 10, moneda: 'USD' }, { monto: 1000, moneda: 'COP' }], money)!;
    expect(result.total).toBe(41000);
    expect(result.convertidas[0].fechaTasa).toBe('2026-09-01');
    expect(summarizeF12Money([{ monto: 10, moneda: 'EUR' }], money)?.sinTasa[0].moneda).toBe('EUR');
    expect(summarizeF12Money([{ monto: 10, moneda: 'USD' }], { ...money, date: '2026-08-31' })?.sinTasa).toHaveLength(1);
  });
  it.each([{ monto: null, moneda: 'COP' }, { monto: 10, moneda: null }, { monto: NaN, moneda: 'COP' }])('informa un dato monetario ausente sin inventar cero: %p', item => {
    expect(summarizeF12Money([item], money)).toBeNull();
  });
  it('mes según la organización: no suma descuentos porcentuales ni regalos como dinero', async () => {
    const tables = seed();
    tables.organizations = [{ id: ORG, timezone: 'America/Bogota' }];
    tables.referrals.push({ ...tables.referrals[2], id: U(501), program_id: U(11) });
    tables.referral_programs.push({ ...tables.referral_programs[0], id: U(502), reward_type: 'gift', reward_amount: 999999 });
    tables.referrals.push({ ...tables.referrals[2], id: U(503), program_id: U(502) });
    const result = await referralStats(ORG, sb(tables), 'month', now);
    expect(new Date(result.start).toISOString()).toBe('2026-09-01T05:00:00.000Z');
    expect(new Date(result.end).toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(result.counts.total).toBe(6);
    expect(result.rewards?.pending?.total).toBe(50000);
    tables.organizations[0].timezone = 'Europe/Madrid';
    expect((await referralStats(ORG, sb(tables), 'month', now)).counts.total).toBe(0);
  });
  it('deals del año, pendientes globales y pagadas por paid_at tienen alcances explícitos', async () => {
    const tables = seed(); tables.organizations = [{ id: ORG, timezone: 'America/Bogota' }];
    tables.partner_deals[0].created_at = '2025-01-01T12:00:00Z';
    tables.partner_deals[1].created_at = '2026-09-01T12:00:00Z';
    tables.partner_deals[1].commission_status = 'paid'; tables.partner_deals[1].commission_paid_at = '2026-09-01T12:00:00Z';
    const result = await partnerNetworkStats(ORG, sb(tables), 'year', now);
    expect(result.counts).toMatchObject({ active: 2, deals: 1, pending: 1, paid: 1 });
    expect(result.commissions?.pending?.total).toBe(125000);
    expect(result.commissions?.paid?.total).toBe(31250.06);
  });
  it('si falta la moneda de una oportunidad, la comisión es no disponible', async () => {
    const tables = seed(); tables.opportunities[0].currency = null;
    const result = await partnerNetworkStats(ORG, sb(tables), 'year', now);
    expect(result.commissions?.pending).toBeNull(); expect(result.currency_missing).toBe(true);
  });
  it('una respuesta incompleta o un conteo omitido falla en lugar de publicar una lista vacía', async () => {
    const tables = seed(), client = sb(tables);
    const query = { eq: () => query, order: () => query, range: async () => ({ data: [], error: null, count: null }) };
    const incomplete = { from: () => ({ select: () => query }) } as unknown as SupabaseClient;
    await expect(getReferrals(ORG, incomplete)).rejects.toThrow('conteo exacto');
    const db = makeDb(tables); db.errors['partners:select'] = { message: 'upstream failed' };
    await expect(readAllF12(fakeSupabase(db) as unknown as SupabaseClient, 'partners', '*', ORG)).rejects.toEqual({ message: 'upstream failed' });
    expect(await readAllF12(client, 'partners', '*', ORG)).toHaveLength(2);
  });
  it('rechaza períodos desconocidos', () => expect(() => readF12Period(new URLSearchParams('period=all'), 'month')).toThrow('period debe'));
});
