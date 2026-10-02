import type { FakeDb, Row } from './f12Fake';
/** Explicit transactional RPC boundary. Domain formulas stay in the production native TS engines. */
export function f12AtomicRpc(db: FakeDb, name: string, args: Record<string, unknown>) {
  const fail = (code: string, message: string) => ({ data: null, error: { code, message } });
  const own = (table: string, id: unknown) => db.tables[table]?.find(r => r.id === id && r.organization_id === args.p_org);
  if (name === 'app_branch_access') return { data: true, error: null };
  if (name === 'fn_moneda_base_organizacion') return { data: 'COP', error: null };
  if (name === 'fn_crm_insertar_cliente_preparado') {
    if (db.errors['customers:insert']) return { data: null, error: db.errors['customers:insert'] };
    db.seq++;
    const p = args.p_data as Row, customer = { id: `customers-${db.seq}`, organization_id: args.p_org, ...p, full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') };
    db.tables.customers.push(customer);
    db.writes.push({ table: 'customers', op: 'insert', payload: { organization_id: args.p_org, ...p }, filters: [] });
    return { data: customer, error: null };
  }
  if (name === 'fn_crm_referido_base') {
    const referral = own('referrals', args.p_referral);
    if (!referral) return fail('P0002', 'referido_no_encontrado');
    const customer = args.p_customer ? own('customers', args.p_customer) : null;
    if (args.p_customer && !customer) return fail('P0002', 'cliente_no_encontrado');
    return { data: { referral: { ...referral }, customer: customer ? { ...customer } : null, profiles: [] }, error: null };
  }
  if (name === 'fn_crm_convertir_referido') {
    const referral = own('referrals', args.p_referral), expected = args.p_expected as { referral: Row };
    if (!referral || JSON.stringify(referral) !== JSON.stringify(expected.referral) || db.updateAffectsNone === true || Array.isArray(db.updateAffectsNone) && db.updateAffectsNone.includes('referrals')) return fail('40001', 'referido_contexto_modificado');
    if (db.errors['referrals:update']) return { data: null, error: db.errors['referrals:update'] };
    if (db.errors['customers:insert'] || db.errors['customers:update']) return { data: null, error: db.errors['customers:insert'] ?? db.errors['customers:update'] };
    const filters = [{ kind: 'eq' as const, key: 'organization_id', value: args.p_org }];
    let customer = args.p_customer ? own('customers', args.p_customer) : null;
    let created: string | null = null;
    if (!customer) {
      db.seq++; created = `customers-${db.seq}`;
      const p = args.p_new_customer as Row;
      customer = { id: created, organization_id: args.p_org, ...p, full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') };
      db.tables.customers.push(customer);
      db.writes.push({ table: 'customers', op: 'insert', payload: { organization_id: args.p_org, ...p }, filters });
    }
    Object.assign(customer, args.p_changes);
    db.writes.push({ table: 'customers', op: 'update', payload: args.p_changes, filters });
    Object.assign(referral, { status: 'converted', referred_customer_id: customer.id });
    db.writes.push({ table: 'referrals', op: 'update', payload: { status: 'converted', referred_customer_id: customer.id }, filters: [...filters, { kind: 'eq', key: 'status', value: 'qualified' }] });
    return { data: { referral: { ...referral }, customer: { ...customer }, created_customer_id: created }, error: null };
  }
  if (name === 'fn_crm_partner_deal_base') {
    const partner = own('partners', args.p_partner), opportunity = own('opportunities', args.p_opportunity);
    if (!partner || !opportunity) return fail('P0002', 'registro_no_encontrado');
    return { data: { partner: { ...partner }, opportunity: { ...opportunity }, tiers: (db.tables.partner_tiers ?? []).filter(r => r.organization_id === args.p_org).map(r => ({ ...r })),
      deals: (db.tables.partner_deals ?? []).filter(d => d.organization_id === args.p_org && d.partner_id === args.p_partner && d.commission_status !== 'rejected').map(d => ({ ...d, opportunity: own('opportunities', d.opportunity_id) })),
      base_currency: 'COP', timezone: 'America/Bogota', calendar: null, rates: db.tables.exchange_rates ?? [] }, error: null };
  }
  if (name === 'fn_crm_registrar_partner_deal') {
    if (db.errors['partner_deals:insert'] || db.errors['partners:update']) return { data: null, error: db.errors['partner_deals:insert'] ?? db.errors['partners:update'] };
    db.seq++;
    const deal = { id: `partner_deals-${db.seq}`, organization_id: args.p_org, partner_id: args.p_partner, opportunity_id: args.p_opportunity, deal_type: args.p_type, commission_amount: args.p_commission, commission_status: 'pending' };
    db.tables.partner_deals.push(deal);
    db.writes.push({ table: 'partner_deals', op: 'insert', payload: deal, filters: [] });
    if (args.p_tier) {
      Object.assign(own('partners', args.p_partner)!, { tier_id: args.p_tier });
      db.writes.push({ table: 'partners', op: 'update', payload: { tier_id: args.p_tier }, filters: [{ kind: 'eq', key: 'organization_id', value: args.p_org }] });
    }
    return { data: { deal }, error: null };
  }
  return { data: null, error: null };
}
