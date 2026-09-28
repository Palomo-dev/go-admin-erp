/**
 * Propinas y cargos de servicio (migración 20260925110000): tipos alineados con
 * los CHECK de la base, alias 'fixed' → 'fixed_amount', null explícito al
 * editar, filtro de organización en cada escritura y lectura por id, permisos
 * resueltos en la base y anulación con reverso contable en vez de borrado.
 */
type Llamada = { metodo: string; args: unknown[] };

let resultado: { data: unknown; error: unknown } = { data: null, error: null };
const llamadas: Llamada[] = [];

function constructor(): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'in', 'or', 'order', 'gte', 'lte', 'limit', 'single', 'maybeSingle', 'ilike']) {
    b[m] = (...args: unknown[]) => { llamadas.push({ metodo: m, args }); return b; };
  }
  b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, ko);
  return b;
}

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: jest.fn((tabla: string) => { llamadas.push({ metodo: 'from', args: [tabla] }); return constructor(); }),
    rpc: jest.fn(),
  },
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({
  getOrganizationTimezone: jest.fn(async () => 'America/Bogota'),
}));

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from '@/lib/supabase/config';
import { PropinasService } from '@/components/pos/propinas/propinasService';
import {
  calcularKpis,
  codigoErrorPropina,
  esTipoPropina,
  rangoDeFiltros,
  resumirPorMesero,
} from '@/components/pos/propinas/propinasLogica';
import { TIP_TYPES, TIP_TYPES_FORMULARIO, type Tip } from '@/components/pos/propinas/types';
import { CargosServicioService } from '@/components/pos/cargos-servicio/cargosServicioService';
import {
  cambiosParaActualizar,
  codigoErrorCargo,
  filaParaInsertar,
  filtroSucursalConGlobales,
  normalizarTipoCargo,
  parsearCsvCargos,
} from '@/components/pos/cargos-servicio/cargosLogica';
import { CHARGE_TYPES, CHARGE_TYPE_LABELS } from '@/components/pos/cargos-servicio/types';
import { ConfiguracionService } from '@/components/pos/configuracion/configuracionService';

const rpc = supabase.rpc as unknown as jest.Mock;
const MIGRACION = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260925110000_pos_propinas_cargos_tipos_permisos_anulacion.sql'),
  'utf8',
);
const ROLLBACK = fs.readFileSync(
  path.join(process.cwd(), 'supabase/rollbacks/20260925110000_pos_propinas_cargos_tipos_permisos_anulacion_rollback.sql'),
  'utf8',
);

function propina(p: Partial<Tip> = {}): Tip {
  return {
    id: 't1', organization_id: 120, branch_id: 7, server_id: 'u1', amount: 1000, tip_type: 'cash',
    is_distributed: false, created_at: '2026-09-23T15:00:00Z',
    server: { id: 'u1', email: 'a@b.co', first_name: 'Ana', last_name: 'Ruiz' },
    ...p,
  };
}

function eqs() {
  return llamadas.filter((l) => l.metodo === 'eq').map((l) => l.args);
}

beforeEach(() => {
  llamadas.length = 0;
  resultado = { data: null, error: null };
  rpc.mockReset();
});

