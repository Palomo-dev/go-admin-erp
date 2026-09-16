/**
 * Variantes (tallas, colores, presentaciones) en el contexto del bot.
 * Caso real del 2026-09-15: tenis con tallas "7.5 US … 9.5 US"; el cliente
 * pidio "talla 40" y el bot dijo que no la tenia sin haber visto la lista.
 */
import {
  GUIA_TALLAS,
  esAtributoDeTalla,
  extraerMedidas,
  resumirVariantes,
  type VarianteCatalogo,
} from '../../../supabase/functions/_shared/ai-chat/variantesCatalogo';

const v = (raiz: number, id: number, atributos: Record<string, string> | null, stock: number | null, orden: number, nombre = `Producto ${id}`): VarianteCatalogo =>
  ({ raiz, id, nombre, atributos, stock, precio: 73000, orden });

describe('esAtributoDeTalla', () => {
  it('reconoce tallas de calzado y ropa', () => {
    expect(esAtributoDeTalla('Tamaño', '7.5 US')).toBe(true);
    expect(esAtributoDeTalla('Talla', '40')).toBe(true);
    expect(esAtributoDeTalla('talla', 'XL')).toBe(true);
    expect(esAtributoDeTalla('Talla', '10/12')).toBe(true);
    expect(esAtributoDeTalla('Tallaje', '12')).toBe(true);
  });

  it('no confunde medidas fisicas ni otros atributos con tallas', () => {
    expect(esAtributoDeTalla('Tamaño', '100 ml')).toBe(false);
    expect(esAtributoDeTalla('Tamaño', '12.4 cm')).toBe(false);
    expect(esAtributoDeTalla('Tamaño', '10 x 2 x 7.1 cm')).toBe(false);
    expect(esAtributoDeTalla('Color', '40')).toBe(false);
    expect(esAtributoDeTalla('Capacidad', '10 litros')).toBe(false);
  });
});

describe('resumirVariantes', () => {
  it('lista las tallas con su stock, en orden, bajo el producto padre', () => {
    const r = resumirVariantes([
      v(46984, 46987, { Tamaño: '8.5 US' }, 100, 3),
      v(46984, 46985, { Tamaño: '7.5 US' }, 100, 1),
      v(46984, 46986, { Tamaño: '8 US' }, 0, 2),
    ]);
    expect(r.hayTallas).toBe(true);
    expect(r.porRaiz.get(46984)).toBe('Tamaño disponibles: 7.5 US (100), 8 US (AGOTADA), 8.5 US (100)');
  });

  it('presentaciones que no son tallas no activan la guia', () => {
    const r = resumirVariantes([
      v(1, 2, { Presentación: '100 ml' }, 5, 1),
      v(1, 3, { Presentación: '50 ml' }, null, 2),
    ]);
    expect(r.hayTallas).toBe(false);
    expect(r.porRaiz.get(1)).toBe('Presentación disponibles: 100 ml (5), 50 ml');
  });

  it('varios atributos se muestran juntos', () => {
    const r = resumirVariantes([v(1, 2, { Talla: '8 US', Color: 'Negro' }, 3, 1)]);
    expect(r.porRaiz.get(1)).toBe('Talla / Color disponibles: 8 US / Negro (3)');
    expect(r.hayTallas).toBe(true);
  });

  it('sin atributos usa el nombre de la variante', () => {
    const r = resumirVariantes([v(1, 2, null, 3, 1, 'Camisa - Azul'), v(1, 3, {}, 0, 2, 'Camisa - Roja')]);
    expect(r.porRaiz.get(1)).toBe('Presentaciones: Camisa - Azul (3), Camisa - Roja (AGOTADA)');
  });

  it('recorta y avisa cuando hay mas variantes que el maximo', () => {
    const muchas = Array.from({ length: 35 }, (_, i) => v(1, 100 + i, { Talla: String(20 + i) }, 1, i + 1));
    const r = resumirVariantes(muchas, 30);
    expect(r.porRaiz.get(1)).toContain('… y 5 más');
    expect(r.porRaiz.get(1)).not.toContain('54');
  });

  it('agrupa por raiz aunque las filas lleguen mezcladas', () => {
    const r = resumirVariantes([v(1, 2, { Talla: 'S' }, 1, 1), v(9, 10, { Talla: 'M' }, 1, 1), v(1, 3, { Talla: 'M' }, 1, 2)]);
    expect(r.porRaiz.size).toBe(2);
    expect(r.porRaiz.get(1)).toBe('Talla disponibles: S (1), M (1)');
  });
});

describe('GUIA_TALLAS', () => {
  it('convierte una talla colombiana 40 a la vecindad 8-8.5 US y deja claro que es aproximado', () => {
    expect(GUIA_TALLAS).toContain('8→40');
    expect(GUIA_TALLAS).toContain('8.5→40.5/41');
    expect(GUIA_TALLAS).toMatch(/APROXIMADA/);
    expect(GUIA_TALLAS).toMatch(/INSTRUCCIONES PRINCIPALES traen una tabla propia/);
  });
});

describe('extraerMedidas', () => {
  it('saca las frases con medidas de una descripcion real de hogar', () => {
    const d = 'Caja organizadora de 12 litros, con tapa con manija movible, facilita llevar la caja. Se puede apilar.\n ESPECIFICACIONES \n• Marca: Vanyplas\n• Material: Plástico\n• Medidas: Alto (23 cm) Ancho (24 cm) Largo (35.2 cm)\n• Color: Natural';
    expect(extraerMedidas(d)).toBe('Caja organizadora de 12 litros; Medidas: Alto (23 cm) Ancho (24 cm) Largo (35.2 cm)');
  });

  it('respeta decimales con coma y quita HTML', () => {
    expect(extraerMedidas('<p>Olla de <b>1,5 litros</b>, apta para inducción.</p>')).toBe('Olla de 1,5 litros');
  });

  it('sin medidas devuelve vacio y recorta descripciones largas', () => {
    expect(extraerMedidas('Plato pando cuadrado de loza, apto para microondas.')).toBe('');
    expect(extraerMedidas(null)).toBe('');
    const larga = 'Medidas: ' + Array.from({ length: 40 }, (_, i) => `lado ${i} de ${i + 10} cm`).join(' ');
    const r = extraerMedidas(larga, 80);
    expect(r.length).toBeLessThanOrEqual(80);
    expect(r.endsWith('…')).toBe(true);
  });
});
