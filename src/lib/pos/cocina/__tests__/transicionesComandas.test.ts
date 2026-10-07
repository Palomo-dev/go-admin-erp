/**
 * Comandas: un paso a la vez. La flecha, el botón principal y el soltar del
 * arrastre usan las mismas reglas (`siguienteColumna`, `validarMovimiento`).
 *
 * Caso real (org 140): una comanda de la Carta QR con una sola línea pasó de
 * «Nuevas» a «Listas para servir» porque tocar el ítem en «Nuevas» lo marcaba
 * hecho (`pending` → `ready`). Estas pruebas fijan que eso ya no ocurre.
 */
import {
  accionPrincipal,
  aplicarEstadoLocal,
  aplicarItemLocal,
  columnaAnterior,
  columnaDe,
  puedeMarcarItem,
  siguienteColumna,
  validarMovimiento,
  type ComandaTablero,
} from '../tableroComandas';
import { errorDeRpcCocina } from '../rutasCocina';

const T0 = '2026-10-07T16:52:41.000Z';
const OPERA = { operar: true, gestionar: false };
const GESTIONA = { operar: true, gestionar: true };

/** Una comanda web de una sola línea, recién confirmada (como la del reporte). */
function comandaWebUnaLinea(): ComandaTablero {
  return {
    id: 277,
    status: 'new',
    created_at: T0,
    source: 'web',
    web_order_id: 'pedido-web',
    kitchen_ticket_items: [{ id: 377, station: 'all', status: 'pending' }],
  };
}

describe('Comandas — la flecha avanza un solo paso', () => {
  it('el siguiente paso es siempre el inmediato', () => {
    expect(siguienteColumna('new')).toBe('preparing');
    expect(siguienteColumna('preparing')).toBe('ready');
    expect(siguienteColumna('ready')).toBe('delivered');
    expect(siguienteColumna('delivered')).toBeNull();
    expect(siguienteColumna(null)).toBeNull();
  });

  it('una comanda de una sola línea pasa por «En preparación» antes de quedar lista', () => {
    const ahora = '2026-10-07T16:54:06.000Z';
    let c = comandaWebUnaLinea();
    const recorrido: Array<string | null> = [columnaDe(c, 'todas')];
    for (let paso = 0; paso < 3; paso++) {
      const col = columnaDe(c, 'todas');
      const accion = accionPrincipal(col);
      expect(accion).toBe(siguienteColumna(col));
      c = aplicarEstadoLocal(c, accion!, null, ahora);
      recorrido.push(columnaDe(c, 'todas'));
    }
    expect(recorrido).toEqual(['new', 'preparing', 'ready', 'delivered']);
  });

  it('un ítem sin empezar no se puede marcar hecho (era la causa del salto)', () => {
    const c = comandaWebUnaLinea();
    const item = c.kitchen_ticket_items![0];
    expect(puedeMarcarItem(item)).toBe(false);
    // Lo que hacía el toque antes: la comanda quedaba «ready» sin pasar por «preparing».
    expect(columnaDe(aplicarItemLocal(c, item.id, true, T0), 'todas')).toBe('ready');
    // Ya empezado, sí se marca y se desmarca.
    expect(puedeMarcarItem({ status: 'in_progress' })).toBe(true);
    expect(puedeMarcarItem({ status: 'ready' })).toBe(true);
    expect(puedeMarcarItem({ status: 'ready', cancelled_at: T0 })).toBe(false);
    expect(puedeMarcarItem({ status: 'delivered' })).toBe(false);
  });

  it('la base responde `comanda_sin_empezar` como un 409 legible, no como error interno', () => {
    expect(errorDeRpcCocina({ code: 'P0001', message: 'comanda_sin_empezar' })).toEqual({ status: 409, codigo: 'comanda_sin_empezar' });
  });
});

describe('Comandas — movimientos del arrastre', () => {
  it('avanzar un paso es válido y manda el estado siguiente', () => {
    expect(validarMovimiento('new', 'preparing', OPERA)).toEqual({ ok: true, sentido: 'avanzar', estado: 'preparing' });
    expect(validarMovimiento('preparing', 'ready', OPERA)).toEqual({ ok: true, sentido: 'avanzar', estado: 'ready' });
    expect(validarMovimiento('ready', 'delivered', OPERA)).toEqual({ ok: true, sentido: 'avanzar', estado: 'delivered' });
  });

  it('saltar pasos se rechaza', () => {
    expect(validarMovimiento('new', 'ready', GESTIONA)).toEqual({ ok: false, motivo: 'un_paso' });
    expect(validarMovimiento('new', 'delivered', GESTIONA)).toEqual({ ok: false, motivo: 'un_paso' });
    expect(validarMovimiento('preparing', 'delivered', GESTIONA)).toEqual({ ok: false, motivo: 'un_paso' });
  });

  it('retroceder solo existe de «En preparación» a «Nuevas» y exige gestionar', () => {
    expect(columnaAnterior('preparing')).toBe('new');
    expect(columnaAnterior('ready')).toBeNull();
    expect(validarMovimiento('preparing', 'new', GESTIONA)).toEqual({ ok: true, sentido: 'retroceder', estado: 'new' });
    expect(validarMovimiento('preparing', 'new', OPERA)).toEqual({ ok: false, motivo: 'sin_permiso' });
    expect(validarMovimiento('ready', 'preparing', GESTIONA)).toEqual({ ok: false, motivo: 'un_paso' });
    expect(validarMovimiento('delivered', 'ready', GESTIONA)).toEqual({ ok: false, motivo: 'un_paso' });
  });

  it('soltar en la misma columna o sin permiso para operar no mueve nada', () => {
    expect(validarMovimiento('new', 'new', OPERA)).toEqual({ ok: false, motivo: 'misma_columna' });
    expect(validarMovimiento('new', 'preparing', { operar: false, gestionar: false })).toEqual({ ok: false, motivo: 'sin_permiso' });
    expect(validarMovimiento(null, 'preparing', OPERA)).toEqual({ ok: false, motivo: 'no_arrastrable' });
  });
});