describe('Tipos de propina = CHECK de la base', () => {
  it('los seis tipos del CHECK, y el formulario ofrece cuatro', () => {
    expect([...TIP_TYPES].sort()).toEqual(['card', 'cash', 'online', 'pooled', 'split', 'transfer']);
    expect(TIP_TYPES_FORMULARIO).toEqual(['cash', 'card', 'transfer', 'online']);
    const check = /check \(tip_type = any \(array\[([^\]]+)\]\)\)/.exec(MIGRACION)?.[1] ?? '';
    const enBase = check.split(',').map((s) => s.trim().replace(/'/g, '')).sort();
    expect(enBase).toEqual([...TIP_TYPES].sort());
    expect(esTipoPropina('transfer')).toBe(true);
    expect(esTipoPropina('fixed')).toBe(false);
  });

  it('el resumen por mesero y los KPI suman los seis tipos y excluyen las anuladas', () => {
    const tips = TIP_TYPES.map((tipo, i) => propina({ id: `t${i}`, tip_type: tipo, amount: 100 * (i + 1), is_distributed: i === 0 }));
    tips.push(propina({ id: 'anulada', amount: 99999, voided_at: '2026-09-23T16:00:00Z' }));

    const [fila] = resumirPorMesero(tips);
    expect(fila.server_name).toBe('Ana Ruiz');
    expect(fila.tips_count).toBe(6);
    expect(fila.total_tips).toBe(2100);
    expect([fila.cash_tips, fila.card_tips, fila.transfer_tips, fila.online_tips, fila.split_tips, fila.pooled_tips])
      .toEqual([100, 200, 300, 400, 500, 600]);
    expect(fila.distributed_amount).toBe(100);
    expect(fila.pending_amount).toBe(2000);

    const kpi = calcularKpis(tips);
    expect(kpi).toMatchObject({ total: 2100, distributed: 100, pending: 2000, count: 6 });
    expect(kpi.byType.pooled).toBe(600);
  });
});

describe('Fechas en la zona de la organización', () => {
  it('el filtro «desde/hasta» cubre el día de Bogotá, no el día UTC', () => {
    expect(rangoDeFiltros({ dateFrom: '2026-09-23', dateTo: '2026-09-23' }, 'America/Bogota')).toEqual({
      desde: '2026-09-23T00:00:00.000-05:00',
      hasta: '2026-09-23T23:59:59.999-05:00',
    });
    expect(rangoDeFiltros({}, 'America/Bogota')).toEqual({});
  });

  it('getAll pide el rango con offset y solo propinas sin anular de la organización', async () => {
    resultado = { data: [], error: null };
    await PropinasService.getAll({ dateFrom: '2026-09-01', dateTo: '2026-09-23' }, null);
    expect(eqs()).toContainEqual(['organization_id', 120]);
    expect(llamadas).toContainEqual({ metodo: 'is', args: ['voided_at', null] });
    expect(llamadas).toContainEqual({ metodo: 'gte', args: ['created_at', '2026-09-01T00:00:00.000-05:00'] });
    expect(llamadas).toContainEqual({ metodo: 'lte', args: ['created_at', '2026-09-23T23:59:59.999-05:00'] });
  });

  it('el servicio ya no deriva el día con toISOString().split', () => {
    const fuente = fs.readFileSync(path.join(process.cwd(), 'src/components/pos/propinas/propinasService.ts'), 'utf8');
    expect(fuente).not.toMatch(/toISOString\(\)\.split/);
    expect(fuente).not.toMatch(/T23:59:59'/);
  });
});

describe('Propinas: organización, permisos y anulación', () => {
  it('editar filtra por organización y trata 0 filas (RLS) como falta de permiso', async () => {
    resultado = { data: [], error: null };
    await expect(PropinasService.update('t1', { amount: 5 })).rejects.toMatchObject({ codigo: 'SIN_PERMISO' });
    expect(eqs()).toEqual([['id', 't1'], ['organization_id', 120]]);
    const update = llamadas.find((l) => l.metodo === 'update');
    expect(update?.args[0]).toEqual({ amount: 5 });
  });

  it('crear usa la sucursal explícita del pedido si viene', async () => {
    resultado = { data: { id: 'n1' }, error: null };
    await PropinasService.create({ server_id: 'u1', amount: 10, tip_type: 'online', branch_id: 33 });
    const insert = llamadas.find((l) => l.metodo === 'insert');
    expect((insert?.args[0] as Record<string, unknown>[])[0]).toMatchObject({ organization_id: 120, branch_id: 33, tip_type: 'online', is_distributed: false });
  });

  it('distribuir va por la RPC con la organización de la sesión', async () => {
    rpc.mockResolvedValueOnce({ data: { liquidadas: 2, omitidas: 1 }, error: null });
    await expect(PropinasService.markMultipleAsDistributed(['a', 'b', 'c'])).resolves.toBe(2);
    expect(rpc).toHaveBeenCalledWith('fn_propinas_liquidar', { p_organization_id: 120, p_ids: ['a', 'b', 'c'] });
    await expect(PropinasService.markMultipleAsDistributed([])).resolves.toBe(0);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('borrar = anular por RPC, que revierte el asiento', async () => {
    rpc.mockResolvedValueOnce({ data: { asientos_revertidos: 1 }, error: null });
    await expect(PropinasService.anular('t1', 'error de digitación')).resolves.toEqual({ asientosRevertidos: 1 });
    expect(rpc).toHaveBeenCalledWith('fn_propina_anular', { p_tip_id: 't1', p_motivo: 'error de digitación' });
    expect((PropinasService as unknown as Record<string, unknown>).delete).toBeUndefined();
  });

  it('los errores de la base llegan con su código', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'PROPINA_DISTRIBUIDA: una propina distribuida no se anula' } });
    await expect(PropinasService.anular('t1')).rejects.toMatchObject({ codigo: 'PROPINA_DISTRIBUIDA' });
    expect(codigoErrorPropina({ code: '42501', message: 'new row violates row-level security policy for table "tips"' })).toBe('SIN_PERMISO');
    expect(codigoErrorPropina({ code: '22023', message: 'PROPINA_CON_ASIENTO: la propina x ya tiene asiento' })).toBe('PROPINA_CON_ASIENTO');
    expect(codigoErrorPropina(new Error('otra cosa'))).toBe('DESCONOCIDO');
  });

  it('los permisos se preguntan a la base (fn_tiene_permiso), no se deducen del rol', async () => {
    rpc.mockImplementation(async (_fn: string, args: { p_code: string }) => ({ data: args.p_code !== 'pos.void', error: null }));
    await expect(PropinasService.getPermisos()).resolves.toEqual({ registrar: true, anular: false, liquidar: true });
    const codigos = rpc.mock.calls.map((c) => [c[0], c[1].p_code, c[1].p_organization_id]);
    expect(codigos).toEqual([
      ['fn_tiene_permiso', 'pos.create', 120],
      ['fn_tiene_permiso', 'pos.void', 120],
      ['fn_tiene_permiso', 'pos.propinas.liquidar', 120],
    ]);
  });

  it('los meseros salen de la RPC por sucursal', async () => {
    rpc.mockResolvedValueOnce({ data: [{ user_id: 'u1', first_name: null, last_name: null, email: 'x@y.co' }], error: null });
    await expect(PropinasService.getServers(7, 'Sin nombre')).resolves.toEqual([{ id: 'u1', name: 'x@y.co', email: 'x@y.co' }]);
    expect(rpc).toHaveBeenCalledWith('fn_propinas_meseros', { p_organization_id: 120, p_branch_id: 7 });
  });
});

