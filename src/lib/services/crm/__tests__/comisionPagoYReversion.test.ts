/// <reference types="jest" />
/**
 * Pago de comisiones con cuenta de dinero y quién pagó; contra-asiento al
 * cancelar (2026-09-28). La parte contable vive en la BD
 * (`fn_auto_journal_commission`, probada con DO … RAISE en transacción que se
 * deshace: pago en efectivo → 2370 D / 1105 C; clawback → dos contra-asientos,
 * idempotente); aquí se fija lo que el servidor escribe y la forma del `.sql`.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildTransitionPatch, normalizeCommissionPayment } from '../commissionTransitions';
import { bulkPayCommissions, payCommission } from '../commissionAdminService';
import { createFakeSupabase, type FakeDb } from './f13FakeSupabase';
import { cuentaPagoABody } from '@/components/finanzas/comisiones/comisionesModel';

const NOW = '2026-09-28T15:00:00.000Z';
const accrued = { status: 'accrued', paid_at: null, metadata: { sale_id: 's-1', commission_method: 'fixed_amount' }, notes: null };

describe('pay: metadata fusionada con quién pagó y de dónde salió', () => {
  it('conserva sale_id y commission_method y agrega paid_by, método, cuenta y referencia', () => {
    const patch = buildTransitionPatch('pay', accrued, {
      now: NOW,
      actorId: 'u-admin',
      payment: { method: 'transfer', bankAccountId: 7, reference: 'TRX-1' },
    });
    expect(patch).toEqual({
      status: 'paid',
      paid_at: NOW,
      updated_at: NOW,
      metadata: { sale_id: 's-1', commission_method: 'fixed_amount', paid_by: 'u-admin', payment_method: 'transfer', bank_account_id: 7, payment_reference: 'TRX-1' },
    });
  });

  it('sin actor ni cuenta no toca metadata (compatibilidad)', () => {
    expect(buildTransitionPatch('pay', accrued, { now: NOW })).toEqual({ status: 'paid', paid_at: NOW, updated_at: NOW });
  });

  it('normalizeCommissionPayment descarta basura del cliente', () => {
    expect(normalizeCommissionPayment({ payment_method: '  cash ', bank_account_id: '12', reference: ' x ' })).toEqual({ method: 'cash', bankAccountId: 12, reference: 'x' });
    expect(normalizeCommissionPayment({ bank_account_id: -3 })).toEqual({ method: null, bankAccountId: null, reference: null });
    expect(normalizeCommissionPayment({ bank_account_id: '1.5' }).bankAccountId).toBeNull();
    expect(normalizeCommissionPayment({ payment_method: 'x'.repeat(99) }).method).toHaveLength(40);
  });

  it('cuentaPagoABody traduce la elección de la UI', () => {
    expect(cuentaPagoABody('rule')).toEqual({});
    expect(cuentaPagoABody('cash')).toEqual({ payment_method: 'cash' });
    expect(cuentaPagoABody('bank:9')).toEqual({ payment_method: 'transfer', bank_account_id: 9 });
  });
});

describe('pay: la cuenta bancaria debe ser de la organización', () => {
  let db: FakeDb;
  beforeEach(() => {
    db = {
      writes: [],
      rows: {
        commissions: [
          { id: 'c-1', organization_id: 120, status: 'accrued', paid_at: null, metadata: null, notes: null },
          { id: 'c-2', organization_id: 120, status: 'accrued', paid_at: null, metadata: null, notes: null },
        ],
        bank_accounts: [
          { id: 7, organization_id: 120, is_active: true },
          { id: 8, organization_id: 121, is_active: true },
          { id: 9, organization_id: 120, is_active: false },
        ],
      },
    };
  });
  const supa = () => createFakeSupabase(db) as unknown as import('@supabase/supabase-js').SupabaseClient;

  it('cuenta propia y activa → paga y guarda la cuenta', async () => {
    const row = await payCommission('c-1', 120, supa(), 'u-admin', { method: 'transfer', bankAccountId: 7 });
    expect(row?.status).toBe('paid');
    expect(row?.metadata).toMatchObject({ paid_by: 'u-admin', bank_account_id: 7 });
  });

  it.each([8, 9])('cuenta %i (ajena o inactiva) → 400 sin escribir', async (id) => {
    await expect(payCommission('c-1', 120, supa(), 'u-admin', { bankAccountId: id })).rejects.toMatchObject({ statusCode: 400, code: 'BANK_ACCOUNT_INVALID' });
    expect(db.writes.filter((w) => w.op === 'update')).toHaveLength(0);
  });

  it('lote con cuenta ajena → 400 antes de pagar ninguna', async () => {
    await expect(bulkPayCommissions(['c-1', 'c-2'], 120, supa(), 'u-admin', { bankAccountId: 8 })).rejects.toMatchObject({ statusCode: 400 });
    expect(db.writes.filter((w) => w.op === 'update')).toHaveLength(0);
  });
});

describe('migración: contra-asiento al cancelar y cuenta de dinero del pago', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260928171000_comisiones_contra_asiento_y_pago_con_cuenta.sql'), 'utf8');
  const code = sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

  it('cancelar desde accrued o paid revierte con fn_revertir_asiento_en_fecha, nunca borra', () => {
    expect(code).toMatch(/NEW\.status = 'cancelled'\s+AND OLD\.status IN \('accrued', 'paid'\)/);
    expect(code).toMatch(/fn_revertir_asiento_en_fecha\(/);
    expect(code).toMatch(/NEW\.id::text \|\| ':accrued', NEW\.id::text \|\| ':paid'/);
    expect(code).not.toMatch(/delete\s+from\s+(public\.)?journal_/i);
  });

  it('el pago usa la cuenta elegida (fn_money_account_code_pago) con la regla de respaldo', () => {
    expect(code).toMatch(/fn_money_account_code_pago\(/);
    expect(code).toMatch(/p_credit_account := v_credit/);
  });

  it('estampa quién pagó / canceló desde la sesión', () => {
    expect(code).toMatch(/jsonb_build_object\('paid_by', v_uid\)/);
    expect(code).toMatch(/jsonb_build_object\('cancelled_by', v_uid\)/);
  });
});
