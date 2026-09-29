/**
 * Etiquetas de peso variable (PRODUCTOS-POR-PESO-BASCULA.md §2.7, fase 4):
 * los dos formatos (peso y precio embebido), dígito de control malo, el
 * prefijo 20 del generador interno y el PLU inexistente.
 */
import {
  construirEtiquetaPeso,
  csvExportarPlu,
  decodificarEtiquetaPeso,
  digitoControlValor,
  FORMATO_ETIQUETA_RECOMENDADO,
  formatoDesdeFila,
  formatoEtiquetaValido,
  lineaDesdeEtiqueta,
  type EtiquetaPeso,
  type FormatoEtiquetaPeso,
} from '@/lib/pos/etiquetaPeso';
import { digitoControlGs1 } from '@/lib/utils/codigoBarras';

const PESO = FORMATO_ETIQUETA_RECOMENDADO;
const PRECIO: FormatoEtiquetaPeso = { ...PESO, prefijos: ['28'], contenido: 'price' };
const queso = { id: 7, sale_mode: 'weight', qty_decimals: 3, unit_code: 'KG' };
const AHORA = new Date('2026-09-29T15:00:00Z');

function etiqueta(r: ReturnType<typeof decodificarEtiquetaPeso>): EtiquetaPeso {
  if (r.tipo !== 'etiqueta') throw new Error(`se esperaba etiqueta, llegó ${JSON.stringify(r)}`);
  return r.etiqueta;
}

describe('decodificarEtiquetaPeso', () => {
  it('peso embebido (27 · PLU 5 · peso 5 en gramos): 27 00104 00735 → PLU 104, 735 g', () => {
    const codigo = construirEtiquetaPeso(PESO, '27', 104, 735);
    expect(codigo).toBe(`270010400735${digitoControlGs1('270010400735')}`);
    expect(etiqueta(decodificarEtiquetaPeso(codigo, PESO))).toEqual({
      codigo,
      prefijo: '27',
      plu: 104,
      contenido: 'weight',
      valor: 735,
    });
  });

  it('precio embebido (28 · PLU 5 · precio 5): 28 00104 13892 → PLU 104, $ 13.892', () => {
    const codigo = construirEtiquetaPeso(PRECIO, '28', 104, 13892);
    expect(etiqueta(decodificarEtiquetaPeso(codigo, PRECIO))).toMatchObject({ plu: 104, contenido: 'price', valor: 13892 });
  });

  it('dígito de control EAN malo: etiqueta inválida (no se agrega nada)', () => {
    const codigo = construirEtiquetaPeso(PESO, '27', 104, 735);
    const malo = codigo.slice(0, 12) + String((Number(codigo[12]) + 1) % 10);
    expect(decodificarEtiquetaPeso(malo, PESO)).toEqual({ tipo: 'invalida', motivo: 'digito_control' });
  });

  it('prefijo 20 (el del generador interno) nunca es etiqueta de peso', () => {
    const cuerpo = '200010400735';
    const codigo20 = `${cuerpo}${digitoControlGs1(cuerpo)}`;
    expect(decodificarEtiquetaPeso(codigo20, PESO)).toEqual({ tipo: 'no_es_etiqueta' });
    // Ni aunque alguien lo intente configurar: el formato con 20 no es válido.
    expect(formatoEtiquetaValido({ ...PESO, prefijos: ['20'] })).toBe(false);
    expect(decodificarEtiquetaPeso(codigo20, { ...PESO, prefijos: ['20'] })).toEqual({ tipo: 'no_es_etiqueta' });
  });

  it('prefijo ajeno, largo distinto de 13, formato inactivo o sin formato: no es etiqueta', () => {
    const codigo = construirEtiquetaPeso(PESO, '27', 104, 735);
    expect(decodificarEtiquetaPeso(codigo, { ...PESO, prefijos: ['29'] })).toEqual({ tipo: 'no_es_etiqueta' });
    expect(decodificarEtiquetaPeso('7702004003508', PESO)).toEqual({ tipo: 'no_es_etiqueta' });
    expect(decodificarEtiquetaPeso('27001040073', PESO)).toEqual({ tipo: 'no_es_etiqueta' });
    expect(decodificarEtiquetaPeso(codigo, { ...PESO, activo: false })).toEqual({ tipo: 'no_es_etiqueta' });
    expect(decodificarEtiquetaPeso(codigo, null)).toEqual({ tipo: 'no_es_etiqueta' });
  });

  it('PLU de 4 dígitos con dígito de control del valor (4 + 1 + 5)', () => {
    const f: FormatoEtiquetaPeso = { ...PESO, digitosPlu: 4, digitoControlValor: true };
    const codigo = construirEtiquetaPeso(f, '27', 104, 14685);
    expect(codigo.slice(2, 12)).toBe('0104614685');
    expect(etiqueta(decodificarEtiquetaPeso(codigo, f))).toMatchObject({ plu: 104, valor: 14685 });
  });

  it('dígito de control del valor malo: inválida aunque el EAN cuadre', () => {
    const f: FormatoEtiquetaPeso = { ...PESO, digitosPlu: 4, digitoControlValor: true };
    const cuerpo = '270104' + '5' + '14685'; // el correcto es 6
    const codigo = `${cuerpo}${digitoControlGs1(cuerpo)}`;
    expect(decodificarEtiquetaPeso(codigo, f)).toEqual({ tipo: 'invalida', motivo: 'digito_valor' });
  });
});

