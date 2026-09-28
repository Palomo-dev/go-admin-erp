/// <reference types="jest" />
/**
 * Pendiente 3 (docs/hallazgos/comisiones-e-impuestos-2026-09-28.md):
 * `crm/paymentService.ts` devengaba la comisión de oportunidad sobre el total
 * CON impuestos, siempre por porcentaje y sin mirar la comisión de la factura
 * (dos comisiones por la misma venta). Ahora la única escritura es la RPC
 * `fn_comision_oportunidad_devengar` (20260928212000), también para el cierre
 * «ganada» (`commissionService.accrueCommission`), y el disparador de «ganada»
 * tampoco duplica la comisión de la factura.
 *
 * La RPC se probó por MCP en un DO … RAISE que se deshace (organización 125):
 * ganada con factura que ya devengó → 0 comisiones de oportunidad y
 * 'factura_ya_devengo'; sin esa factura → 25 % de 1.600.000 = 400.000 y la
 * segunda llamada 'ya_devengada'; anon y un usuario ajeno → 42501; factura
 * pagada con monto fijo 5.000 → 5.000 (no 5.000 %) sobre base 1.600.000
 * (subtotal). Aquí: el contrato del servicio sobre el doble en memoria (que
 * imita la RPC) y la forma del `.sql`. Organización 120 inventada.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createFakeSupabase, type FakeDb } from './f10FakeSupabase';

let db: FakeDb;
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: (t: string) => createFakeSupabase(db).from(t),
    rpc: (fn: string, args: Record<string, unknown>) => createFakeSupabase(db).rpc(fn, args),
  },
}));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120, obtenerOrganizacionActiva: () => ({ id: 120 }) }));

import { registerCrmPayment } from '../paymentService';
import { commissionService } from '../commissionService';
import { executeCommission } from '../wonCloseSteps';

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      invoice_sales: [
        {
          id: 'inv-1', organization_id: 120, number: 'F-1', subtotal: 1000000, total: 1190000, balance: 1190000, status: 'issued', currency: 'COP',
          customer_id: 'c-1', opportunity_id: 'op-1', sale_id: null, salesperson_id: 'u-1', commission_rate: 10, commission_type: 'salesperson', commission_method: 'percentage', commission_amount: 0,
        },
      ],
      payments: [],
      accounts_receivable: [],
      commissions: [],
      opportunities: [{ id: 'op-1', organization_id: 120, name: 'Op', status: 'won', salesperson_id: 'u-1', commission_rate: 10, amount: 1000000, currency: 'COP' }],
    },
  };
}
const client = () => createFakeSupabase(db) as never;
const pagar = (reference: string) => registerCrmPayment(120, { invoice_id: 'inv-1', amount: 1190000, currency: 'COP', method: 'cash', reference }, client());
const inserts = () => db.writes.filter((w) => w.table === 'commissions' && w.op === 'insert');

beforeEach(() => {
  db = seed();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('pago de la factura: base sin impuestos, método de la factura, una sola fuente', () => {
  it('porcentaje sobre el SUBTOTAL: 10 % de 1.000.000 = 100.000 (antes 119.000 sobre el total)', async () => {
    const r = await pagar('p-1');
    expect(r).toMatchObject({ success: true, invoice_status: 'paid', commission_created: true });
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0].row).toMatchObject({ source_type: 'opportunity', source_id: 'op-1', base_amount: 1000000, commission_amount: 100000, commission_type: 'salesperson' });
  });

  it('monto fijo: 5.000 es 5.000, no 5.000 %', async () => {
    Object.assign(db.rows.invoice_sales[0], { commission_method: 'fixed_amount', commission_amount: 5000, commission_rate: 5000 });
    await pagar('p-2');
    expect(inserts()[0].row).toMatchObject({ commission_amount: 5000, metadata: expect.objectContaining({ commission_method: 'fixed_amount' }) });
  });

  it("commission_type 'none' en la factura: no se devenga (antes se insertaba con tipo 'none')", async () => {
    Object.assign(db.rows.invoice_sales[0], { commission_type: 'none' });
    const r = await pagar('p-3');
    expect(r.commission_created).toBe(false);
    expect(inserts()).toHaveLength(0);
  });

  it('la factura ya devengó su comisión (invoice_sale): no hay segunda comisión por la misma venta', async () => {
    db.rows.commissions.push({ id: 'cm-fact', organization_id: 120, source_type: 'invoice_sale', source_id: 'inv-1', status: 'accrued', commission_amount: 100000 });
    const r = await pagar('p-4');
    expect(r).toMatchObject({ success: true, invoice_status: 'paid', commission_created: false });
    expect(inserts()).toHaveLength(0);
  });

  it('una comisión de la factura de OTRA organización no bloquea (todo acotado a la organización)', async () => {
    db.rows.commissions.push({ id: 'cm-ajena', organization_id: 121, source_type: 'invoice_sale', source_id: 'inv-1', status: 'accrued', commission_amount: 1 });
    const r = await pagar('p-5');
    expect(r.commission_created).toBe(true);
  });

  it('Node no lee ni escribe commissions: solo llama a la RPC con organización, oportunidad, factura y pago', async () => {
    const r = await pagar('p-6');
    const llamada = (db.rpcCalls ?? []).find((c) => c.fn === 'fn_comision_oportunidad_devengar');
    expect(llamada?.args).toEqual({ p_org: 120, p_opportunity_id: 'op-1', p_invoice_id: 'inv-1', p_payment_id: r.payment_id });
  });
});

describe('cierre «ganada»: la misma RPC, sin datos del navegador', () => {
  it('devenga con la tasa y el monto de la base (10 % de 1.000.000)', async () => {
    const r = await commissionService.accrueCommission('op-1');
    expect(r).toMatchObject({ commission_rate: 10, commission_amount: 100000, status: 'accrued' });
    expect(r?.already_accrued).toBeFalsy();
  });

  it('si la factura de la oportunidad ya devengó, no duplica y el paso lo dice', async () => {
    db.rows.commissions.push({ id: 'cm-fact', organization_id: 120, source_type: 'invoice_sale', source_id: 'inv-1', status: 'accrued', base_amount: 1000000, commission_rate: 10, commission_amount: 100000 });
    const r = await commissionService.accrueCommission('op-1');
    expect(r).toMatchObject({ id: 'cm-fact', already_accrued: true, existing_source_type: 'invoice_sale' });
    expect(inserts()).toHaveLength(0);
    const msg = await executeCommission(
      { id: 'op-1', salesperson_id: 'u-1', amount: 1000000 } as never,
      { accrueCommission: async () => r } as never,
    );
    expect(msg).toMatch(/ya devengada por la factura/);
  });

  it('un error de la base se propaga (no se inventa un devengo)', async () => {
    db.rows.opportunities = [];
    await expect(commissionService.accrueCommission('op-1')).rejects.toMatchObject({ message: 'oportunidad_no_encontrada' });
  });
});

describe('forma de la migración y del código', () => {
  const leer = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
  const sql = leer('supabase/migrations/20260928212000_comision_oportunidad_una_sola_fuente.sql')
    .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

  it('RPC: pertenencia, bloqueo de la oportunidad, subtotal, método y una sola fuente', () => {
    expect(sql).toMatch(/perform public\.fn_assert_acceso_org\(p_org\)/);
    expect(sql).toMatch(/where id = p_opportunity_id and organization_id = p_org\s+for update/);
    expect(sql).toMatch(/v_base := coalesce\(v_inv\.subtotal, v_inv\.total, 0\)/);
    expect(sql).toMatch(/when v_metodo = 'fixed_amount' then coalesce\(nullif\(v_inv\.commission_amount, 0\), v_tasa\)/);
    expect(sql).toMatch(/'factura_ya_devengo'/);
    expect(sql).toMatch(/public\.fn_tasa_comision_vigente\(p_org, v_vendedor, true\)/);
    expect(sql).toMatch(/revoke all on function public\.fn_comision_oportunidad_devengar\(integer, uuid, uuid, uuid\) from public, anon/);
  });

  it('el disparador de «ganada» tampoco duplica la comisión de la factura', () => {
    const trig = sql.slice(sql.indexOf('fn_create_commission_on_opportunity_won()'));
    expect(trig).toMatch(/i\.opportunity_id = NEW\.id\s+AND \(\(c\.source_type = 'invoice_sale' AND c\.source_id = i\.id::text\)/);
  });

  it('ni paymentService ni commissionService tocan commissions directamente', () => {
    for (const p of ['src/lib/services/crm/paymentService.ts', 'src/lib/services/crm/commissionService.ts']) {
      expect(leer(p)).not.toMatch(/\.from\(['"]commissions['"]\)/);
      expect(leer(p)).toMatch(/\.rpc\('fn_comision_oportunidad_devengar'/);
    }
  });
});
