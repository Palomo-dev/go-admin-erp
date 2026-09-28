import {
  agruparEan13,
  construirCodigo,
  digitoControlGs1,
  esCode128Valido,
  esEan13Valido,
  esEan8Valido,
  formatoDeCodigo,
  formatoJsBarcode,
  previsualizarCodigos,
  validarCodigoBarras,
  validarPrefijo,
  CONFIG_NUMERACION_POR_DEFECTO,
} from '../codigoBarras';

describe('dígito de control GS1', () => {
  it('coincide con EAN-13 reales', () => {
    // 4006381333931 y 5901234123457 son ejemplos canónicos de GS1.
    expect(digitoControlGs1('400638133393')).toBe(1);
    expect(digitoControlGs1('590123412345')).toBe(7);
    expect(digitoControlGs1('770123456789')).toBe(7);
  });

  it('coincide con EAN-8', () => {
    expect(digitoControlGs1('9638507')).toBe(4); // 96385074
  });

  it('rechaza lo que no son dígitos', () => {
    expect(() => digitoControlGs1('12a')).toThrow();
  });
});

describe('validación de formato', () => {
  it('EAN-13 y EAN-8 con dígito correcto', () => {
    expect(esEan13Valido('4006381333931')).toBe(true);
    expect(esEan13Valido('4006381333932')).toBe(false);
    expect(esEan8Valido('96385074')).toBe(true);
    expect(esEan8Valido('96385075')).toBe(false);
  });

  it('13 dígitos con control erróneo: dice cuál esperaba', () => {
    const r = validarCodigoBarras('7701234567891');
    expect(r).toEqual({ valido: false, formato: 'ean13', motivo: 'digitoControl', digitoEsperado: 7 });
  });

  it('acepta EAN-13, EAN-8 y Code128', () => {
    expect(validarCodigoBarras(' 7701234567897 ')).toEqual({ valido: true, formato: 'ean13' });
    expect(validarCodigoBarras('96385074')).toEqual({ valido: true, formato: 'ean8' });
    expect(validarCodigoBarras('GOA-0001001')).toEqual({ valido: true, formato: 'code128' });
    // 12 dígitos no es EAN: se imprime como Code128.
    expect(validarCodigoBarras('770123456789').formato).toBe('code128');
  });

  it('rechaza vacío, caracteres no imprimibles y códigos demasiado largos', () => {
    expect(validarCodigoBarras('   ').motivo).toBe('vacio');
    expect(validarCodigoBarras('ABCñ').motivo).toBe('caracteres');
    expect(validarCodigoBarras('X'.repeat(49)).motivo).toBe('largo');
    expect(esCode128Valido('')).toBe(false);
  });

  it('formato de impresión de un código guardado', () => {
    expect(formatoDeCodigo('4006381333931')).toBe('ean13');
    expect(formatoDeCodigo('4006381333932')).toBe('code128');
    expect(formatoJsBarcode('96385074')).toBe('EAN8');
    expect(formatoJsBarcode('SKU-1')).toBe('CODE128');
  });
});

describe('numeración de la organización', () => {
  it('EAN-13 con prefijo 20 (uso interno GS1) igual que el servidor', () => {
    // Mismos valores que devolvió fn_codigo_barras_construir en la BD.
    expect(construirCodigo(CONFIG_NUMERACION_POR_DEFECTO, 1)).toBe('2000000000015');
    expect(construirCodigo(CONFIG_NUMERACION_POR_DEFECTO, 2)).toBe('2000000000022');
    expect(construirCodigo(CONFIG_NUMERACION_POR_DEFECTO, 12)).toBe('2000000000121');
    expect(esEan13Valido(construirCodigo(CONFIG_NUMERACION_POR_DEFECTO, 987654) as string)).toBe(true);
  });

  it('Code128 con prefijo y longitud', () => {
    const cfg = { formato: 'code128' as const, prefijo: 'GOA', siguiente: 1001, longitud: 10 };
    expect(construirCodigo(cfg, 1001)).toBe('GOA0001001');
    expect(previsualizarCodigos(cfg, 3)).toEqual(['GOA0001001', 'GOA0001002', 'GOA0001003']);
  });

  it('null cuando el número no cabe (rango agotado)', () => {
    expect(construirCodigo({ formato: 'ean13', prefijo: '7701234567', siguiente: 1, longitud: 10 }, 100)).toBeNull();
    expect(construirCodigo({ formato: 'code128', prefijo: 'ABCDEFGH', siguiente: 1, longitud: 10 }, 100)).toBeNull();
  });

  it('valida el prefijo según el formato', () => {
    expect(validarPrefijo({ formato: 'ean13', prefijo: 'GO', siguiente: 1, longitud: 10 })).toBe('ean13Digitos');
    expect(validarPrefijo({ formato: 'code128', prefijo: 'go', siguiente: 1, longitud: 10 })).toBe('code128Caracteres');
    expect(validarPrefijo({ formato: 'code128', prefijo: 'GOA', siguiente: 99999999, longitud: 10 })).toBe('noCabe');
    expect(validarPrefijo(CONFIG_NUMERACION_POR_DEFECTO)).toBeNull();
  });

  it('agrupa el EAN-13 como se lee bajo las barras', () => {
    expect(agruparEan13('7701234567897')).toBe('7 701234 567897');
    expect(agruparEan13('GOA0001001')).toBe('GOA0001001');
  });
});
