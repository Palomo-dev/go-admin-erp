/// <reference types="jest" />
/**
 * Tasas de comisión por vendedor (2026-09-28). El panel y commissionService
 * usaban `valid_until`, `updated_at` y `salesperson_name`, que no existen en
 * `vendor_commission_rates`: todo fallaba y `getVendorRate` devolvía 0. La
 * tabla tenía 0 filas. Ahora: columnas reales, nombre por `profiles`, escritura
 * por RPC con rol de gestión (probada en transacción deshecha: general 3 %,
 * vendedor 8 % actualiza su fila, 150 % → tasa_invalida, vendedor ajeno →
 * vendedor_invalido, otra organización → acceso denegado, rol 4 → sin_permiso).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { listCommissionRates, mapCommissionRateRpcError, parseSaveCommissionRate } from '../commissionRatesServer';
import { CommissionTransitionError } from '../commissionTransitions';
import { createFakeSupabase, type FakeDb } from './f13FakeSupabase';

const U1 = '11111111-1111-4111-8111-111111111111';

describe('parseSaveCommissionRate', () => {
  it('acepta general (sin vendedor) y vendedor con vigencia', () => {
    expect(parseSaveCommissionRate({ rate: 3 })).toEqual({ id: null, salesperson_id: null, rate: 3, valid_from: null, valid_to: null });
    expect(parseSaveCommissionRate({ rate: '7.5', salesperson_id: U1, valid_from: '2026-10-01', valid_to: '' })).toMatchObject({ salesperson_id: U1, rate: 7.5, valid_from: '2026-10-01', valid_to: null });
  });
  it.each([{ rate: 101 }, { rate: -1 }, { rate: 'x' }, {}, { rate: 5, salesperson_id: 'no-uuid' }, { rate: 5, valid_to: '28/09/2026' }])('rechaza %j con 400', (body) => {
    expect(() => parseSaveCommissionRate(body as Record<string, unknown>)).toThrow(CommissionTransitionError);
  });
});

describe('mapCommissionRateRpcError', () => {
  it('traduce los errores de la RPC a 400/403/404 y deja pasar el resto', () => {
    const code = (e: { code: string; message: string }) => {
      try {
        mapCommissionRateRpcError(e);
      } catch (err) {
        return err instanceof CommissionTransitionError ? err.statusCode : 'propagado';
      }
      return 'sin lanzar';
    };
    expect(code({ code: '22023', message: 'vendedor_invalido' })).toBe(400);
    expect(code({ code: '42501', message: 'sin_permiso' })).toBe(403);
    expect(code({ code: 'P0002', message: 'tasa_no_encontrada' })).toBe(404);
    expect(code({ code: 'XX000', message: 'boom' })).toBe('propagado');
  });
});

describe('listCommissionRates', () => {
  it('lee columnas reales, separa general de vendedores y resuelve el nombre por profiles', async () => {
    const db: FakeDb = {
      writes: [],
      rows: {
        vendor_commission_rates: [
          { id: 'r-g', organization_id: 120, salesperson_id: null, rate: '3.00', valid_from: '2026-09-01', valid_to: null, created_at: '2026-09-01T00:00:00Z' },
          { id: 'r-1', organization_id: 120, salesperson_id: U1, rate: '8.00', valid_from: '2026-09-01', valid_to: null, created_at: '2026-09-02T00:00:00Z' },
          { id: 'r-x', organization_id: 121, salesperson_id: U1, rate: '50.00', valid_from: '2026-09-01', valid_to: null, created_at: '2026-09-02T00:00:00Z' },
        ],
        profiles: [{ id: U1, first_name: 'Ana', last_name: 'V', email: 'a@x' }],
      },
    };
    const out = await listCommissionRates(120, createFakeSupabase(db) as never);
    expect(out.general).toMatchObject({ id: 'r-g', rate: 3, salesperson_name: null });
    expect(out.vendors).toEqual([expect.objectContaining({ id: 'r-1', rate: 8, salesperson_name: 'Ana V' })]);
  });
});

describe('código: sin columnas inexistentes', () => {
  it.each(['src/lib/services/crm/commissionService.ts', 'src/lib/services/crm/commissionRatesServer.ts', 'src/components/configuracion/panels/crm/sections/CommissionsPanel.tsx'])(
    '%s no lee ni escribe valid_until / updated_at en vendor_commission_rates',
    (file) => {
      const code = readFileSync(join(process.cwd(), file), 'utf8')
        .split('\n')
        .filter((l) => !/^\s*(\*|\/\/)/.test(l))
        .join('\n');
      expect(code).not.toMatch(/valid_until/);
      expect(code).not.toMatch(/from\('vendor_commission_rates'\)[\s\S]{0,200}updated_at/);
      // El navegador ya no escribe la tabla.
      expect(code).not.toMatch(/from\('vendor_commission_rates'\)\s*\.(insert|update|delete|upsert)/);
    }
  );

  it('la migración deja a authenticated solo con SELECT y a anon sin nada', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260928180000_tasas_comision_por_rpc.sql'), 'utf8');
    expect(sql).toMatch(/revoke all on table public\.vendor_commission_rates from anon;/);
    expect(sql).toMatch(/revoke insert, update, delete, truncate, references, trigger on table public\.vendor_commission_rates from authenticated;/);
    expect(sql).toMatch(/fn_tasa_comision_exigir_gestion\(p_org\)/);
  });
});
