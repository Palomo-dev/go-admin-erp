/** Lote de guardado del detalle de una carta (Figma B/13-02: «Guarda en un solo lote»). */
import { conCambioSede, contarCambiosCarta, loteDe, type BorradorCarta } from '../useCarta';

jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 120 }));

const base: BorradorCarta = {
  nombre: 'Almuerzo',
  horario: { '1': [{ from: '12:00', to: '15:30' }] },
  sedes: null,
  pdfUrl: null,
  categorias: [
    {
      id: 10,
      nombre: 'Entradas',
      productos: [
        { id: 1, nombre: 'Empanadas', precio: 9500, etiquetas: [], destacado: false, oculto: false, orden: null },
        { id: 2, nombre: 'Patacón', precio: 12000, etiquetas: [], destacado: false, oculto: false, orden: null },
      ],
    },
    { id: 20, nombre: 'Platos fuertes', productos: [] },
  ],
};

describe('loteDe', () => {
  it('sin cambios no manda nada', () => {
    expect(loteDe(base, base)).toEqual({});
    expect(contarCambiosCarta(base, base)).toBe(0);
  });

  it('manda solo lo que cambió: horario, sedes, orden de categorías y excepciones', () => {
    const actual: BorradorCarta = {
      ...base,
      horario: { ...base.horario, '6': [{ from: '12:00', to: '16:00' }] },
      sedes: [1],
      categorias: [
        { ...base.categorias[1] },
        { ...base.categorias[0], productos: [{ ...base.categorias[0].productos[0], destacado: true }, base.categorias[0].productos[1]] },
      ],
    };
    const lote = loteDe(base, actual);
    expect(Object.keys(lote).sort()).toEqual(['categorias', 'excepciones', 'horario', 'sedes']);
    expect(lote.categorias).toEqual([20, 10]);
    expect(lote.excepciones?.find((e) => e.productoId === 1)).toEqual({ productoId: 1, destacado: true, oculto: false, orden: null });
    expect(contarCambiosCarta(base, actual)).toBe(4);
  });
});

describe('«Por sede» en el mismo lote', () => {
  it('suma los cambios de cada sede al lote y a la cuenta de la barra', () => {
    let actual = conCambioSede(base, 2, 1, { is_listed: false });
    actual = conCambioSede(actual, 2, 1, { web_price: 9000 });
    actual = conCambioSede(actual, 3, 2, { is_sold_out: true });
    const lote = loteDe(base, actual);
    expect(Object.keys(lote)).toEqual(['porSede']);
    expect(lote.porSede).toEqual([
      { branch_id: 2, cambios: [{ product_id: 1, is_listed: false, web_price: 9000 }] },
      { branch_id: 3, cambios: [{ product_id: 2, is_sold_out: true }] },
    ]);
    expect(contarCambiosCarta(base, actual)).toBe(2);
  });
});