describe('Cargos de servicio: fixed_amount, null explícito y organización', () => {
  it('el tipo de monto fijo es fixed_amount, con fixed como alias al importar', () => {
    expect([...CHARGE_TYPES]).toEqual(['percentage', 'fixed_amount']);
    expect(CHARGE_TYPE_LABELS.fixed_amount).toBeTruthy();
    expect(normalizarTipoCargo('fixed')).toBe('fixed_amount');
    expect(normalizarTipoCargo(' FIXED_AMOUNT ')).toBe('fixed_amount');
    expect(normalizarTipoCargo('percentage')).toBe('percentage');
    expect(normalizarTipoCargo('fijo')).toBeNull();
  });

  it('el CSV acepta fixed, valida tipo, valor y applies_to, y numera como la hoja', () => {
    const csv = [
      'name,charge_type,charge_value,min_amount,min_guests,applies_to,is_taxable,is_optional',
      'Servicio,percentage,10,,,dine_in,true,false',
      'Domicilio,fixed,3000,20000,,delivery,false,true',
      'Malo,monto,5,,,all,false,false',
      'Cien,percentage,150,,,all,false,false',
      'Canal,fixed_amount,100,,,drive_thru,false,false',
      ',percentage,5,,,all,false,false',
    ].join('\r\n');
    const r = parsearCsvCargos(csv);
    expect(r.columnasFaltantes).toEqual([]);
    expect(r.filas.map((f) => [f.fila, f.datos.charge_type, f.datos.min_amount, f.datos.min_guests])).toEqual([
      [2, 'percentage', null, null],
      [3, 'fixed_amount', 20000, null],
    ]);
    expect(r.errores).toEqual([
      { fila: 4, codigo: 'TIPO_INVALIDO', valor: 'monto' },
      { fila: 5, codigo: 'VALOR_INVALIDO', valor: '150' },
      { fila: 6, codigo: 'APLICA_A_INVALIDO', valor: 'drive_thru' },
      { fila: 7, codigo: 'CAMPOS_FALTANTES' },
    ]);
    expect(parsearCsvCargos('name,valor\nx,1').columnasFaltantes).toEqual(['charge_type', 'charge_value']);
  });

  it('la ayuda del CSV ya no documenta «fixed» a secas', () => {
    const es = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages/es.json'), 'utf8'));
    expect(es.posCargosServicio.csvAyuda.tipoCargo).toContain('fixed_amount');
    const cabecera = fs.readFileSync(path.join(process.cwd(), 'src/components/pos/cargos-servicio/ChargesHeader.tsx'), 'utf8');
    expect(cabecera).not.toMatch(/percentage o fixed</);
  });

  it('al editar, «Global» y los mínimos borrados viajan como null explícito', () => {
    expect(cambiosParaActualizar({ branch_id: undefined, min_amount: undefined, min_guests: undefined })).toEqual({
      branch_id: null, min_amount: null, min_guests: null,
    });
    expect(cambiosParaActualizar({ branch_id: null, min_amount: 0, min_guests: '' as unknown as number })).toEqual({
      branch_id: null, min_amount: null, min_guests: null,
    });
    // Activar/desactivar no toca los demás campos.
    expect(cambiosParaActualizar({ is_active: false })).toEqual({ is_active: false });
    expect(filaParaInsertar({
      name: ' X ', charge_type: 'fixed_amount', charge_value: 5, applies_to: 'all', is_taxable: false, is_optional: false,
    })).toMatchObject({ name: 'X', min_amount: null, min_guests: null, branch_id: null });
  });

  it('update envía el null por la red y filtra por organización', async () => {
    resultado = { data: [{ id: 3 }], error: null };
    await CargosServicioService.update(3, { name: 'A', branch_id: undefined, min_amount: undefined, min_guests: undefined });
    const update = llamadas.find((l) => l.metodo === 'update');
    expect(JSON.parse(JSON.stringify(update?.args[0]))).toEqual({ name: 'A', branch_id: null, min_amount: null, min_guests: null });
    expect(eqs()).toEqual([['id', 3], ['organization_id', 120]]);
  });

  it('update, delete, getById y duplicate no salen de la organización', async () => {
    resultado = { data: [], error: null };
    await expect(CargosServicioService.update(3, { is_active: true })).rejects.toMatchObject({ codigo: 'SIN_PERMISO' });
    llamadas.length = 0;
    await expect(CargosServicioService.delete(3)).rejects.toMatchObject({ codigo: 'SIN_PERMISO' });
    expect(eqs()).toEqual([['id', 3], ['organization_id', 120]]);
    llamadas.length = 0;
    resultado = { data: null, error: null };
    await expect(CargosServicioService.getById(3)).resolves.toBeNull();
    expect(eqs()).toEqual([['id', 3], ['organization_id', 120]]);
    await expect(CargosServicioService.duplicate(3)).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
  });

  it('el filtro de sucursal incluye los cargos globales', async () => {
    expect(filtroSucursalConGlobales(5)).toBe('branch_id.eq.5,branch_id.is.null');
    resultado = { data: [], error: null };
    await CargosServicioService.getAll({ branch_id: 5 });
    expect(llamadas).toContainEqual({ metodo: 'or', args: ['branch_id.eq.5,branch_id.is.null'] });
    expect(eqs()).not.toContainEqual(['branch_id', 5]);
  });

  it('el filtro de sucursal de la página no escribe en la sucursal global', () => {
    const cabecera = fs.readFileSync(path.join(process.cwd(), 'src/components/pos/cargos-servicio/ChargesHeader.tsx'), 'utf8');
    expect(cabecera).not.toMatch(/setSelectedBranch/);
  });

  it('errores de la base → código de la pantalla', () => {
    expect(codigoErrorCargo({ code: '42501', message: 'new row violates row-level security policy' })).toBe('SIN_PERMISO');
    expect(codigoErrorCargo({ code: '23514', message: 'violates check constraint "service_charges_charge_type_check"' })).toBe('TIPO_INVALIDO');
  });

  it('el permiso de escritura se pregunta a la base (billing_management)', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(CargosServicioService.puedeGestionar()).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('fn_tiene_permiso', { p_organization_id: 120, p_code: 'billing_management' });
  });

  it('el interruptor de la configuración del POS filtra por organización y detecta el bloqueo de RLS', async () => {
    resultado = { data: [], error: null };
    await expect(ConfiguracionService.toggleServiceCharge(3, false)).rejects.toThrow('SIN_PERMISO');
    expect(eqs()).toEqual([['id', 3], ['organization_id', 120]]);
  });
});