describe('digitoControlValor (GS1 7.9.3)', () => {
  it('ejemplos de la especificación: 2875 → 9 y 14685 → 6', () => {
    expect(digitoControlValor('2875')).toBe(9);
    expect(digitoControlValor('14685')).toBe(6);
  });
  it('6 dígitos o texto no numérico: sin dígito de control', () => {
    expect(digitoControlValor('123456')).toBeNull();
    expect(digitoControlValor('12a4')).toBeNull();
  });
});

describe('formatoEtiquetaValido y formatoDesdeFila', () => {
  it('la suma debe dar 12 dígitos antes del de control', () => {
    expect(formatoEtiquetaValido(PESO)).toBe(true);
    expect(formatoEtiquetaValido({ ...PESO, digitosValor: 6 })).toBe(false);
    expect(formatoEtiquetaValido({ ...PESO, digitosPlu: 4, digitosValor: 6 })).toBe(true);
  });
  it('fila desactivada o sin prefijos: sin formato', () => {
    expect(formatoDesdeFila(null)).toBeNull();
    expect(formatoDesdeFila({ weight_label_enabled: false, weight_label_prefixes: ['27'] })).toBeNull();
    expect(formatoDesdeFila({ weight_label_enabled: true, weight_label_prefixes: [] })).toBeNull();
    expect(
      formatoDesdeFila({
        weight_label_enabled: true,
        weight_label_prefixes: ['27'],
        weight_label_content: 'weight',
        weight_label_plu_digits: 5,
        weight_label_value_digits: 5,
        weight_label_value_check: false,
      }),
    ).toEqual(PESO);
  });
});

