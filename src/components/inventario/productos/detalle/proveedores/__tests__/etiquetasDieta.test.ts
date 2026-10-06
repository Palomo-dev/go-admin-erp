import { chipsDeKind, esKindCarta, SUGERENCIAS_KIND } from '../etiquetasDieta';

describe('etiquetas de dieta y alérgenos para la Carta QR', () => {
  const etiquetas = [
    { id: 1, name: 'Vegano', color: null, kind: 'dieta' },
    { id: 2, name: 'Lácteos', color: null, kind: null },
    { id: 3, name: 'Sin gluten', color: null, kind: 'alergeno' },
    { id: 4, name: 'Keto', color: null, kind: 'dieta' },
  ];

  it('dieta: las propias primero (marcadas si están asignadas) y luego las sugerencias que faltan', () => {
    const chips = chipsDeKind('dieta', etiquetas, [1]);
    expect(chips.slice(0, 2)).toEqual([
      { nombre: 'Keto', id: 4, marcada: false, cambiaKind: false },
      { nombre: 'Vegano', id: 1, marcada: true, cambiaKind: false },
    ]);
    const nombres = chips.map((c) => c.nombre);
    expect(nombres).toContain('Vegetariano');
    // «Sin gluten» ya es de otro grupo de la carta: no se repite aquí.
    expect(nombres).not.toContain('Sin gluten');
    expect(nombres.filter((n) => n === 'Vegano')).toHaveLength(1);
  });

  it('alérgenos: una etiqueta sin kind se ofrece para marcarle el kind, aunque ya esté asignada', () => {
    const lacteos = chipsDeKind('alergeno', etiquetas, [2]).find((c) => c.nombre === 'Lácteos');
    expect(lacteos).toEqual({ nombre: 'Lácteos', id: 2, marcada: false, cambiaKind: true });
    const mani = chipsDeKind('alergeno', etiquetas, []).find((c) => c.nombre === 'Maní');
    expect(mani).toEqual({ nombre: 'Maní', id: null, marcada: false, cambiaKind: false });
  });

  it('kinds válidos sin tilde (CHECK product_tags_kind_valido)', () => {
    expect(esKindCarta('alergeno')).toBe(true);
    expect(esKindCarta('alérgeno')).toBe(false);
    expect(esKindCarta('general')).toBe(false);
    expect(SUGERENCIAS_KIND.picante).toEqual(['Picante']);
  });
});