describe('Contrato de la migración', () => {
  it('anular revierte con contra-asiento, exige pos.void y no deja borrar', () => {
    const anular = MIGRACION.slice(MIGRACION.indexOf('function public.fn_propina_anular'), MIGRACION.indexOf('function public.fn_propinas_liquidar'));
    expect(anular).toMatch(/fn_tiene_permiso\(v_tip\.organization_id, 'pos\.void'\)/);
    expect(anular).toMatch(/fn_revertir_asiento_en_fecha\(v_je\.id/);
    expect(anular).toMatch(/'reversal:' \|\| je\.id/);
    expect(anular).toMatch(/PROPINA_DISTRIBUIDA/);
    expect(anular).not.toMatch(/delete from public\.journal/i);
    // Sin política de DELETE en tips y sin privilegio de borrado para la API.
    expect(MIGRACION).not.toMatch(/create policy \w+ on public\.tips\s+for (delete|all)/);
    expect(MIGRACION).toMatch(/revoke delete, truncate on public\.tips from authenticated/);
  });

  it('liquidar exige el permiso nuevo y solo toca pendientes sin anular de la organización', () => {
    const liquidar = MIGRACION.slice(MIGRACION.indexOf('function public.fn_propinas_liquidar'), MIGRACION.indexOf('function public.fn_propinas_meseros'));
    expect(liquidar).toMatch(/fn_tiene_permiso\(p_organization_id, 'pos\.propinas\.liquidar'\)/);
    expect(liquidar).toMatch(/organization_id = p_organization_id/);
    expect(liquidar).toMatch(/not coalesce\(is_distributed, false\)/);
    expect(liquidar).toMatch(/voided_at is null/);
  });

  it('las funciones con elevación llevan su revoke a anon', () => {
    for (const fn of ['fn_propina_anular(uuid, text)', 'fn_propinas_liquidar(integer, uuid[])', 'fn_propinas_meseros(integer, integer)']) {
      expect(MIGRACION).toContain(`revoke all on function public.${fn} from public, anon;`);
    }
    expect(MIGRACION).toContain("check_user_permission((select auth.uid()), om.organization_id, 'billing_management')");
    expect(ROLLBACK).toContain('drop function if exists public.fn_propina_anular(uuid, text);');
  });
});
