// ============================================================================
// Tesorería · saldos bancarios, transferencias e ingresos/egresos (2026-09-28)
// ============================================================================
// Red de los 10 fallos del inventario de Tesorería (HEAD def8dfb0):
//
//  1. Las transferencias llamaban a `update_bank_balance` (no existe) y el
//     UPDATE de respaldo nunca se esperaba: el saldo NUNCA cambiaba. Ahora van
//     por `fn_transferencia_registrar` / `fn_transferencia_anular`.
//  2. El saldo lo mantienen los disparadores a partir de los movimientos.
//  3. Duplicar un ingreso de caja creaba un EGRESO ('in' pasado como tipo de UI).
//  4. El detalle de un movimiento de banco anulaba/duplicaba en CAJA.
//  5. `getMovementByUuid` no filtraba por tipo.
//  6. El movimiento manual del banco usaba 'credit'/'debit'/'pending' (CHECK).
//  7. UPDATE de cuentas sin filtro de organización.
//  8. El alta desde caja tomaba la última caja abierta de TODA la organización.
//  9. Los servicios devolvían [] cuando fallaban.
// 10. CuentaDetailPage leía open_finance_accounts sin organización y con .single().
//
// La parte de base (saldos que se mueven, idempotencia, saldo insuficiente,
// anulación que revierte) se probó contra Postgres en una transacción que se
// deshizo (ver docs/hallazgos/F-79.md); aquí se fija el contrato del cliente y
// las propiedades de seguridad de las migraciones.
// ============================================================================

import { readFileSync } from 'fs';
import { join } from 'path';
import { DobleSupabase } from '../timezone/dobleSupabase';

type LlamadaRpc = { nombre: string; args: Record<string, unknown> };

class DobleConRpc extends DobleSupabase {
  readonly rpcs: LlamadaRpc[] = [];
  respuestasRpc: Record<string, Array<{ data?: unknown; error?: unknown }>> = {};

  rpc(nombre: string, args: Record<string, unknown>) {
    this.rpcs.push({ nombre, args });
    const cola = this.respuestasRpc[nombre] ?? [];
    const r = cola.length > 1 ? cola.shift()! : (cola[0] ?? { data: null, error: null });
    return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
  }

  deRpc(nombre: string): LlamadaRpc[] {
    return this.rpcs.filter((r) => r.nombre === nombre);
  }
}

let doble = new DobleConRpc();

jest.mock('@/lib/supabase/config', () => ({
  get supabase() {
    return doble;
  },
}));

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 2,
  getCurrentBranchId: () => 5,
  getCurrentUserId: async () => 'usuario-1',
}));

jest.mock('@/lib/services/monedaOrganizacion', () => ({
  resolveOrgCurrency: async () => ({ code: 'COP', symbol: '$' }),
}));

import {
  CODIGOS_ERROR_TESORERIA,
  ESTADOS_MOVIMIENTO_BANCARIO,
  TIPOS_MOVIMIENTO_BANCARIO,
  codigoErrorTesoreria,
  esEntradaBancaria,
  estaConciliado,
  movimientoBancario,
  tipoCaja,
  tipoDesdeCaja,
  uuidDeterminista,
} from '@/lib/finanzas/movimientoBancario';
import { movimientosService } from '@/lib/services/movimientosService';
import { transferenciasService } from '@/lib/services/transferenciasService';
import { BancosService } from '@/components/finanzas/bancos/BancosService';
import { RPC_MOVIMIENTO_CAJA } from '@/lib/pos/cajas/movimientoRpc';

const RAIZ = join(__dirname, '..', '..', '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf-8');

beforeEach(() => {
  doble = new DobleConRpc();
});

