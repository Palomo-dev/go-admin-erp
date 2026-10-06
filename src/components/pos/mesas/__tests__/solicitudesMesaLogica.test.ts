import {
  aSolicitudMesa,
  aplicarEvento,
  deLaSede,
  resumenPorMesa,
  type FilaSolicitudMesa,
  type SolicitudMesa,
} from '../solicitudes/solicitudesMesaLogica';

const fila = (p: Partial<FilaSolicitudMesa> = {}): FilaSolicitudMesa => ({
  id: 's1',
  organization_id: 140,
  branch_id: 115,
  restaurant_table_id: 'm7',
  table_session_id: 'ses',
  kind: 'waiter',
  reason: null,
  status: 'open',
  created_at: '2026-10-06T20:00:00Z',
  ...p,
});

describe('solicitudes de la Carta QR en POS › Mesas', () => {
  it('lee la fila y protege tipos y estados desconocidos', () => {
    expect(aSolicitudMesa(fila({ kind: 'bill' })).tipo).toBe('bill');
    expect(aSolicitudMesa(fila({ kind: 'raro' })).tipo).toBe('waiter');
    expect(aSolicitudMesa(fila({ status: 'x' })).estado).toBe('open');
    expect(aSolicitudMesa(fila({ reason: '   ' })).motivo).toBeNull();
    expect(aSolicitudMesa(fila({ reason: ' Más agua ' })).motivo).toBe('Más agua');
    expect(aSolicitudMesa(fila({ reason: 'x'.repeat(500) })).motivo).toHaveLength(200);
  });

  it('el tiempo real inserta en orden, actualiza y quita la atendida', () => {
    const a = aSolicitudMesa(fila({ id: 'a', created_at: '2026-10-06T20:05:00Z' }));
    const b = aSolicitudMesa(fila({ id: 'b', created_at: '2026-10-06T20:01:00Z' }));
    let lista: SolicitudMesa[] = aplicarEvento([], { tipo: 'INSERT', solicitud: a });
    lista = aplicarEvento(lista, { tipo: 'INSERT', solicitud: b });
    expect(lista.map((s) => s.id)).toEqual(['b', 'a']);
    lista = aplicarEvento(lista, { tipo: 'UPDATE', solicitud: { ...a, estado: 'ack' } });
    expect(lista.find((s) => s.id === 'a')?.estado).toBe('ack');
    lista = aplicarEvento(lista, { tipo: 'UPDATE', solicitud: { ...b, estado: 'done' } });
    expect(lista.map((s) => s.id)).toEqual(['a']);
    lista = aplicarEvento(lista, { tipo: 'DELETE', solicitud: a });
    expect(lista).toEqual([]);
  });

  it('un evento repetido no duplica la solicitud', () => {
    const a = aSolicitudMesa(fila({ id: 'a' }));
    const lista = aplicarEvento(aplicarEvento([], { tipo: 'INSERT', solicitud: a }), { tipo: 'INSERT', solicitud: a });
    expect(lista).toHaveLength(1);
  });

  it('resume por mesa: llamadas, cuenta, la más antigua y si alguien ya dijo «Voy»', () => {
    const lista = [
      aSolicitudMesa(fila({ id: '1', created_at: '2026-10-06T20:03:00Z' })),
      aSolicitudMesa(fila({ id: '2', kind: 'bill', status: 'ack', created_at: '2026-10-06T20:01:00Z' })),
      aSolicitudMesa(fila({ id: '3', restaurant_table_id: 'm9', status: 'ack' })),
      aSolicitudMesa(fila({ id: '4', restaurant_table_id: 'm9', status: 'done' })),
    ];
    const r = resumenPorMesa(lista);
    expect(r.get('m7')).toEqual({ mesero: 1, cuenta: true, desde: '2026-10-06T20:01:00Z', sinVer: true });
    expect(r.get('m9')).toEqual({ mesero: 1, cuenta: false, desde: '2026-10-06T20:00:00Z', sinVer: false });
  });

  it('filtra por sede (null = todas)', () => {
    const lista = [aSolicitudMesa(fila({ id: '1' })), aSolicitudMesa(fila({ id: '2', branch_id: 200 }))];
    expect(deLaSede(lista, 115).map((s) => s.id)).toEqual(['1']);
    expect(deLaSede(lista, null)).toHaveLength(2);
  });
});
