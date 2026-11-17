import {
  ALFABETO_CODIGO,
  PAUSA_LECTOR_MS,
  TECLADO_VACIO,
  contenidoCarneQr,
  cuentaAtras,
  esPin,
  formatearCodigo,
  iniciales,
  leerCarne,
  normalizarCarne,
  normalizarCodigo,
  pantallaDeIdentificacion,
  teclaLector,
  teclearPin,
  type EstadoTeclado,
} from '../kiosco';

describe('PIN (D11)', () => {
  test('solo 6 dígitos', () => {
    expect(esPin('123456')).toBe(true);
    expect(esPin('12345')).toBe(false);
    expect(esPin('1234567')).toBe(false);
    expect(esPin('12a456')).toBe(false);
    expect(esPin(123456)).toBe(false);
  });

  test('el teclado agrega hasta 6 dígitos y borra el último', () => {
    let v = '';
    for (const k of ['1', '2', '3', '4', '5', '6', '7'] as const) v = teclearPin(v, k);
    expect(v).toBe('123456');
    expect(teclearPin(v, 'borrar')).toBe('12345');
    expect(teclearPin('', 'borrar')).toBe('');
  });
});

describe('código de vinculación (20.29.7)', () => {
  test('acepta espacios, puntos y minúsculas; rechaza letras confusas', () => {
    expect(normalizarCodigo('k7q · 4m2')).toBe('K7Q4M2');
    expect(normalizarCodigo('K7Q-4M2')).toBe('K7Q4M2');
    expect(normalizarCodigo('K7Q4M')).toBeNull();
    expect(normalizarCodigo('K7Q4MO')).toBeNull(); // O no está en el alfabeto
    expect(normalizarCodigo('K7Q4M1')).toBeNull(); // 1 tampoco
    expect(ALFABETO_CODIGO).toHaveLength(32);
  });

  test('se muestra en dos grupos', () => {
    expect(formatearCodigo('K7Q4M2')).toBe('K7Q · 4M2');
  });
});

describe('carnés', () => {
  test('misma forma canónica que fn_hr_carne_normalizar', () => {
    expect(normalizarCarne('04:a2:3b:1c')).toBe('04A23B1C');
    expect(normalizarCarne(' 04-A2 3B ')).toBe('04A23B');
    expect(normalizarCarne('ab')).toBeNull();
    expect(normalizarCarne('x'.repeat(41))).toBeNull();
  });

  test('distingue el carné QR de GO Admin del UID de un carné NFC', () => {
    expect(leerCarne('GAABCDEFGHJKLM', 'teclado')).toEqual({ tipo: 'carne_qr', valor: 'GAABCDEFGHJKLM' });
    expect(leerCarne(contenidoCarneQr('GAABCDEFGHJKLM'), 'qr')).toEqual({ tipo: 'carne_qr', valor: 'GAABCDEFGHJKLM' });
    expect(leerCarne('04:A2:3B:1C:55:80', 'nfc')).toEqual({ tipo: 'carne_nfc', valor: '04A23B1C5580' });
    // Por la cámara solo vale un carné QR de GO Admin.
    expect(leerCarne('https://otra.cosa', 'qr')).toBeNull();
    expect(leerCarne('', 'teclado')).toBeNull();
  });
});

describe('lector USB que teclea', () => {
  function leer(texto: string, pausaMs: number): string | null {
    let e: EstadoTeclado = TECLADO_VACIO;
    let t = 1000;
    let lectura: string | null = null;
    for (const k of [...texto.split(''), 'Enter']) {
      t += pausaMs;
      const r = teclaLector(e, k, t);
      e = r.estado;
      lectura = r.lectura ?? lectura;
    }
    return lectura;
  }

  test('un lector (teclas seguidas) entrega el código', () => {
    expect(leer('04A23B1C', 10)).toBe('04A23B1C');
  });

  test('una persona escribiendo despacio no cuenta como lectura', () => {
    expect(leer('04A23B1C', PAUSA_LECTOR_MS + 50)).toBeNull();
  });

  test('códigos muy cortos no cuentan', () => {
    expect(leer('12', 5)).toBeNull();
  });
});

describe('bloqueo (20.29.8)', () => {
  test('cuenta atrás mm:ss y null cuando ya pasó', () => {
    const ahora = Date.parse('2026-11-17T14:00:00Z');
    expect(cuentaAtras('2026-11-17T14:14:32Z', ahora)).toEqual({ minutos: 14, segundos: 32, texto: '14:32' });
    expect(cuentaAtras('2026-11-17T13:59:00Z', ahora)).toBeNull();
    expect(cuentaAtras(null, ahora)).toBeNull();
  });
});

describe('pantalla según la respuesta de la base', () => {
  test('foto solo si la persona la autorizó y la sede la pide', () => {
    expect(pantallaDeIdentificacion({ estado: 'identificada', foto: true }, true)).toBe('foto');
    expect(pantallaDeIdentificacion({ estado: 'identificada', foto: true }, false)).toBe('registrar');
    expect(pantallaDeIdentificacion({ estado: 'identificada', foto: false }, true)).toBe('registrar');
  });

  test('PIN incorrecto, bloqueos y avisos', () => {
    expect(pantallaDeIdentificacion({ estado: 'pin_incorrecto' }, true)).toBe('pin_incorrecto');
    expect(pantallaDeIdentificacion({ estado: 'pin_bloqueado' }, true)).toBe('bloqueado');
    expect(pantallaDeIdentificacion({ estado: 'kiosco_bloqueado' }, true)).toBe('bloqueado');
    expect(pantallaDeIdentificacion({ estado: 'carne_desconocido' }, true)).toBe('aviso');
  });

  test('iniciales del círculo de 20.29.4', () => {
    expect(iniciales('Carolina Restrepo')).toBe('CR');
    expect(iniciales('Ana')).toBe('AN');
    expect(iniciales('')).toBe('·');
  });
});
