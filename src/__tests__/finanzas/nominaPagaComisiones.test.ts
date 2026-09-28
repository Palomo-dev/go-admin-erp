/// <reference types="jest" />
/**
 * Nómina paga comisiones (2026-09-28). Primero se corrigió que
 * `updateSlipStatus('paid')` reemplazaba TODO el metadata de la comisión por
 * `{ payroll_slip_id }` y actualizaba sin filtro de organización. Después
 * (20260928213000) la tabla `commissions` dejó de admitir escritura desde el
 * navegador: el pago lo hace la RPC `fn_comisiones_pagar_por_nomina`, que
 * fusiona el metadata, exige la colilla pagada, gestión o hr.payroll.process /
 * finance.approve, y solo toca las devengadas del empleado de la colilla en su
 * organización. Probada por MCP en un DO … RAISE que se deshace (organización
 * 2): 1 comisión pagada, metadata con payroll_slip_id y paid_by, 0 asientos de
 * pago (los asienta la nómina).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f13FakeSupabase';

let db: FakeDb;
let rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let rpcError: { code: string; message: string } | null = null;
const tablasLeidas: string[] = [];
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: (t: string) => { tablasLeidas.push(t); return createFakeSupabase(db).from(t); },
    rpc: async (fn: string, args: Record<string, unknown>) => { rpcCalls.push({ fn, args }); return { data: rpcError ? null : 1, error: rpcError }; },
  },
}));
jest.mock('@/lib/services/timezoneResolver', () => ({ resolveTimezone: async () => 'America/Bogota' }));

import PayrollService from '@/lib/services/payrollService';

beforeEach(() => {
  rpcCalls = [];
  rpcError = null;
  tablasLeidas.length = 0;
  db = {
    writes: [],
    rows: {
      payroll_slips: [
        { id: 'slip-1', status: 'approved', metadata: { commission_ids: ['c-1', 'c-2'] } },
        { id: 'slip-2', status: 'approved', metadata: {} },
      ],
      commissions: [{ id: 'c-1', organization_id: 120, status: 'accrued', metadata: { sale_id: 's-1' } }],
    },
  };
});

async function pagar(slip: string, status = 'paid') {
  const svc = new PayrollService(120);
  jest.spyOn(svc, 'getSlipById').mockResolvedValue(null);
  await svc.updateSlipStatus(slip, status);
}

describe('updateSlipStatus: las comisiones las paga la RPC, no el navegador', () => {
  it('colilla pagada con comisiones → una llamada a fn_comisiones_pagar_por_nomina con la colilla; nada contra commissions', async () => {
    await pagar('slip-1');
    expect(rpcCalls).toEqual([{ fn: 'fn_comisiones_pagar_por_nomina', args: { p_slip_id: 'slip-1' } }]);
    expect(tablasLeidas).not.toContain('commissions');
    expect(db.writes.filter((w) => w.table === 'commissions')).toHaveLength(0);
  });

  it('sin comisiones en la colilla, o sin pagarla, no llama a la RPC', async () => {
    await pagar('slip-2');
    await pagar('slip-1', 'approved');
    expect(rpcCalls).toHaveLength(0);
  });

  it('si la base rechaza (p. ej. sin permiso) el error se propaga', async () => {
    rpcError = { code: '42501', message: 'sin_permiso' };
    await expect(pagar('slip-1')).rejects.toMatchObject({ code: '42501' });
  });
});

describe('fn_comisiones_pagar_por_nomina (forma del .sql aplicado)', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260928213000_comisiones_escritura_solo_servidor.sql'), 'utf8')
    .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  const fn = sql.slice(sql.indexOf('function public.fn_comisiones_pagar_por_nomina'));

  it('colilla pagada, permiso y solo las devengadas del empleado de la colilla en su organización', () => {
    expect(fn).toMatch(/raise exception 'colilla_no_pagada'/);
    expect(fn).toMatch(/perform public\.fn_finanzas_exigir_permiso\(v_org, array\['hr\.payroll\.process', 'finance\.approve'\]\)/);
    expect(fn).toMatch(/where c\.organization_id = v_org\s+and c\.status = 'accrued'\s+and c\.payee_id = v_empleado/);
  });

  it('fusiona el metadata con payroll_slip_id (no lo reemplaza)', () => {
    expect(fn).toMatch(/metadata = coalesce\(c\.metadata, '\{\}'::jsonb\) \|\| jsonb_build_object\('payroll_slip_id', p_slip_id\)/);
  });
});
