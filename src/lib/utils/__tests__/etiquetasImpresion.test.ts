import {
  PLANTILLAS_ETIQUETA,
  cantidadSegunStock,
  contarPaginas,
  distribuirEnPaginas,
  esTrabajoValido,
  etiquetasPorHoja,
  expandirEtiquetas,
  normalizarCantidad,
  normalizarInicio,
  plantillaPorId,
  posicionCasilla,
  tamanoPagina,
  textoVariante,
  totalEtiquetas,
  MAX_ETIQUETAS,
  CAMPOS_POR_DEFECTO,
} from '../etiquetasImpresion';

const carta = plantillaPorId('carta-3x8');
const a4 = plantillaPorId('a4-3x8');
const rollo = plantillaPorId('rollo-50x25');

describe('plantillas', () => {
  it('las del diseño: carta 63,5 × 33,9 y A4 70 × 37 a 24 por hoja; rollo 50 × 25', () => {
    expect(etiquetasPorHoja(carta)).toBe(24);
    expect([carta.anchoMm, carta.altoMm]).toEqual([63.5, 33.9]);
    expect(etiquetasPorHoja(a4)).toBe(24);
    expect([a4.anchoMm, a4.altoMm]).toEqual([70, 37]);
    expect(etiquetasPorHoja(rollo)).toBe(1);
    expect(tamanoPagina(rollo)).toEqual({ anchoMm: 50, altoMm: 25 });
    expect(tamanoPagina(a4)).toEqual({ anchoMm: 210, altoMm: 297 });
  });

  it('la rejilla cabe en su hoja', () => {
    for (const p of PLANTILLAS_ETIQUETA.filter((x) => x.tipo === 'hoja')) {
      const hoja = tamanoPagina(p);
      const ultima = posicionCasilla(p, etiquetasPorHoja(p) - 1);
      expect(ultima.xMm + p.anchoMm).toBeLessThanOrEqual(hoja.anchoMm + 0.01);
      expect(ultima.yMm + p.altoMm).toBeLessThanOrEqual(hoja.altoMm + 0.01);
    }
  });

  it('id desconocido cae en la primera plantilla', () => {
    expect(plantillaPorId('no-existe').id).toBe(PLANTILLAS_ETIQUETA[0].id);
  });
});

describe('cantidad según stock', () => {
  it('una etiqueta por unidad, sin negativos ni fracciones', () => {
    expect(cantidadSegunStock(12)).toBe(12);
    expect(cantidadSegunStock(3.7)).toBe(3);
    expect(cantidadSegunStock(-4)).toBe(0);
    expect(cantidadSegunStock(0)).toBe(0);
  });

  it('sin inventario (servicio o sin dato) → 1', () => {
    expect(cantidadSegunStock(50, false)).toBe(1);
    expect(cantidadSegunStock(null)).toBe(1);
    expect(cantidadSegunStock(undefined)).toBe(1);
  });

  it('normaliza lo escrito a mano y respeta el tope', () => {
    expect(normalizarCantidad('2,9')).toBe(2);
    expect(normalizarCantidad('abc')).toBe(0);
    expect(normalizarCantidad(-3)).toBe(0);
    expect(normalizarCantidad(MAX_ETIQUETAS + 10)).toBe(MAX_ETIQUETAS);
    expect(totalEtiquetas([2, 2, 6, 1])).toBe(11);
  });
});

describe('reparto en hojas', () => {
  it('24 etiquetas en carta desde la casilla 1: una hoja', () => {
    expect(contarPaginas(24, carta, 1)).toBe(1);
    const paginas = distribuirEnPaginas(Array.from({ length: 24 }, (_, i) => i), carta, 1);
    expect(paginas).toHaveLength(1);
    expect(paginas[0]).toHaveLength(24);
    expect(paginas[0].every((c) => c !== null)).toBe(true);
  });

  it('empezar en la casilla 5 deja 4 huecos y empuja a una segunda hoja', () => {
    expect(contarPaginas(24, carta, 5)).toBe(2);
    const paginas = distribuirEnPaginas(Array.from({ length: 24 }, (_, i) => i), carta, 5);
    expect(paginas[0].slice(0, 4)).toEqual([null, null, null, null]);
    expect(paginas[0][4]).toBe(0);
    expect(paginas[1].filter((c) => c !== null)).toHaveLength(4);
    expect(paginas[1]).toHaveLength(24);
  });

  it('la casilla de inicio se acota a la hoja; en rollo no aplica', () => {
    expect(normalizarInicio(carta, 0)).toBe(1);
    expect(normalizarInicio(carta, 99)).toBe(24);
    expect(normalizarInicio(rollo, 7)).toBe(1);
  });

  it('rollo: una etiqueta por página', () => {
    expect(contarPaginas(3, rollo, 9)).toBe(3);
    expect(distribuirEnPaginas(['a', 'b'], rollo)).toEqual([['a'], ['b']]);
  });

  it('sin etiquetas no hay páginas', () => {
    expect(contarPaginas(0, carta)).toBe(0);
    expect(distribuirEnPaginas([], carta)).toEqual([]);
  });

  it('expande por cantidad en el orden de la lista', () => {
    expect(expandirEtiquetas([{ dato: 'a', cantidad: 2 }, { dato: 'b', cantidad: 0 }, { dato: 'c', cantidad: 1 }])).toEqual(['a', 'a', 'c']);
  });

  it('posición de la casilla en mm', () => {
    expect(posicionCasilla(carta, 0)).toEqual({ xMm: 10.2, yMm: 4.1 });
    const segunda = posicionCasilla(carta, 1);
    expect(segunda.xMm).toBeCloseTo(10.2 + 63.5 + 2.5);
    expect(posicionCasilla(carta, 3).yMm).toBeCloseTo(4.1 + 33.9);
  });
});

describe('datos de la etiqueta', () => {
  it('texto de la variante desde variant_data', () => {
    expect(textoVariante({ Talla: '42', color: 'Negro' })).toBe('Talla 42 · Color Negro');
    expect(textoVariante({})).toBeNull();
    expect(textoVariante(null)).toBeNull();
    expect(textoVariante(['x'])).toBeNull();
  });

  it('valida el trabajo que lee la página de impresión', () => {
    expect(esTrabajoValido({ version: 1, plantillaId: 'carta-3x8', etiquetas: [], campos: CAMPOS_POR_DEFECTO })).toBe(true);
    expect(esTrabajoValido({ version: 2 })).toBe(false);
    expect(esTrabajoValido(null)).toBe(false);
  });
});
