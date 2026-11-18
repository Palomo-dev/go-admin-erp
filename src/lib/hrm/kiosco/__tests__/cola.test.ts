import { MAX_LOTE, MAX_REINTENTOS, aplicarResultados, cuerpoLote, encolar, horaServidor, medirDesfase, nuevaMarca, rechazadas, siguienteLote, type MarcaPendiente } from '../cola';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function marca(n: number, minuto: number): MarcaPendiente {
  return nuevaMarca({
    idLocal: ID(n),
    credencial: { tipo: 'pin', valor: '123456' },
    ahoraLocalMs: Date.parse('2026-11-17T13:00:00Z') + minuto * 60_000,
    desfaseMs: 0,
  });
}

describe('cola sin conexión (D7)', () => {
  test('la hora es la del servidor estimada con el desfase medido; la de la tablet queda aparte', () => {
    const m = nuevaMarca({ idLocal: ID(1), credencial: { tipo: 'pin', valor: '123456' }, ahoraLocalMs: Date.parse('2026-11-17T13:00:00Z'), desfaseMs: 90_000 });
    expect(m.hora).toBe('2026-11-17T13:01:30.000Z');
    expect(m.hora_equipo).toBe('2026-11-17T13:00:00.000Z');
    expect(horaServidor(0, Number.NaN)).toBe('1970-01-01T00:00:00.000Z');
  });

  test('el mismo id_local no entra dos veces (idempotencia también en la tablet)', () => {
    let c: MarcaPendiente[] = [];
    c = encolar(c, marca(1, 0));
    c = encolar(c, marca(1, 5));
    c = encolar(c, { ...marca(2, 0), id_local: 'no-es-uuid' });
    expect(c.map((m) => m.id_local)).toEqual([ID(1)]);
  });

  test('el lote va de la más antigua a la más nueva y nunca pasa de 50', () => {
    let c: MarcaPendiente[] = [];
    for (let i = 60; i >= 1; i--) c = encolar(c, marca(i, i));
    const lote = siguienteLote(c);
    expect(lote).toHaveLength(MAX_LOTE);
    expect(lote[0].id_local).toBe(ID(1));
    expect(lote[49].id_local).toBe(ID(50));
    expect(siguienteLote(c, 500)).toHaveLength(MAX_LOTE);
  });

  test('cuerpo del lote: con credencial, horas y fuera_de_linea; sin el contador de intentos', () => {
    const b = cuerpoLote([marca(1, 0)]);
    expect(b.marcas[0]).toEqual({
      id_local: ID(1),
      credencial: { tipo: 'pin', valor: '123456' },
      hora: '2026-11-17T13:00:00.000Z',
      hora_equipo: '2026-11-17T13:00:00.000Z',
      fuera_de_linea: true,
    });
  });

  test('resultados: sale lo resuelto (aceptada, repetida, rechazada…), se reintenta el error y queda lo no enviado', () => {
    const c = [marca(1, 0), marca(2, 1), marca(3, 2), marca(4, 3), marca(5, 4)];
    const r = aplicarResultados(c, [
      { id_local: ID(1), estado: 'aceptada' },
      { id_local: ID(2), estado: 'repetida' },
      { id_local: ID(3), estado: 'rechazada', motivo: 'pin_incorrecto' },
      { id_local: ID(4), estado: 'error' },
    ]);
    expect(r.cola.map((m) => [m.id_local, m.intentos])).toEqual([
      [ID(4), 1],
      [ID(5), 0],
    ]);
    expect(r.resueltas.map((x) => x.estado)).toEqual(['aceptada', 'repetida', 'rechazada']);
    expect(rechazadas(r.resueltas)).toBe(1);
  });

  test('reenviar la misma respuesta no cambia nada (lo resuelto ya salió)', () => {
    const c = [marca(1, 0)];
    const a = aplicarResultados(c, [{ id_local: ID(1), estado: 'aceptada' }]);
    const b = aplicarResultados(a.cola, [{ id_local: ID(1), estado: 'aceptada' }]);
    expect(b.cola).toEqual([]);
    expect(b.resueltas).toEqual([]);
  });

  test('tras demasiados errores seguidos, la marca se descarta y se informa', () => {
    const c = [{ ...marca(1, 0), intentos: MAX_REINTENTOS - 1 }];
    const r = aplicarResultados(c, [{ id_local: ID(1), estado: 'error' }]);
    expect(r.cola).toEqual([]);
    expect(r.descartadas).toHaveLength(1);
  });

  test('desfase: hora del servidor menos el punto medio de la ida y vuelta', () => {
    expect(medirDesfase('2026-11-17T13:00:10.000Z', Date.parse('2026-11-17T13:00:00.000Z'), Date.parse('2026-11-17T13:00:02.000Z'))).toBe(9_000);
    expect(medirDesfase(null, 0, 1)).toBeNull();
    expect(medirDesfase('2026-11-17T13:00:10Z', 10, 5)).toBeNull();
  });
});