// ---------------------------------------------------------------------------
describe('vocabulario (valores del CHECK, verificados por MCP)', () => {
  test('tipos y estados de bank_transactions', () => {
    expect([...TIPOS_MOVIMIENTO_BANCARIO].sort()).toEqual(['deposit', 'fee', 'interest', 'other', 'transfer', 'withdrawal']);
    expect([...ESTADOS_MOVIMIENTO_BANCARIO].sort()).toEqual(['matched', 'reconciled', 'unmatched']);
  });

  test('caja: income ↔ in, expense ↔ out, en ambos sentidos y sin invertir si llega ya convertido', () => {
    expect(tipoCaja('income')).toBe('in');
    expect(tipoCaja('expense')).toBe('out');
    expect(tipoDesdeCaja('in')).toBe('income');
    expect(tipoDesdeCaja('out')).toBe('expense');
    expect(tipoDesdeCaja('income')).toBe('income');
    expect(() => tipoDesdeCaja('credit')).toThrow();
  });

  test('banco: el signo del importe da el sentido', () => {
    expect(movimientoBancario('income', 100)).toEqual({ transaction_type: 'deposit', amount: 100 });
    expect(movimientoBancario('expense', 100)).toEqual({ transaction_type: 'withdrawal', amount: -100 });
    expect(esEntradaBancaria({ amount: '250.00' })).toBe(true);
    expect(esEntradaBancaria({ amount: -1 })).toBe(false);
    expect(estaConciliado('reconciled')).toBe(true);
    expect(estaConciliado('unmatched')).toBe(false);
  });

  test('errores de la base → código estable (el más largo gana)', () => {
    expect(codigoErrorTesoreria({ message: 'saldo_insuficiente_para_revertir' })).toBe('saldo_insuficiente_para_revertir');
    expect(codigoErrorTesoreria({ message: 'saldo_insuficiente' })).toBe('saldo_insuficiente');
    expect(codigoErrorTesoreria({ code: '42501', message: 'Acceso denegado a la organización' })).toBe('sin_permiso');
    expect(codigoErrorTesoreria({ message: 'SUCURSAL_NO_PERMITIDA' })).toBe('sin_acceso_sucursal');
    expect(codigoErrorTesoreria({ message: 'boom' })).toBe('desconocido');
  });

  test('uuid determinista: misma semilla, mismo uuid (formato válido)', async () => {
    const a = await uuidDeterminista('anulacion:abc');
    expect(a).toBe(await uuidDeterminista('anulacion:abc'));
    expect(a).not.toBe(await uuidDeterminista('anulacion:abd'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

// ---------------------------------------------------------------------------
describe('1. transferencias por RPC transaccional', () => {
  const datos = { from_account_id: 1, to_account_id: 2, amount: 250, transfer_date: '2026-09-28', branch_id: null };

  test('registrar = UNA llamada a fn_transferencia_registrar; nada escribe cuentas ni transferencias desde el navegador', async () => {
    doble.respuestasRpc.fn_transferencia_registrar = [{ data: { id: 'clave-1', repetida: false } }];
    const r = await transferenciasService.createTransfer(datos, 'clave-1');
    expect(r).toMatchObject({ success: true, id: 'clave-1', repetida: false });
    expect(doble.deRpc('fn_transferencia_registrar')).toHaveLength(1);
    expect(doble.deRpc('fn_transferencia_registrar')[0].args).toMatchObject({
      p_id: 'clave-1',
      p_organization_id: 2,
      p_cuenta_origen: 1,
      p_cuenta_destino: 2,
      p_monto: 250,
      // El día calendario viaja como `date`: el servidor pone la hora de pared.
      p_fecha: '2026-09-28',
    });
    expect(doble.llamadas.filter((l) => l.operacion !== 'select')).toEqual([]);
    expect(doble.deRpc('update_bank_balance')).toEqual([]);
  });

  test('idempotente: la misma clave se reenvía y la respuesta «repetida» no es un error', async () => {
    doble.respuestasRpc.fn_transferencia_registrar = [
      { data: { id: 'clave-1', repetida: false } },
      { data: { id: 'clave-1', repetida: true } },
    ];
    await transferenciasService.createTransfer(datos, 'clave-1');
    const segunda = await transferenciasService.createTransfer(datos, 'clave-1');
    expect(segunda).toMatchObject({ success: true, repetida: true });
    expect(doble.deRpc('fn_transferencia_registrar').map((r) => r.args.p_id)).toEqual(['clave-1', 'clave-1']);
  });

  test('saldo insuficiente lo decide el servidor y llega como código traducible', async () => {
    doble.respuestasRpc.fn_transferencia_registrar = [{ error: { code: '22023', message: 'saldo_insuficiente' } }];
    const r = await transferenciasService.createTransfer(datos, 'clave-2');
    expect(r).toMatchObject({ success: false, codigo: 'saldo_insuficiente' });
  });

  test('anular = fn_transferencia_anular con la organización de la sesión; sin UPDATE directo', async () => {
    doble.respuestasRpc.fn_transferencia_anular = [{ data: { id: 't-1', ya_anulada: false } }];
    const r = await transferenciasService.cancelTransfer('t-1', 'error de digitación');
    expect(r).toMatchObject({ success: true, repetida: false });
    expect(doble.deRpc('fn_transferencia_anular')[0].args).toEqual({ p_organization_id: 2, p_id: 't-1', p_motivo: 'error de digitación' });
    expect(doble.llamadas).toEqual([]);
  });

  test('el servicio ya no contiene la RPC inexistente ni el UPDATE de saldo sin esperar', () => {
    const fuente = leer('src/lib/services/transferenciasService.ts');
    expect(fuente).not.toMatch(/update_bank_balance/);
    expect(fuente).not.toMatch(/\.from\('bank_accounts'\)\s*\.update/);
    expect(fuente).not.toMatch(/\.from\('bank_transfers'\)\s*\.(insert|update)/);
  });
});

// ---------------------------------------------------------------------------
describe('2 y 1. migraciones: regla única del saldo y RPC seguras', () => {
  const saldo = leer('supabase/migrations/20260928160000_finanzas_saldo_bancario_por_movimientos.sql');
  const rpc = leer('supabase/migrations/20260928161000_finanzas_transferencias_y_anulacion_bancaria_rpc.sql');

  test('disparadores de saldo en movimientos y transferencias, y guarda del saldo', () => {
    expect(saldo).toMatch(/create trigger trg_bank_tx_saldo\s+after insert or delete or update of amount, bank_account_id on public\.bank_transactions/);
    expect(saldo).toMatch(/create trigger trg_bank_transfer_saldo\s+after insert or delete or update of status, amount, from_account_id, to_account_id on public\.bank_transfers/);
    expect(saldo).toMatch(/create trigger trg_bank_accounts_saldo_guarda\s+before insert or update on public\.bank_accounts/);
    expect(saldo).toMatch(/raise exception 'saldo_bancario_por_movimientos'/);
    // Solo la transferencia completada mueve saldo; la anulada lo devuelve.
    expect(saldo).toMatch(/old\.status = 'completed'/);
    expect(saldo).toMatch(/new\.status = 'completed'/);
  });

  test('la cuenta de un movimiento o transferencia debe ser de la misma organización', () => {
    expect(saldo).toMatch(/b\.organization_id = new\.organization_id/);
    expect(saldo).toMatch(/trg_bank_tx_cuenta_misma_org/);
    expect(saldo).toMatch(/trg_bank_transfer_cuenta_misma_org/);
  });

  test('bank_transfers sin escritura directa y anon sin privilegios', () => {
    expect(saldo).toMatch(/revoke insert, update, delete, truncate on public\.bank_transfers from authenticated/);
    expect(saldo).toMatch(/revoke all on public\.bank_accounts, public\.bank_transactions, public\.bank_transfers from anon/);
  });

  test.each(['fn_transferencia_registrar', 'fn_transferencia_anular', 'fn_movimiento_banco_anular'])(
    '%s: SECURITY DEFINER, permiso por organización y revocada a anon',
    (fn) => {
      const cuerpo = rpc.slice(rpc.indexOf(`create or replace function public.${fn}(`));
      const hasta = cuerpo.indexOf('$function$;');
      const def = cuerpo.slice(0, hasta);
      expect(def).toMatch(/security definer/);
      expect(def).toMatch(/fn_finanzas_exigir_permiso\(p_organization_id/);
      expect(def).toMatch(/fn_fc_acceso_sucursal/);
      expect(rpc).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`));
    },
  );

  test('registrar: idempotencia, cuentas bloqueadas, saldo suficiente, moneda y día de la organización', () => {
    expect(rpc).toMatch(/pg_advisory_xact_lock\(hashtextextended\('fn_transferencia_registrar:'/);
    expect(rpc).toMatch(/order by id\s+for update/);
    expect(rpc).toMatch(/raise exception 'saldo_insuficiente'/);
    expect(rpc).toMatch(/raise exception 'moneda_distinta'/);
    expect(rpc).toMatch(/raise exception 'fecha_futura'/);
    expect(rpc).toMatch(/fn_timezone_for\(p_organization_id, v_branch\)/);
  });

  test('cada migración tiene su reversión', () => {
    expect(leer('supabase/rollbacks/20260928160000_finanzas_saldo_bancario_por_movimientos_rollback.sql')).toMatch(/drop trigger if exists trg_bank_tx_saldo/);
    expect(leer('supabase/rollbacks/20260928161000_finanzas_transferencias_y_anulacion_bancaria_rpc_rollback.sql')).toMatch(/drop function if exists public\.fn_transferencia_registrar/);
  });
});

// ---------------------------------------------------------------------------
describe('3. duplicar conserva el sentido', () => {
  test('duplicar un INGRESO de caja registra un ingreso (p_tipo in), en la caja de la sucursal del original', async () => {
    doble = new DobleConRpc({
      cash_movements: [{ data: { id: 9, uuid: 'm-9', type: 'in', concept: 'Venta de chatarra', amount: 1200, notes: null, cash_session_id: 3, branch_id: 7, cash_session: { id: 3, status: 'closed', branch_id: 7 } } }],
    });
    doble.respuestasRpc.fn_caja_abierta_para = [{ data: 11 }];
    doble.respuestasRpc[RPC_MOVIMIENTO_CAJA] = [{ data: { id: 40, uuid: 'nuevo-uuid' } }];

    const r = await movimientosService.duplicateMovement({ id: 9, source: 'cash' }, '');
    expect(r).toMatchObject({ success: true, uuid: 'nuevo-uuid' });
    expect(doble.deRpc(RPC_MOVIMIENTO_CAJA)[0].args).toMatchObject({ p_session_id: 11, p_tipo: 'in', p_monto: 1200 });
    expect(doble.deRpc('fn_caja_abierta_para')[0].args).toEqual({ p_org: 2, p_branch: 7, p_user: 'usuario-1' });
  });

  test('duplicar un egreso de BANCO crea otro egreso en la misma cuenta, no un movimiento de caja', async () => {
    doble = new DobleConRpc({
      bank_transactions: [
        { data: { id: 12, uuid: 'b-12', amount: -300, description: 'Comisión', reference: null, bank_account_id: 4, branch_id: 5, transaction_type: 'withdrawal' } },
        { data: { id: 13, uuid: 'b-13' } },
      ],
    });
    const r = await movimientosService.duplicateMovement({ id: 12, source: 'bank' }, '');
    expect(r).toMatchObject({ success: true, uuid: 'b-13' });
    const insercion = doble.ultimaEscritura('bank_transactions');
    expect(insercion?.payload).toMatchObject({ bank_account_id: 4, amount: -300, transaction_type: 'withdrawal', status: 'unmatched', organization_id: 2 });
    expect(doble.deTabla('cash_movements')).toEqual([]);
    expect(doble.deRpc(RPC_MOVIMIENTO_CAJA)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('4. el detalle de un movimiento de banco no toca la caja', () => {
  test('anular banco = fn_movimiento_banco_anular; ni lectura ni escritura en cash_movements', async () => {
    doble.respuestasRpc.fn_movimiento_banco_anular = [{ data: { id: 20, uuid: 'rev', ya_anulado: false } }];
    const r = await movimientosService.cancelMovement({ id: 12, source: 'bank' }, 'duplicado');
    expect(r.success).toBe(true);
    expect(doble.deRpc('fn_movimiento_banco_anular')[0].args).toEqual({ p_organization_id: 2, p_id: 12, p_motivo: 'duplicado' });
    expect(doble.deTabla('cash_movements')).toEqual([]);
    expect(doble.deRpc(RPC_MOVIMIENTO_CAJA)).toEqual([]);
  });

  test('un movimiento conciliado no se anula: el motivo llega traducible', async () => {
    doble.respuestasRpc.fn_movimiento_banco_anular = [{ error: { code: '22023', message: 'movimiento_conciliado' } }];
    const r = await movimientosService.cancelMovement({ id: 12, source: 'bank' });
    expect(r).toMatchObject({ success: false, codigo: 'movimiento_conciliado' });
  });

  test('las pantallas pasan id + fuente y navegan con el uuid', () => {
    for (const ruta of ['src/components/finanzas/ingresos/IngresoDetalle.tsx', 'src/components/finanzas/egresos/EgresoDetalle.tsx']) {
      const fuente = leer(ruta);
      expect(fuente).toMatch(/cancelMovement\(\s*\{ id: movement\.id, source: movement\.source \}/);
      expect(fuente).toMatch(/duplicateMovement\(\{ id: movement\.id, source: movement\.source \}/);
      expect(fuente).toMatch(/\$\{result\.uuid\}/);
      expect(fuente).not.toMatch(/\$\{result\.id\}/);
    }
  });
});

// ---------------------------------------------------------------------------
describe('5. el detalle filtra por tipo', () => {
  test('/ingresos/[uuid] busca type=in en caja y transaction_type=deposit en banco', async () => {
    const r = await movimientosService.getMovementByUuid('u-1', 'income');
    expect(r).toBeNull();
    expect(doble.filtro('cash_movements', 'eq', 'type')).toBe('in');
    expect(doble.filtro('bank_transactions', 'eq', 'transaction_type')).toBe('deposit');
  });

  test('/egresos/[uuid] busca type=out y withdrawal', async () => {
    await movimientosService.getMovementByUuid('u-1', 'expense');
    expect(doble.filtro('cash_movements', 'eq', 'type')).toBe('out');
    expect(doble.filtro('bank_transactions', 'eq', 'transaction_type')).toBe('withdrawal');
  });
});

// ---------------------------------------------------------------------------
describe('6. movimiento manual del banco con los valores del CHECK', () => {
  test('egreso → withdrawal con importe negativo y estado unmatched; el saldo no se escribe desde aquí', async () => {
    doble = new DobleConRpc({ bank_transactions: [{ data: { id: 1, amount: '-50.00' } }] });
    await BancosService.crearTransaccion({ bank_account_id: 4, transaction_type: 'withdrawal', amount: 50, description: 'Comisión' });
    expect(doble.ultimaEscritura('bank_transactions')?.payload).toMatchObject({
      organization_id: 2,
      bank_account_id: 4,
      transaction_type: 'withdrawal',
      amount: -50,
      status: 'unmatched',
    });
    expect(doble.deTabla('bank_accounts')).toEqual([]);
  });

  test('deshacer una conciliación deja el movimiento en unmatched (pending no existe)', async () => {
    await BancosService.unmatchTransaccion('item-1', 8);
    const upd = doble.deTabla('bank_transactions').find((l) => l.operacion === 'update');
    expect(upd?.payload).toMatchObject({ status: 'unmatched' });
    expect(upd?.filtros).toContainEqual({ metodo: 'eq', columna: 'organization_id', valor: 2 });
  });

  test('ninguna pantalla de bancos ni conciliación pregunta por credit/debit ni filtra por pending', () => {
    for (const ruta of [
      'src/components/finanzas/bancos/cuentas/MovimientosPage.tsx',
      'src/components/finanzas/bancos/cuentas/CuentaDetailPage.tsx',
      'src/components/finanzas/conciliacion-bancaria/ConciliacionDetailPage.tsx',
      'src/components/finanzas/conciliacion-bancaria/AIMatchingPanel.tsx',
      'src/lib/services/integrations/qrShared/paymentConfirmation.ts',
      'src/lib/services/integrations/openFinance/transactionSyncService.ts',
    ]) {
      const fuente = leer(ruta);
      expect({ ruta, credit: /transaction_type === 'credit'|transaction_type: 'credit'|'credit' : 'debit'/.test(fuente) }).toEqual({ ruta, credit: false });
    }
    expect(leer('src/components/finanzas/bancos/cuentas/MovimientosPage.tsx')).not.toMatch(/value="pending"/);
  });
});

// ---------------------------------------------------------------------------
describe('7. escrituras de cuentas con filtro de organización', () => {
  test('activar/desactivar filtra por organización', async () => {
    await BancosService.toggleActivoCuenta(4, false);
    const upd = doble.deTabla('bank_accounts')[0];
    expect(upd.operacion).toBe('update');
    expect(upd.filtros).toContainEqual({ metodo: 'eq', columna: 'organization_id', valor: 2 });
  });

  test('editar la cuenta filtra por organización y nunca manda el saldo', async () => {
    await BancosService.actualizarCuentaBancaria(4, { name: 'Ahorros', balance: 999, organization_id: 77 });
    const upd = doble.deTabla('bank_accounts')[0];
    expect(upd.payload).not.toHaveProperty('balance');
    expect(upd.payload).not.toHaveProperty('organization_id');
    expect(upd.filtros).toContainEqual({ metodo: 'eq', columna: 'organization_id', valor: 2 });
  });

  test('ya no existe el leer-y-escribir del saldo en el navegador', () => {
    expect(leer('src/components/finanzas/bancos/BancosService.ts')).not.toMatch(/actualizarBalanceCuenta|balance: newBalance/);
  });
});

// ---------------------------------------------------------------------------
describe('8. caja de la sucursal elegida', () => {
  test('el alta pide la caja abierta de ESA sucursal (fn_caja_abierta_para), no la última de la organización', async () => {
    doble.respuestasRpc.fn_caja_abierta_para = [{ data: 31 }];
    doble.respuestasRpc[RPC_MOVIMIENTO_CAJA] = [{ data: { id: 1, uuid: 'x' } }];
    const r = await movimientosService.createCashMovement({ type: 'expense', concept: 'Taxi', amount: 20, source: 'cash', branch_id: 8 }, '');
    expect(r.success).toBe(true);
    expect(doble.deRpc('fn_caja_abierta_para')[0].args).toEqual({ p_org: 2, p_branch: 8, p_user: 'usuario-1' });
    expect(doble.deRpc(RPC_MOVIMIENTO_CAJA)[0].args).toMatchObject({ p_session_id: 31, p_tipo: 'out' });
    expect(doble.deTabla('cash_sessions')).toEqual([]);
  });

  test('sin caja abierta en la sucursal: error claro, sin escribir', async () => {
    doble.respuestasRpc.fn_caja_abierta_para = [{ data: null }];
    const r = await movimientosService.createCashMovement({ type: 'income', concept: 'x', amount: 1, source: 'cash', branch_id: 8 }, '');
    expect(r).toMatchObject({ success: false, codigo: 'sin_caja_abierta_sucursal' });
    expect(doble.deRpc(RPC_MOVIMIENTO_CAJA)).toEqual([]);
  });

  test('anular va contra la sesión del original si sigue abierta', async () => {
    doble = new DobleConRpc({
      cash_movements: [{ data: { id: 5, uuid: 'orig-5', type: 'in', concept: 'Aporte', amount: 100, cash_session_id: 3, branch_id: 7, cash_session: { id: 3, status: 'open', branch_id: 7 } } }],
    });
    doble.respuestasRpc[RPC_MOVIMIENTO_CAJA] = [{ data: { id: 6, uuid: 'rev' } }];
    await movimientosService.cancelMovement({ id: 5, source: 'cash' }, 'error');
    expect(doble.deRpc('fn_caja_abierta_para')).toEqual([]);
    expect(doble.deRpc(RPC_MOVIMIENTO_CAJA)[0].args).toMatchObject({ p_session_id: 3, p_tipo: 'out', p_notas: 'error' });
  });

  test('si la sesión original cerró, el reverso va a la caja abierta de la MISMA sucursal y queda documentado; es idempotente', async () => {
    const original = { id: 5, uuid: 'orig-5', type: 'out', concept: 'Taxi', amount: 20, cash_session_id: 3, branch_id: 7, cash_session: { id: 3, status: 'closed', branch_id: 7 } };
    doble = new DobleConRpc({ cash_movements: [{ data: original }] });
    doble.respuestasRpc.fn_caja_abierta_para = [{ data: 44 }];
    doble.respuestasRpc[RPC_MOVIMIENTO_CAJA] = [{ data: { id: 6, uuid: 'rev' } }];
    await movimientosService.cancelMovement({ id: 5, source: 'cash' });
    await movimientosService.cancelMovement({ id: 5, source: 'cash' });

    expect(doble.deRpc('fn_caja_abierta_para')[0].args).toEqual({ p_org: 2, p_branch: 7, p_user: 'usuario-1' });
    const [a, b] = doble.deRpc(RPC_MOVIMIENTO_CAJA).map((r) => r.args);
    expect(a).toMatchObject({ p_session_id: 44, p_tipo: 'in' });
    expect(String(a.p_notas)).toMatch(/Caja original #3 cerrada: reverso en la caja #44/);
    expect(a.p_uuid).toBe(await uuidDeterminista('anulacion:orig-5'));
    expect(b.p_uuid).toBe(a.p_uuid);
  });

  test('el servicio ya no busca «la última caja abierta de la organización»', () => {
    expect(leer('src/lib/services/movimientosService.ts')).not.toMatch(/\.from\('cash_sessions'\)/);
  });
});

// ---------------------------------------------------------------------------
describe('9. los errores se propagan (la lista no finge estar vacía)', () => {
  test('ingresos/egresos', async () => {
    doble = new DobleConRpc({ bank_transactions: [{ error: { message: 'timeout' } }] });
    await expect(movimientosService.getAllMovements('income')).rejects.toMatchObject({ message: 'timeout' });
  });

  test('transferencias y cuentas', async () => {
    doble = new DobleConRpc({ bank_transfers: [{ error: { message: 'timeout' } }], bank_accounts: [{ error: { message: 'timeout' } }] });
    await expect(transferenciasService.getTransfers()).rejects.toMatchObject({ message: 'timeout' });
    await expect(transferenciasService.getBankAccounts()).rejects.toMatchObject({ message: 'timeout' });
    await expect(movimientosService.getBankAccounts()).rejects.toMatchObject({ message: 'timeout' });
  });

  test('las pantallas ofrecen «Reintentar»', () => {
    for (const ruta of [
      'src/components/finanzas/ingresos/IngresosPage.tsx',
      'src/components/finanzas/egresos/EgresosPage.tsx',
      'src/components/finanzas/transferencias/TransferenciasPage.tsx',
      'src/components/finanzas/transferencias/TransferenciaDetalle.tsx',
      'src/components/finanzas/ingresos/IngresoDetalle.tsx',
      'src/components/finanzas/egresos/EgresoDetalle.tsx',
    ]) {
      expect({ ruta, reintentar: /t\('reintentar'\)/.test(leer(ruta)) }).toEqual({ ruta, reintentar: true });
    }
  });
});

// ---------------------------------------------------------------------------
describe('10. CuentaDetailPage y open_finance_accounts', () => {
  test('filtra por organización y usa maybeSingle', () => {
    const fuente = leer('src/components/finanzas/bancos/cuentas/CuentaDetailPage.tsx');
    const consulta = fuente.slice(fuente.indexOf(".from('open_finance_accounts')"), fuente.indexOf('setOfLink('));
    expect(consulta).toMatch(/\.eq\('organization_id', getOrganizationId\(\)\)/);
    expect(consulta).toMatch(/\.maybeSingle\(\)/);
    expect(consulta).not.toMatch(/\.single\(\)/);
  });
});

// ---------------------------------------------------------------------------
describe('textos nuevos en es/en/fr/pt (namespace tesoreria)', () => {
  type Arbol = { [k: string]: string | Arbol };
  const aplanar = (a: Arbol, p = ''): Record<string, string> =>
    Object.entries(a).reduce<Record<string, string>>((acc, [k, v]) => {
      const ruta = p ? `${p}.${k}` : k;
      return typeof v === 'string' ? { ...acc, [ruta]: v } : { ...acc, ...aplanar(v, ruta) };
    }, {});
  const ns = Object.fromEntries(
    ['es', 'en', 'fr', 'pt'].map((l) => [l, aplanar((JSON.parse(leer(`messages/${l}.json`)) as Arbol).tesoreria as Arbol)]),
  );

  test.each(['en', 'fr', 'pt'])('%s tiene exactamente las claves de es, sin textos vacíos', (l) => {
    expect(Object.keys(ns[l]).sort()).toEqual(Object.keys(ns.es).sort());
    expect(Object.values(ns[l]).filter((v) => !v.trim())).toEqual([]);
  });

  test('todo código de error tiene su texto', () => {
    const faltan = CODIGOS_ERROR_TESORERIA.filter((c) => !(`errores.${c}` in ns.es));
    expect(faltan).toEqual([]);
  });
});
