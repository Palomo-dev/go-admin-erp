/**
 * Paquete D · D7 — depósito de las reservas de mesa cobrado en el sitio.
 * Lógica pura: cálculo del monto, resumen para la lista, interruptor de la
 * configuración y validación de los campos nuevos del DTO.
 */
import {
  interruptorDeposito,
  montoDeposito,
  nombrePasarela,
  resumenDeposito,
} from '@/lib/services/restaurante/depositoReserva';
import {
  AJUSTES_RESERVA_RECOMENDADOS,
  COLUMNAS_AJUSTES,
  COLUMNAS_DEPOSITO_D7,
  guardarAjustesReserva,
  pasarelaParaDeposito,
  validarAjustesReserva,
} from '@/lib/services/restaurantBookingSettingsService';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('montoDeposito (mismo cálculo que fn_reserva_mesa_deposito_calculo)', () => {
  it('por persona multiplica y monto fijo no', () => {
    expect(montoDeposito({ deposit_amount: 20000, deposit_per_person: true }, 4)).toBe(80000);
    expect(montoDeposito({ deposit_amount: 20000, deposit_per_person: false }, 4)).toBe(20000);
  });
  it('sin monto no hay depósito; menos de 1 persona cuenta como 1', () => {
    expect(montoDeposito({ deposit_amount: null, deposit_per_person: true }, 4)).toBeNull();
    expect(montoDeposito({ deposit_amount: 0, deposit_per_person: false }, 4)).toBeNull();
    expect(montoDeposito({ deposit_amount: 15000, deposit_per_person: true }, 0)).toBe(15000);
  });
});

describe('resumenDeposito (lista de reservas)', () => {
  const ahora = new Date('2026-10-06T20:00:00Z');
  it('sin columnas o sin estado: la reserva no lleva depósito', () => {
    expect(resumenDeposito({}, ahora)).toBeNull();
    expect(resumenDeposito({ deposit_status: null }, ahora)).toBeNull();
    expect(resumenDeposito({ deposit_status: 'otro' }, ahora)).toBeNull();
  });
  it('pagado y dentro del plazo: se puede registrar el reembolso', () => {
    const r = resumenDeposito(
      { deposit_status: 'paid', deposit_amount: '80000.00', deposit_currency: 'cop', deposit_refundable_until: '2026-10-07T00:00:00Z' },
      ahora,
    );
    expect(r).toMatchObject({ estado: 'paid', monto: 80000, moneda: 'COP', puedeReembolsar: true, dentroDelPlazo: true, tono: 'exito' });
  });
  it('pagado tarde: peligro y reembolsable; por pagar: aviso y no reembolsable', () => {
    expect(resumenDeposito({ deposit_status: 'paid_late', deposit_amount: 1 }, ahora)).toMatchObject({ tono: 'peligro', puedeReembolsar: true });
    expect(resumenDeposito({ deposit_status: 'pending', deposit_amount: 1 }, ahora)).toMatchObject({ tono: 'aviso', puedeReembolsar: false });
    expect(resumenDeposito({ deposit_status: 'refunded', deposit_amount: 1 }, ahora)?.puedeReembolsar).toBe(false);
  });
  it('fuera del plazo de reembolso', () => {
    expect(resumenDeposito({ deposit_status: 'paid', deposit_amount: 1, deposit_refundable_until: '2026-10-06T19:00:00Z' }, ahora)?.dentroDelPlazo).toBe(false);
  });
});

describe('interruptor «Pedir depósito»', () => {
  it('sin pasarela: deshabilitado y con aviso; con pasarela: habilitado', () => {
    expect(interruptorDeposito(null, false, false)).toEqual({ deshabilitado: true, avisoSinPasarela: true });
    expect(interruptorDeposito('wompi_co', false, false)).toEqual({ deshabilitado: false, avisoSinPasarela: false });
  });
  it('si ya está encendido y se perdió la pasarela, se deja apagar', () => {
    expect(interruptorDeposito(null, true, false).deshabilitado).toBe(false);
  });
  it('sin permiso, siempre deshabilitado', () => {
    expect(interruptorDeposito('wompi_co', false, true).deshabilitado).toBe(true);
  });
  it('nombre legible de la pasarela', () => {
    expect(nombrePasarela('wompi_co')).toBe('Wompi');
    expect(nombrePasarela(null)).toBe('la pasarela');
  });
});

