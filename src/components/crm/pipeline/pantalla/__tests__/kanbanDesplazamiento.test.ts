/**
 * @jest-environment jsdom
 */
import { bordesOcultos, esBarraHorizontal, esControlDeTarjeta, esZonaDeTarjeta, scrollTrasArrastre, sentidoAvance } from '../kanbanDesplazamiento';
import { recargaDeTablero } from '../tableroPipelineLogica';

describe('desplazamiento horizontal del kanban', () => {
  test('el borde derecho avanza y el centro no', () => {
    expect(sentidoAvance(950, 0, 1000)).toBe(1);
    expect(sentidoAvance(40, 0, 1000)).toBe(-1);
    expect(sentidoAvance(400, 0, 1000)).toBe(0);
    expect(sentidoAvance(10, 0, 100)).toBe(0);
  });

  test('arrastrar el lienzo hacia la izquierda corre las etapas de la derecha', () => {
    expect(scrollTrasArrastre(120, 400, 280)).toBe(240);
  });

  test('una tarjeta o un botón no arrastran el lienzo', () => {
    document.body.innerHTML = '<div data-kanban-tarjeta=""><button id="b">x</button><span id="c">tarjeta</span></div><div id="vacio"></div>';
    expect(esZonaDeTarjeta(document.getElementById('c'))).toBe(true);
    expect(esZonaDeTarjeta(document.getElementById('b'))).toBe(true);
    expect(esZonaDeTarjeta(document.getElementById('vacio'))).toBe(false);
    expect(esControlDeTarjeta(document.getElementById('b'))).toBe(true);
    expect(esControlDeTarjeta(document.getElementById('c'))).toBe(false);
  });

  test('la barra horizontal del lienzo no se captura', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetHeight', { value: 400 });
    Object.defineProperty(el, 'clientHeight', { value: 384 });
    el.getBoundingClientRect = () => ({ top: 0, bottom: 400, left: 0, right: 800, width: 800, height: 400, x: 0, y: 0, toJSON: () => ({}) });
    expect(esBarraHorizontal(el, 390)).toBe(true);
    expect(esBarraHorizontal(el, 200)).toBe(false);
  });
});

describe('recarga del tablero al cambiar de etapa', () => {
  test('mover, ganar y perder no recargan el tablero', () => {
    expect(recargaDeTablero('mover')).toBe('silenciosa');
    expect(recargaDeTablero('ganar')).toBe('silenciosa');
    expect(recargaDeTablero('perder')).toBe('silenciosa');
  });

  test('crear, borrar o cambiar etapas sí recargan', () => {
    expect(recargaDeTablero('crear')).toBe('completa');
    expect(recargaDeTablero('eliminar')).toBe('completa');
    expect(recargaDeTablero('etapas')).toBe('completa');
    expect(recargaDeTablero(undefined)).toBe('completa');
  });
});

describe('bordesOcultos', () => {
  test('sin desborde no hay nada oculto: el lienzo no muestra la mano', () => {
    expect(bordesOcultos(0, 800, 800)).toEqual({ izquierda: false, derecha: false });
  });

  test('al inicio solo queda oculto lo de la derecha', () => {
    expect(bordesOcultos(0, 2400, 800)).toEqual({ izquierda: false, derecha: true });
  });

  test('en medio, ambos lados; al final, solo la izquierda', () => {
    expect(bordesOcultos(600, 2400, 800)).toEqual({ izquierda: true, derecha: true });
    expect(bordesOcultos(1600, 2400, 800)).toEqual({ izquierda: true, derecha: false });
  });

  test('tolera el redondeo de medio píxel del navegador', () => {
    expect(bordesOcultos(1599.5, 2400, 800)).toEqual({ izquierda: true, derecha: false });
  });
});
