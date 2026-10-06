import {
  agruparPorMesa,
  aplicarEstadoLocal,
  aplicarItemLocal,
  armarTablero,
  columnaDe,
  nivelTiempo,
  numerarRondas,
  objetivoDe,
  type ComandaTablero,
} from '../tableroComandas';
import { estadoComandaSchema, rpcNoDisponible, errorDeRpcCocina } from '../rutasCocina';

const T0 = '2026-10-06T17:00:00.000Z';
const min = (n: number) => new Date(Date.parse(T0) + n * 60_000).toISOString();

function c(p: Partial<ComandaTablero> & { id: number }): ComandaTablero {
  return { status: 'new', created_at: T0, kitchen_ticket_items: [], ...p };
}

describe('Comandas v2 — tablero', () => {
  const cocinaYBar = c({
    id: 1,
    status: 'preparing',
    kitchen_ticket_items: [
      { id: 10, station: 'hot_kitchen', status: 'in_progress' },
      { id: 11, station: 'bar', status: 'ready' },
    ],
  });

  it('el estado es por estación: el bar listo no termina la cocina', () => {
    expect(columnaDe(cocinaYBar, 'bar')).toBe('ready');
    expect(columnaDe(cocinaYBar, 'hot_kitchen')).toBe('preparing');
    expect(columnaDe(cocinaYBar, 'todas')).toBe('preparing');
    expect(columnaDe(cocinaYBar, 'cold_kitchen')).toBeNull();
  });

  it('una comanda cancelada no aparece en ninguna columna', () => {
    expect(columnaDe({ ...cocinaYBar, status: 'cancelled' }, 'todas')).toBeNull();
  });

  it('semáforo: atención desde el 80 % del objetivo y crítico al pasarlo', () => {
    expect(nivelTiempo(11, 15)).toBe('normal');
    expect(nivelTiempo(12, 15)).toBe('atencion');
    expect(nivelTiempo(15, 15)).toBe('critico');
  });

  it('el objetivo lo marcan las estaciones que aún tienen trabajo', () => {
    expect(objetivoDe(cocinaYBar, 'todas')).toBe(15);
    expect(objetivoDe(cocinaYBar, 'bar')).toBe(5);
  });

  it('demoradas primero en su columna y contadores por estación', () => {
    const vieja = c({ id: 2, created_at: min(0), kitchen_ticket_items: [{ id: 20, station: 'hot_kitchen', status: 'pending' }] });
    const nueva = c({ id: 3, created_at: min(-30), kitchen_ticket_items: [{ id: 30, station: 'hot_kitchen', status: 'pending' }] });
    const t = armarTablero([vieja, nueva, cocinaYBar], { estacion: 'todas', ahora: new Date(min(10)) });
    expect(t.columnas.new.map((x) => x.id)).toEqual([3, 2]);
    expect(t.porEstacion.todas).toBe(3);
    expect(t.porEstacion.hot_kitchen).toBe(3);
    expect(t.porEstacion.bar).toBe(1);
    expect(t.demoradas).toBe(1);
  });

  it('rondas numeradas por cuenta y agrupado por mesa con la ronda pendiente más antigua', () => {
    const r1 = c({ id: 5, status: 'delivered', table_session_id: 'm4', created_at: min(0), kitchen_ticket_items: [{ id: 50, status: 'delivered' }] });
    const r2 = c({ id: 6, status: 'preparing', table_session_id: 'm4', created_at: min(5), kitchen_ticket_items: [{ id: 60, status: 'in_progress' }] });
    const aj = c({ id: 7, ticket_type: 'adjustment', table_session_id: 'm4', created_at: min(6), kitchen_ticket_items: [{ id: 70, status: 'pending' }] });
    const rondas = numerarRondas([r2, aj, r1]);
    expect(rondas.get(5)).toBe(1);
    expect(rondas.get(6)).toBe(2);
    expect(rondas.has(7)).toBe(false);
    const grupos = agruparPorMesa([r1, r2, aj], 'todas');
    expect(grupos).toHaveLength(1);
    expect(grupos[0].pendiente?.id).toBe(6);
  });

  it('actualización optimista: empezar una estación y tocar el último ítem derivan como la base', () => {
    const empezada = aplicarEstadoLocal(c({ id: 8, kitchen_ticket_items: [{ id: 80, station: 'hot_kitchen', status: 'pending' }, { id: 81, station: 'bar', status: 'pending' }] }), 'preparing', 'bar', T0);
    expect(empezada.status).toBe('preparing');
    expect(empezada.kitchen_ticket_items?.find((i) => i.id === 80)?.status).toBe('pending');
    const lista = aplicarItemLocal(aplicarItemLocal(empezada, 81, true, T0), 80, true, T0);
    expect(lista.status).toBe('ready');
    expect(lista.ready_at).toBe(T0);
  });
});

describe('Comandas v2 — contratos de las rutas', () => {
  it('estado: la estación es una clave, nunca texto libre', () => {
    expect(estadoComandaSchema.safeParse({ ticket_id: 1, estado: 'ready', station: 'hot_kitchen' }).success).toBe(true);
    expect(estadoComandaSchema.safeParse({ ticket_id: 1, estado: 'ready', station: 'Cocina caliente' }).success).toBe(false);
    expect(estadoComandaSchema.safeParse({ ticket_id: 1, estado: 'cancelled' }).success).toBe(false);
    expect(estadoComandaSchema.safeParse({ ticket_id: 1, estado: 'ready', organization_id: 9 }).success).toBe(false);
  });

  it('sin la migración aplicada la ruta lo detecta y el cliente usa el camino anterior', () => {
    expect(rpcNoDisponible({ code: 'PGRST202', message: 'Could not find the function' })).toBe(true);
    expect(rpcNoDisponible({ code: '42501', message: 'sin_membresia' })).toBe(false);
    expect(errorDeRpcCocina({ code: 'P0001', message: 'comanda_cancelada' })).toEqual({ status: 409, codigo: 'comanda_cancelada' });
  });
});