describe('ajustes: campos del depósito (D7)', () => {
  it('el DTO anterior (sin los campos nuevos) sigue validando, con sus defaults', () => {
    const { deposit_refundable: _a, deposit_refund_hours: _b, ...anterior } = AJUSTES_RESERVA_RECOMENDADOS;
    const r = validarAjustesReserva(anterior);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ajustes.deposit_refundable).toBe(true);
      expect(r.ajustes.deposit_refund_hours).toBeNull();
    }
  });
  it('sin reembolso no guarda plazo; el plazo va de 0 a 720 horas', () => {
    const r = validarAjustesReserva({
      ...AJUSTES_RESERVA_RECOMENDADOS,
      require_deposit: true,
      deposit_amount: 20000,
      deposit_refundable: false,
      deposit_refund_hours: 24,
    });
    expect(r.ok && r.ajustes.deposit_refund_hours).toBeNull();
    expect(validarAjustesReserva({ ...AJUSTES_RESERVA_RECOMENDADOS, deposit_refund_hours: 721 }).ok).toBe(false);
  });
  it('las columnas nuevas se leen y, sin la migración, se omiten', () => {
    for (const c of COLUMNAS_DEPOSITO_D7) expect(COLUMNAS_AJUSTES).toContain(c);
  });

  it('guardar sin la migración (42703) repite sin las columnas nuevas', async () => {
    const escrituras: Array<Record<string, unknown>> = [];
    let intento = 0;
    const hacer = () => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is']) c[m] = () => c;
      c.upsert = (fila: Record<string, unknown>) => {
        escrituras.push(fila);
        return c;
      };
      c.maybeSingle = async () => ({ data: { id: 115 }, error: null });
      c.single = async () =>
        intento++ === 0
          ? { data: null, error: { code: '42703', message: 'column deposit_refundable does not exist' } }
          : { data: { branch_id: 115, ...AJUSTES_RESERVA_RECOMENDADOS }, error: null };
      return c;
    };
    await guardarAjustesReserva({ from: hacer } as never, 140, 115, AJUSTES_RESERVA_RECOMENDADOS);
    expect(escrituras).toHaveLength(2);
    expect(escrituras[0]).toHaveProperty('deposit_refundable');
    expect(escrituras[1]).not.toHaveProperty('deposit_refundable');
    expect(escrituras[1]).not.toHaveProperty('deposit_refund_hours');
  });

  it('pasarelaParaDeposito: sin la RPC (PGRST202) responde null', async () => {
    const sin = { rpc: async () => ({ data: null, error: { code: 'PGRST202' } }) };
    const con = { rpc: async () => ({ data: 'wompi_co', error: null }) };
    expect(await pasarelaParaDeposito(sin as never, 140)).toBeNull();
    expect(await pasarelaParaDeposito(con as never, 140)).toBe('wompi_co');
  });
});

describe('migración D7 (contrato del archivo)', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261006160259_reservas_deposito_web.sql'), 'utf8');
  const sinComentarios = sql.replace(/^--.*$/gm, '');
  it('es aditiva: sin DROP ni DELETE, y sin «;» dentro de literales', () => {
    expect(sinComentarios).not.toMatch(/\bdrop\b/i);
    expect(sinComentarios).not.toMatch(/\bdelete\s+from\b/i);
    expect(sinComentarios).not.toMatch(/'[^'\n]*;[^'\n]*'/);
  });
  it('toda función SECURITY DEFINER lleva su revoke a anon en la misma migración', () => {
    const funciones = [...sinComentarios.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map((m) => m[1]);
    for (const f of funciones.filter((f) => f !== 'fn_notify_restaurant_reservation_created')) {
      expect(sinComentarios).toMatch(new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon`));
    }
  });
  it('trae su rollback y el resultado del ensayo arriba', () => {
    expect(sql).toMatch(/ENSAYO_OK/);
    expect(readFileSync(join(process.cwd(), 'supabase/rollbacks/20261006160259_reservas_deposito_web_rollback.sql'), 'utf8')).toMatch(
      /drop function if exists public\.fn_reserva_mesa_crear_web/,
    );
  });
});