describe('lineaDesdeEtiqueta', () => {
  const pesoEt = etiqueta(decodificarEtiquetaPeso(construirEtiquetaPeso(PESO, '27', 104, 735), PESO));
  const precioEt = etiqueta(decodificarEtiquetaPeso(construirEtiquetaPeso(PRECIO, '28', 104, 13892), PRECIO));

  it('peso embebido: 0,735 kg con origen «etiqueta» y el código en notes.pesaje', () => {
    const r = lineaDesdeEtiqueta({ etiqueta: pesoEt, producto: queso, precioPorUnidad: 18900, ahora: AHORA });
    expect(r).toEqual({
      ok: true,
      cantidad: 0.735,
      aviso: null,
      pesaje: {
        origen: 'etiqueta',
        neto: 0.735,
        unidad: 'KG',
        estable: true,
        codigo_etiqueta: pesoEt.codigo,
        leido_en: AHORA.toISOString(),
      },
    });
  });

  it('precio embebido: 13.892 ÷ 18.900 = 0,735 kg; el importe recalculado cuadra y no hay aviso', () => {
    const r = lineaDesdeEtiqueta({ etiqueta: precioEt, producto: queso, precioPorUnidad: 18900, decimalesMoneda: 0, ahora: AHORA });
    expect(r).toMatchObject({ ok: true, cantidad: 0.735, aviso: null, pesaje: { origen: 'etiqueta', importe_etiqueta: 13892 } });
  });

  it('precio embebido con precio vigente distinto al de la balanza: se usa el vigente y se avisa', () => {
    const r = lineaDesdeEtiqueta({ etiqueta: precioEt, producto: queso, precioPorUnidad: 19900, decimalesMoneda: 0 });
    // 13.892 ÷ 19.900 = 0,69809… → 0,698 kg → $ 13.890,20 → $ 13.890 ≠ $ 13.892
    expect(r).toMatchObject({ ok: true, cantidad: 0.698, aviso: { importeEtiqueta: 13892, importeCalculado: 13890 } });
  });

  it('precio embebido sin precio vigente: error, nada se agrega', () => {
    expect(lineaDesdeEtiqueta({ etiqueta: precioEt, producto: queso, precioPorUnidad: null })).toEqual({
      ok: false,
      error: 'sin_precio',
      plu: 104,
    });
  });

  it('PLU inexistente: error con el PLU para el aviso', () => {
    expect(lineaDesdeEtiqueta({ etiqueta: pesoEt, producto: null, precioPorUnidad: null })).toEqual({
      ok: false,
      error: 'plu_inexistente',
      plu: 104,
    });
  });

  it('el PLU es de un producto por unidad: error', () => {
    expect(lineaDesdeEtiqueta({ etiqueta: pesoEt, producto: { sale_mode: 'unit', unit_code: 'UN' }, precioPorUnidad: 5000 })).toMatchObject({
      ok: false,
      error: 'producto_por_unidad',
    });
  });

  it('peso 0 o bajo la venta mínima: error', () => {
    const cero = etiqueta(decodificarEtiquetaPeso(construirEtiquetaPeso(PESO, '27', 104, 0), PESO));
    expect(lineaDesdeEtiqueta({ etiqueta: cero, producto: queso, precioPorUnidad: 18900 })).toMatchObject({ ok: false, error: 'peso_invalido' });
    expect(
      lineaDesdeEtiqueta({ etiqueta: pesoEt, producto: { ...queso, min_sale_qty: 1 }, precioPorUnidad: 18900 }),
    ).toMatchObject({ ok: false, error: 'bajo_minimo', minimo: 1 });
  });

  it('un producto que «exige báscula» sí se vende por etiqueta (no es peso a mano)', () => {
    expect(lineaDesdeEtiqueta({ etiqueta: pesoEt, producto: { ...queso, require_scale: true }, precioPorUnidad: 18900 })).toMatchObject({
      ok: true,
      cantidad: 0.735,
    });
  });

  it('en libras: el valor son milésimas de libra y la unidad LB', () => {
    const r = lineaDesdeEtiqueta({ etiqueta: pesoEt, producto: { ...queso, unit_code: 'LB  ' }, precioPorUnidad: 9000 });
    expect(r).toMatchObject({ ok: true, cantidad: 0.735, pesaje: { unidad: 'LB' } });
  });
});

describe('csvExportarPlu', () => {
  it('«PLU; nombre; precio por kg; tara; días de vida», ordenado por PLU, con coma decimal y nombres escapados', () => {
    const csv = csvExportarPlu(
      [
        { plu: 205, productId: 2, nombre: 'Carne; molida', precioPorUnidad: 32000, unidad: 'KG', tara: 0.015, diasVida: null },
        { plu: 104, productId: 1, nombre: 'Queso "campesino"', precioPorUnidad: 18900, unidad: 'KG', tara: null, diasVida: 7 },
        { plu: 300, productId: 3, nombre: 'Sin precio', precioPorUnidad: null, unidad: 'KG', tara: null, diasVida: null },
      ],
      ['PLU', 'Nombre', 'Precio por kg', 'Tara', 'Días de vida'],
    );
    expect(csv).toBe(
      '\uFEFFPLU;Nombre;Precio por kg;Tara;Días de vida\r\n' +
        '104;"Queso ""campesino""";18900;;7\r\n' +
        '205;"Carne; molida";32000;0,015;\r\n' +
        '300;Sin precio;;;\r\n',
    );
  });

  it('moneda con 2 decimales', () => {
    const csv = csvExportarPlu(
      [{ plu: 1, productId: 1, nombre: 'Cheese', precioPorUnidad: 12.5, unidad: 'LB', tara: null, diasVida: null }],
      ['PLU', 'Name', 'Price', 'Tare', 'Shelf life'],
      2,
    );
    expect(csv.split('\r\n')[1]).toBe('1;Cheese;12,5;;');
  });
});
