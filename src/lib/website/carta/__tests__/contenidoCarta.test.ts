import {
  conCartaPlatos,
  fijarDestacado,
  fijarOculto,
  fijarTexto,
  leerCartaPlatos,
  moverPlato,
  ordenarCarta,
  ordenarPlatos,
  type CartaPlatos,
} from '../contenidoCarta';

const vacia = (): CartaPlatos => ({ orden: {}, ocultos: [], destacados: [], textos: {} });
const platos = [
  { id: 1, category_id: 10 },
  { id: 2, category_id: 10 },
  { id: 3, category_id: 10 },
  { id: 4, category_id: 20 },
];

describe('leerCartaPlatos', () => {
  test('sin contenido o mal formado devuelve la carta vacía (nunca lanza)', () => {
    expect(leerCartaPlatos(undefined)).toEqual(vacia());
    expect(leerCartaPlatos({ carta_platos: 'x' })).toEqual(vacia());
    expect(leerCartaPlatos({ carta_platos: [] })).toEqual(vacia());
  });

  test('limpia ids repetidos o inválidos y URLs que no son https', () => {
    const c = leerCartaPlatos({
      carta_platos: {
        orden: { '10': [3, 3, 'x', -1, 1], basura: [1] },
        ocultos: [2, 2, 0],
        destacados: [1],
        textos: { '1': { descripcion: '  Con ají ', foto_url: 'javascript:alert(1)' }, '2': { foto_url: 'https://cdn/x.jpg' } },
      },
    });
    expect(c).toEqual({
      orden: { '10': [3, 1] },
      ocultos: [2],
      destacados: [1],
      textos: { '1': { descripcion: 'Con ají' }, '2': { foto_url: 'https://cdn/x.jpg' } },
    });
  });
});

describe('orden', () => {
  test('respeta el orden guardado y añade al final los platos nuevos de Inventario', () => {
    expect(ordenarPlatos(platos.slice(0, 3), [3, 1]).map((p) => p.id)).toEqual([3, 1, 2]);
  });

  test('ordenarCarta sigue el orden de categorías y quita ocultos para el cliente', () => {
    const carta = { ...vacia(), orden: { '10': [2, 1, 3] }, ocultos: [1] };
    expect(ordenarCarta(platos, [20, 10], carta).map((g) => [g.categoryId, g.platos.map((p) => p.id)])).toEqual([
      [20, [4]],
      [10, [2, 3]],
    ]);
    expect(ordenarCarta(platos, [10], carta, { incluirOcultos: true })[0].platos.map((p) => p.id)).toEqual([2, 1, 3]);
  });

  test('categorías fuera de la carta no salen', () => {
    expect(ordenarCarta(platos, [20], vacia()).map((g) => g.categoryId)).toEqual([20]);
  });

  test('moverPlato fija el orden visible de su categoría', () => {
    const c = moverPlato(vacia(), 10, [1, 2, 3], 3, 0);
    expect(c.orden).toEqual({ '10': [3, 1, 2] });
  });
});

describe('cambios', () => {
  test('ocultar y destacar son idempotentes', () => {
    let c = fijarOculto(vacia(), 1, true);
    c = fijarOculto(c, 1, true);
    expect(c.ocultos).toEqual([1]);
    expect(fijarOculto(c, 1, false).ocultos).toEqual([]);
    expect(fijarDestacado(vacia(), 2, true).destacados).toEqual([2]);
  });

  test('un texto vacío borra la entrada', () => {
    const c = fijarTexto(vacia(), 1, { descripcion: 'Hola' });
    expect(c.textos).toEqual({ '1': { descripcion: 'Hola' } });
    expect(fijarTexto(c, 1, { descripcion: '' }).textos).toEqual({});
  });

  test('conCartaPlatos no guarda la clave si la carta queda vacía y conserva el resto del contenido', () => {
    expect(conCartaPlatos({ title: 'Carta', carta_platos: { ocultos: [1] } }, vacia())).toEqual({ title: 'Carta' });
    expect(conCartaPlatos({ title: 'Carta' }, fijarOculto(vacia(), 1, true))).toEqual({
      title: 'Carta',
      carta_platos: { orden: {}, ocultos: [1], destacados: [], textos: {} },
    });
  });
});
