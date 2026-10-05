import type { FakeDb, Row } from './f11FakeSupabase';

/** Doble de la frontera RPC. Las garantías SQL se verifican además en BEGIN/ROLLBACK real. */
export function healthRpcDouble(db: FakeDb, fn: string, args: Record<string, unknown>): unknown {
  const org = args.p_org;
  if (fn === 'fn_crm_salud_base') {
    for (const table of ['customers', 'health_score_snapshots']) {
      if (db.nextReadError?.table === table) { const e = db.nextReadError.error; db.nextReadError = undefined; throw new Error(e.message); }
    }
    return (args.p_customers as string[]).map(id => {
      if (!db.rows.customers?.some(c => c.id === id && c.organization_id === org && c.lifecycle_stage === 'customer')) throw new Error('cliente_no_encontrado');
      const last = lastSnapshot(db, org, id);
      return { customer_id: id, last_snapshot: last ? { id: last.id, score: last.score, created_at: last.created_at } : null };
    });
  }
  if (fn === 'fn_crm_encolar_salud') {
    const id = `health-event-${db.nextId++}`;
    (db.rows.crm_events ??= []).push({ id, organization_id: org, event_type: 'health.recalculate_requested', entity_type: 'health_config', payload: { config_stamp: db.rows.health_score_configs?.find(c => c.organization_id === org)?.updated_at ?? null } });
    (db.rows.outbound_jobs ??= []).push({ id: `job-${id}`, organization_id: org, kind: 'crm_event', dedupe_key: `crm_event:${id}` });
    return { queued: true, event_id: id, job_id: `job-${id}` };
  }
  if (fn !== 'fn_crm_guardar_mediciones_salud') throw new Error(`rpc ${fn} no definida en el doble`);
  const backup = JSON.parse(JSON.stringify(db.rows)) as FakeDb['rows'];
  const before = db.writes.length;
  let snapshots = 0; let customers = 0; let skipped = 0;
  try {
    const cfg = db.rows.health_score_configs?.find(c => c.organization_id === org);
    if ((cfg?.updated_at ?? null) !== args.p_config_stamp) throw new Error('salud_config_modificada');
    if (cfg?.is_active === false) throw new Error('salud_inactiva');
    const snapshotRows: Row[] = [];
    for (const r of args.p_rows as Row[]) {
      const c = db.rows.customers?.find(c => c.id === r.customer_id && c.organization_id === org && c.lifecycle_stage === 'customer');
      if (!c) throw new Error('cliente_no_encontrado');
      const last = lastSnapshot(db, org, r.customer_id);
      const repeated = last !== null && last.created_at === args.p_now && last.score === r.score && last.band === r.band && JSON.stringify(last.indicators) === JSON.stringify(r.indicators);
      if (Number.isFinite(Date.parse(String(c.health_score_updated_at))) && Date.parse(String(c.health_score_updated_at)) > Date.parse(String(args.p_now))) throw new Error('salud_medicion_modificada');
      if ((last?.id ?? null) !== r.expected_snapshot_id && !repeated) throw new Error('salud_medicion_modificada');
      if (r.write_snapshot && !repeated) {
        const snapshot = { id: `health-snapshot-${db.nextId++}`, organization_id: org, customer_id: r.customer_id, score: r.score, band: r.band, indicators: r.indicators, created_at: args.p_now };
        (db.rows.health_score_snapshots ??= []).push(snapshot); snapshotRows.push(snapshot); snapshots++;
      } else skipped++;
      if (c.health_score !== r.score) {
        const change = { health_score: r.score, health_score_updated_at: args.p_now };
        Object.assign(c, change); customers++;
        db.writes.push({ table: 'customers', op: 'update', rows: [change], filters: { organization_id: org, id: c.id } });
      }
    }
    if (snapshotRows.length) db.writes.push({ table: 'health_score_snapshots', op: 'insert', rows: snapshotRows, filters: {} });
    if (db.nextWriteError && ['customers','health_score_snapshots'].includes(db.nextWriteError.table)) { const e = db.nextWriteError.error; db.nextWriteError = undefined; throw new Error(e.message); }
    return { snapshots_written: snapshots, customers_updated: customers, skipped_unchanged: skipped };
  } catch (e) { db.rows = backup; db.writes.splice(before); throw e; }
}
function lastSnapshot(db: FakeDb, org: unknown, id: unknown): Row | null {
  return [...(db.rows.health_score_snapshots ?? [])].filter(s => s.organization_id === org && s.customer_id === id)
    .sort((a,b) => Date.parse(String(b.created_at)) - Date.parse(String(a.created_at)) || String(b.id).localeCompare(String(a.id)))[0] ?? null;
}
