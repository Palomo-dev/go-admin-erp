/// <reference types="jest" />
/**
 * ADR-CC-012 — un asiento publicado no se edita ni se borra: se revierte.
 *
 * El navegador ya no escribe en journal_entries/journal_lines: crea, publica,
 * descarta y revierte por funciones de la base. Estos tests fijan ese contrato
 * y los informes que ahora suman en la base (fn_saldos_cuentas).
 */

const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

jest.mock('@/lib/hooks/useOrganization', () => ({
  obtenerOrganizacionActiva: jest.fn(() => ({ id: 149 })),
  getCurrentBranchId: jest.fn(() => 129),
}));

jest.mock('@/lib/services/timezoneResolver', () => ({
  resolveTimezone: jest.fn(async () => 'America/Bogota'),
}));

jest.mock('@/lib/services/monedaOrganizacion', () => ({
  resolveOrgCurrency: jest.fn(async () => ({ code: 'COP' })),
}));

jest.spyOn(console, 'error').mockImplementation(() => {});

import {
  ContabilidadService,
  mapaDeReversiones,
  mensajeErrorAsiento,
} from '../ContabilidadService';
import { ReportesContablesService } from '../ReportesContablesService';

function consulta(resultado: unknown) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'lte', 'gte', 'lt', 'range', 'limit', 'insert', 'update', 'delete']) {
    c[m] = jest.fn(() => c);
  }
  c.single = jest.fn(async () => resultado);
  c.maybeSingle = jest.fn(async () => resultado);
  (c as unknown as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(resultado);
  return c;
}

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
});

describe('Asiento manual por la base', () => {
  it('crear no inserta en journal_entries: llama a fn_asiento_manual_crear', async () => {
    mockRpc.mockResolvedValue({ data: 501, error: null });
    mockFrom.mockImplementation(() => consulta({ data: { id: 501, organization_id: 149 }, error: null }));

    await ContabilidadService.crearAsiento({
      entry_date: '2026-09-23T15:00:00.000Z',
      memo: 'Prueba',
      lines: [
        { account_code: '5905', debit: 100, credit: 0 },
        { account_code: '1105', debit: 0, credit: 100 },
      ],
    }, 129);

    expect(mockRpc).toHaveBeenCalledWith('fn_asiento_manual_crear', expect.objectContaining({
      p_organization_id: 149,
      p_branch_id: 129,
      p_publicar: false,
    }));
    // Solo lee el asiento de vuelta; nunca escribe asientos ni líneas.
    for (const resultado of mockFrom.mock.results) {
      const q = resultado.value as Record<string, jest.Mock>;
      expect(q.insert).not.toHaveBeenCalled();
      expect(q.update).not.toHaveBeenCalled();
      expect(q.delete).not.toHaveBeenCalled();
    }
  });

  it('publicar, descartar y revertir van por RPC', async () => {
    mockRpc.mockResolvedValue({ data: 900, error: null });
    await ContabilidadService.publicarAsiento(1);
    await ContabilidadService.eliminarAsiento(2);
    const contra = await ContabilidadService.revertirAsiento(3, 'Error de digitación');

    expect(mockRpc).toHaveBeenNthCalledWith(1, 'fn_asiento_manual_publicar', { p_entry_id: 1 });
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'fn_asiento_manual_descartar', { p_entry_id: 2 });
    expect(mockRpc).toHaveBeenNthCalledWith(3, 'fn_revertir_asiento_manual', { p_entry_id: 3, p_motivo: 'Error de digitación' });
    expect(contra).toBe(900);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('el error de la base llega traducido al usuario', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'AUTOMATICO_SE_REVIERTE_ANULANDO_DOCUMENTO: el asiento 7 viene de sales' },
    });
    await expect(ContabilidadService.revertirAsiento(7, 'Motivo válido')).rejects.toThrow(
      'Este asiento es automático: se revierte anulando su documento de origen.'
    );
  });
});

describe('mensajeErrorAsiento', () => {
  it('traduce los códigos conocidos y conserva los desconocidos', () => {
    expect(mensajeErrorAsiento({ message: 'SIN_PERMISO: revertir asientos requiere…' }))
      .toBe('No tienes permiso para esta acción contable.');
    expect(mensajeErrorAsiento({ message: 'PERIODO_CERRADO: el periodo del 2026-08-10 está cerrado' }))
      .toBe('El periodo contable está cerrado.');
    expect(mensajeErrorAsiento({ message: 'algo inesperado' })).toBe('algo inesperado');
    expect(mensajeErrorAsiento(null)).toBe('No se pudo completar la operación contable.');
  });
});

describe('mapaDeReversiones', () => {
  it('enlaza cada contra-asiento con su original', () => {
    const mapa = mapaDeReversiones([
      { id: 10, source: 'manual', source_id: null },
      { id: 11, source: 'reversal', source_id: '10' },
      { id: 12, source: 'sales', source_id: 'abc' },
    ]);
    expect(mapa.get(10)).toBe(11);
    expect(mapa.has(12)).toBe(false);
    expect(mapa.size).toBe(1);
  });
});

describe('Informes que suman en la base', () => {
  const cuentas = [
    { account_code: '41', name: 'Ingresos', type: 'income', parent_code: null },
    { account_code: '4105', name: 'Ventas', type: 'income', parent_code: '41' },
    { account_code: '1305', name: 'Clientes', type: 'asset', parent_code: null },
  ];

  it('el estado de resultados suma el saldo propio del padre más el de sus hijas', async () => {
    mockFrom.mockImplementation(() => consulta({ data: cuentas.filter(c => c.type === 'income'), error: null }));
    mockRpc.mockResolvedValue({
      data: [
        { account_code: '41', debito: 0, credito: 50 },
        { account_code: '4105', debito: 0, credito: 1000 },
      ],
      error: null,
    });

    const r = await ReportesContablesService.getIncomeStatement('2026-09-01', '2026-09-30');
    expect(mockRpc).toHaveBeenCalledWith('fn_saldos_cuentas', expect.objectContaining({ p_organization_id: 149 }));
    expect(r.income[0].amount).toBe(1050);
    expect(r.totalIncome).toBe(1050);
  });

  it('el balance de prueba pone un saldo acreedor de un activo en la columna crédito', async () => {
    mockFrom.mockImplementation(() => consulta({ data: [cuentas[2]], error: null }));
    mockRpc
      .mockResolvedValueOnce({ data: [{ account_code: '1305', debito: 0, credito: 300 }], error: null }) // periodo
      .mockResolvedValueOnce({ data: [{ account_code: '1305', debito: 100, credito: 0 }], error: null }); // anterior

    const [fila] = await ReportesContablesService.getTrialBalance('2026-09-01', '2026-09-30');
    expect(fila.initial_debit).toBe(100);
    expect(fila.initial_credit).toBe(0);
    expect(fila.final_debit).toBe(0);
    expect(fila.final_credit).toBe(200);
  });
});
