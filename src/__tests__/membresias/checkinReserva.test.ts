/**
 * Check-in desde una reserva de clase (docs/design/MEMBRESIAS-FASE-1-2.md §13) — lógica pura de
 * src/lib/services/membresias/checkinReserva.ts.
 *
 * Las reglas (reserva de la organización y del miembro, sede de la clase, vencida, congelada,
 * gracia, idempotencia) las aplica fn_membresia_registrar_checkin(..., p_class_reservation_id) y
 * se probaron en seco con el MCP: permitida → reserva checked_in; segundo clic → repetida con el
 * mismo checkin_id y una sola fila; vencida → rechazo registrado y la reserva sigue booked; otro
 * miembro / cancelada / inexistente → reserva_de_otro_miembro / reserva_cancelada / reserva_no_encontrada;
 * llamada de 5 argumentos (check-in normal) sin cambios.
 */
import {
  avisoEntradaReserva,
  estadoErrorRpc,
  mapearResultadoCheckin,
  puedeRegistrarEntradaReserva,
} from '@/lib/services/membresias/checkinReserva';
import { ERRORES_MEMBRESIAS } from '@/lib/services/membresias/tipos';

describe('cuándo se ofrece «Registrar entrada»', () => {
  it('reservada o marcada «no asistió» (llegó tarde): sí', () => {
    expect(puedeRegistrarEntradaReserva('booked')).toBe(true);
    expect(puedeRegistrarEntradaReserva('no_show')).toBe(true);
  });

  it('ya asistió, cancelada, estado desconocido o clase cancelada: no', () => {
    expect(puedeRegistrarEntradaReserva('checked_in')).toBe(false);
    expect(puedeRegistrarEntradaReserva('cancelled')).toBe(false);
    expect(puedeRegistrarEntradaReserva(undefined)).toBe(false);
    expect(puedeRegistrarEntradaReserva('booked', true)).toBe(false);
  });
});

describe('respuesta de la base → contrato', () => {
  const permitida = {
    aviso: null,
    motivo: null,
    reserva: { id: 1, estado: 'checked_in' },
    repetida: false,
    membresia: { id: 18, plan: 'Plan mensual', desde: '2026-09-28T21:10:34+00:00', hasta: '2026-10-19T21:10:34+00:00', codigo: null, estado: 'active', grace_until: null },
    permitido: true,
    checkin_id: 5,
    dias_gracia: null,
  };

  it('permitida: marca la reserva y trae la membresía usada', () => {
    const r = mapearResultadoCheckin(permitida);
    expect(r).toMatchObject({ permitido: true, checkinId: 5, repetida: false, reserva: { id: 1, estado: 'checked_in' } });
    expect(r.membresia).toMatchObject({ id: 18, estado: 'active', plan: 'Plan mensual', graceUntil: null });
    expect(avisoEntradaReserva(r)).toBe('permitida');
  });

  it('segundo clic: la misma entrada, sin duplicar (repetida)', () => {
    const r = mapearResultadoCheckin({ ...permitida, repetida: true });
    expect(r.repetida).toBe(true);
    expect(r.checkinId).toBe(5);
    expect(avisoEntradaReserva(r)).toBe('repetida');
  });

  it('rechazada (vencida): el motivo viaja y la reserva queda como estaba', () => {
    const r = mapearResultadoCheckin({ ...permitida, permitido: false, motivo: 'vencida', reserva: { id: 2, estado: 'booked' } });
    expect(r).toMatchObject({ permitido: false, motivo: 'vencida', reserva: { id: 2, estado: 'booked' } });
    expect(avisoEntradaReserva(r)).toBe('rechazada');
  });

  it('en gracia: entra con aviso y los días que le quedan', () => {
    const r = mapearResultadoCheckin({ ...permitida, aviso: 'en_gracia', dias_gracia: 2 });
    expect(r.diasGracia).toBe(2);
    expect(avisoEntradaReserva(r)).toBe('permitida_con_aviso');
  });

  it('sin membresía: no hay membresía ni reserva marcada', () => {
    const r = mapearResultadoCheckin({ permitido: false, motivo: 'sin_membresia', checkin_id: 9, membresia: null, reserva: { id: 3, estado: 'booked' } });
    expect(r.membresia).toBeNull();
    expect(r.permitido).toBe(false);
  });

  it('respuesta vacía o inesperada: nunca «permitido» por defecto', () => {
    expect(mapearResultadoCheckin(null)).toMatchObject({ permitido: false, repetida: false, reserva: null, membresia: null });
    expect(mapearResultadoCheckin({ permitido: 'true' }).permitido).toBe(false);
  });
});

describe('errores de la RPC → HTTP', () => {
  it('reserva de otra organización o inexistente: 404 (no se revela que existe)', () => {
    expect(estadoErrorRpc({ message: 'reserva_no_encontrada', code: 'P0002' })).toEqual({ codigo: 'reserva_no_encontrada', estado: 404 });
  });

  it('reglas de la reserva: 422 con su código', () => {
    for (const codigo of ['reserva_de_otro_miembro', 'reserva_cancelada', 'clase_cancelada', 'sucursal_invalida']) {
      expect(estadoErrorRpc({ message: codigo, code: '22023' })).toEqual({ codigo, estado: 422 });
    }
  });

  it('sin permiso: 403 (por código o por 42501 de la guarda de organización)', () => {
    expect(estadoErrorRpc({ message: 'sin_permiso', code: '42501' }).estado).toBe(403);
    expect(estadoErrorRpc({ message: 'Acceso denegado a la organización', code: '42501' })).toEqual({ codigo: 'sin_permiso', estado: 403 });
  });

  it('cualquier otro error: 500 genérico (no se filtra el mensaje de la base)', () => {
    expect(estadoErrorRpc({ message: 'relation "x" does not exist', code: '42P01' })).toEqual({ codigo: 'error_interno', estado: 500 });
    expect(estadoErrorRpc(null)).toEqual({ codigo: 'error_interno', estado: 500 });
  });

  it('los códigos nuevos están en la lista que la interfaz traduce', () => {
    for (const c of ['reserva_no_encontrada', 'reserva_de_otro_miembro', 'reserva_cancelada', 'clase_cancelada', 'importacion_sin_filas', 'importacion_demasiadas_filas']) {
      expect(ERRORES_MEMBRESIAS).toContain(c);
    }
  });
});
