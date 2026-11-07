/**
 * Guardado de la revisión de una alerta (Finanzas r2 · A1). Antes
 * `markAnomalyResolved` solo hacía `console.log`; ahora escribe autor, fecha y
 * motivo en `bank_alert_reviews` con el cliente de la SESIÓN.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => {
    throw new Error('la revisión no debe usar el service role');
  },
}));
jest.mock('@/lib/services/timezoneResolver', () => ({ resolveTimezone: async () => 'America/Bogota' }));

import { AnomalyDetectionService, ErrorRevisionAlerta } from '../anomalyDetectionService';
import type { EntradaRevision } from '../alertasBancarias';

type Respuesta = { data: unknown; error: { code?: string; message?: string } | null };

/** Doble mínimo del cliente: registra lo que se pide y responde por tabla. */
function clienteFalso(respuestas: Record<string, Respuesta>) {
  const llamadas: Array<{ tabla: string; op: string; args: unknown[] }> = [];
  const from = (tabla: string) => {
    const r = respuestas[tabla] ?? { data: [], error: null };
    const cadena: Record<string, unknown> = {};
    const anotar = (op: string) => (...args: unknown[]) => {
      llamadas.push({ tabla, op, args });
      return cadena;
    };
    for (const op of ['select', 'insert', 'eq', 'in', 'order', 'limit']) cadena[op] = anotar(op);
    cadena.single = async () => r;
    cadena.then = (ok: (v: Respuesta) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(r).then(ok, ko);
    return cadena;
  };
  return { cliente: { from } as unknown as SupabaseClient, llamadas };
}

const ENTRADA: EntradaRevision = {
  clave: 'dup:12,15',
  tipo: 'duplicate',
  motivo: 'Son dos pagos distintos del mismo cliente',
  resultado: 'revisada',
  cuentaId: 3,
  movimientoAnuladoId: null,
};

const FILA = {
  alert_key: 'dup:12,15',
  alert_type: 'duplicate',
  outcome: 'revisada',
  reason: 'Son dos pagos distintos del mismo cliente',
  reviewed_by: 'u-1',
  reviewed_at: '2026-11-07T15:00:00Z',
  voided_bank_transaction_id: null,
};

describe('markAnomalyResolved guarda la revisión', () => {
  it('inserta organización, clave, motivo y autor de la sesión, y devuelve el nombre', async () => {
    const { cliente, llamadas } = clienteFalso({
      bank_alert_reviews: { data: FILA, error: null },
      profiles: { data: [{ id: 'u-1', first_name: 'Persona', last_name: 'de prueba', email: null }], error: null },
    });

    const r = await AnomalyDetectionService.markAnomalyResolved(cliente, 120, ENTRADA, 'u-1');

    const insert = llamadas.find((l) => l.tabla === 'bank_alert_reviews' && l.op === 'insert');
    expect(insert?.args[0]).toEqual({
      organization_id: 120,
      alert_key: 'dup:12,15',
      alert_type: 'duplicate',
      bank_account_id: 3,
      outcome: 'revisada',
      reason: 'Son dos pagos distintos del mismo cliente',
      voided_bank_transaction_id: null,
      reviewed_by: 'u-1',
    });
    expect(r.revision).toEqual({
      clave: 'dup:12,15',
      tipo: 'duplicate',
      resultado: 'revisada',
      motivo: 'Son dos pagos distintos del mismo cliente',
      revisadoPor: 'u-1',
      revisadoPorNombre: 'Persona de prueba',
      revisadoEn: '2026-11-07T15:00:00Z',
      movimientoAnuladoId: null,
    });
  });

  it('con «duplicado_anulado» guarda el movimiento anulado', async () => {
    const { cliente, llamadas } = clienteFalso({
      bank_alert_reviews: { data: { ...FILA, outcome: 'duplicado_anulado', voided_bank_transaction_id: 15 }, error: null },
    });
    const r = await AnomalyDetectionService.markAnomalyResolved(
      cliente,
      120,
      { ...ENTRADA, resultado: 'duplicado_anulado', movimientoAnuladoId: 15 },
      'u-1',
    );
    const insert = llamadas.find((l) => l.op === 'insert');
    expect((insert?.args[0] as Record<string, unknown>).voided_bank_transaction_id).toBe(15);
    expect(r.revision.movimientoAnuladoId).toBe(15);
    expect(r.revision.revisadoPorNombre).toBeNull();
  });

  it.each([
    [{ code: '42P01', message: 'relation "bank_alert_reviews" does not exist' }, 'revision_no_disponible', 503],
    [{ code: 'PGRST205', message: "Could not find the table 'public.bank_alert_reviews'" }, 'revision_no_disponible', 503],
    [{ code: '23505', message: 'duplicate key' }, 'ya_revisada', 409],
    [{ code: '42501', message: 'row-level security' }, 'sin_permiso', 403],
  ])('error %j → %s (%i)', async (error, codigo, status) => {
    const { cliente } = clienteFalso({ bank_alert_reviews: { data: null, error } });
    const promesa = AnomalyDetectionService.markAnomalyResolved(cliente, 120, ENTRADA, 'u-1');
    await expect(promesa).rejects.toBeInstanceOf(ErrorRevisionAlerta);
    await expect(promesa).rejects.toMatchObject({ codigo, status });
  });

  it('otro error de la base no se disfraza', async () => {
    const { cliente } = clienteFalso({ bank_alert_reviews: { data: null, error: { code: 'XX000', message: 'boom' } } });
    await expect(AnomalyDetectionService.markAnomalyResolved(cliente, 120, ENTRADA, 'u-1')).rejects.toThrow('boom');
  });
});

describe('listarRevisiones', () => {
  it('filtra por la organización y pone el nombre de quien revisó', async () => {
    const { cliente, llamadas } = clienteFalso({
      bank_alert_reviews: { data: [FILA], error: null },
      profiles: { data: [{ id: 'u-1', first_name: null, last_name: null, email: 'p@ejemplo.test' }], error: null },
    });
    const r = await AnomalyDetectionService.listarRevisiones(cliente, 120);
    expect(llamadas).toContainEqual({ tabla: 'bank_alert_reviews', op: 'eq', args: ['organization_id', 120] });
    expect(r.disponible).toBe(true);
    expect(r.revisiones[0]).toMatchObject({ clave: 'dup:12,15', revisadoPorNombre: 'p@ejemplo.test' });
  });

  it('sin la tabla (migración sin aplicar) responde no disponible, sin romper la pantalla', async () => {
    const { cliente } = clienteFalso({ bank_alert_reviews: { data: null, error: { code: '42P01', message: 'does not exist' } } });
    await expect(AnomalyDetectionService.listarRevisiones(cliente, 120)).resolves.toEqual({ disponible: false, revisiones: [] });
  });
});
