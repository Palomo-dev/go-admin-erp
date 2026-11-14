import { scrollParaMostrar, scrollPorRueda } from '../desplazamientoHorizontal';

const m = (izquierda: number) => ({ izquierda, ancho: 900, visible: 300 });

describe('Pestañas que no caben: desplazamiento horizontal', () => {
  test('la rueda vertical mueve la barra mientras le quede recorrido', () => {
    expect(scrollPorRueda({ x: 0, y: 100 }, m(0))).toBe(100);
    expect(scrollPorRueda({ x: 0, y: -100 }, m(250))).toBe(150);
    expect(scrollPorRueda({ x: 0, y: 500 }, m(400))).toBe(600);
  });

  test('en el borde, o si todo cabe, la página sigue con su scroll vertical', () => {
    expect(scrollPorRueda({ x: 0, y: 100 }, m(600))).toBeNull();
    expect(scrollPorRueda({ x: 0, y: -100 }, m(0))).toBeNull();
    expect(scrollPorRueda({ x: 0, y: 100 }, { izquierda: 0, ancho: 300, visible: 300 })).toBeNull();
  });

  test('el gesto horizontal del trackpad lo resuelve el navegador', () => {
    expect(scrollPorRueda({ x: 80, y: 10 }, m(100))).toBeNull();
  });

  test('la pestaña activa se trae a la vista, incluida la última', () => {
    expect(scrollParaMostrar({ izquierda: 820, ancho: 80 }, m(0))).toBe(600);
    expect(scrollParaMostrar({ izquierda: 50, ancho: 80 }, m(200))).toBe(34);
    expect(scrollParaMostrar({ izquierda: 100, ancho: 80 }, m(0))).toBeNull();
  });
});
