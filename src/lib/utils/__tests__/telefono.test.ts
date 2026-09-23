/**
 * Parseo, validación y formato de teléfonos (`@/lib/utils/telefono`), que es
 * lo que usan `PhoneInput` y las validaciones de los formularios.
 */
import {
  aE164,
  buscarPaises,
  esTelefonoValido,
  excedeLongitud,
  formatearNacional,
  formatearParaGuardar,
  formatearTelefono,
  mensajeErrorTelefono,
  normalizarTelefono,
  paisIsoDeOrganizacion,
  paisesTelefono,
  parsearTelefono,
  telefonoOpcionalValido,
} from '@/lib/utils/telefono';

describe('parsearTelefono', () => {
  it('Colombia móvil en el formato que ya guarda el componente', () => {
    expect(parsearTelefono('+57 3001234567')).toEqual({ iso: 'CO', dialCode: '+57', number: '3001234567' });
  });

  it('Colombia fijo con el indicativo nacional 60X', () => {
    expect(parsearTelefono('+57 6012345678')).toEqual({ iso: 'CO', dialCode: '+57', number: '6012345678' });
  });

  it('México, EE. UU. y España con separadores', () => {
    expect(parsearTelefono('+52 55 1234 5678')).toEqual({ iso: 'MX', dialCode: '+52', number: '5512345678' });
    expect(parsearTelefono('+1 (201) 555-0123')).toEqual({ iso: 'US', dialCode: '+1', number: '2015550123' });
    expect(parsearTelefono('+34 612 34 56 78')).toEqual({ iso: 'ES', dialCode: '+34', number: '612345678' });
  });

  it('+1 distingue Canadá de EE. UU. por el código de área', () => {
    expect(parsearTelefono('+1 4165550123')?.iso).toBe('CA');
  });

  it('valor viejo sin indicativo: nacional del país por defecto, no Grecia (+30)', () => {
    expect(parsearTelefono('3001234567')).toEqual({ iso: 'CO', dialCode: '+57', number: '3001234567' });
    expect(parsearTelefono('300 1234567')).toEqual({ iso: 'CO', dialCode: '+57', number: '3001234567' });
  });

  it('valor viejo sin indicativo con otro país por defecto', () => {
    expect(parsearTelefono('5512345678', 'MX')).toEqual({ iso: 'MX', dialCode: '+52', number: '5512345678' });
  });

  it('indicativo sin «+» delante («573001234567»)', () => {
    expect(parsearTelefono('573001234567')).toEqual({ iso: 'CO', dialCode: '+57', number: '3001234567' });
  });

  it('prefijo internacional 00', () => {
    expect(parsearTelefono('0034612345678')).toEqual({ iso: 'ES', dialCode: '+34', number: '612345678' });
  });

  it('número a medio escribir conserva el país del indicativo compartido', () => {
    expect(parsearTelefono('+1 41', 'CA')?.iso).toBe('CA');
    expect(parsearTelefono('+57 300')).toEqual({ iso: 'CO', dialCode: '+57', number: '300' });
  });

  it('basura sin forma válida: conserva los dígitos en el país por defecto', () => {
    expect(parsearTelefono('12345')).toEqual({ iso: 'CO', dialCode: '+57', number: '12345' });
  });

  it('vacío o sin dígitos → null', () => {
    expect(parsearTelefono('')).toBeNull();
    expect(parsearTelefono(null)).toBeNull();
    expect(parsearTelefono(undefined)).toBeNull();
    expect(parsearTelefono('  -  ')).toBeNull();
  });
});

describe('formatearParaGuardar / normalizarTelefono', () => {
  it('compone «+57 3001234567» (formato existente en la base)', () => {
    expect(formatearParaGuardar('CO', '300 123 4567')).toBe('+57 3001234567');
  });

  it('sin dígitos devuelve cadena vacía, nunca «+57 »', () => {
    expect(formatearParaGuardar('CO', '')).toBe('');
  });

  it('no altera un valor ya guardado en el formato del componente', () => {
    expect(normalizarTelefono('+57 3001234567')).toBe('+57 3001234567');
  });

  it('normaliza valores viejos al formato de almacenamiento', () => {
    expect(normalizarTelefono('3001234567')).toBe('+57 3001234567');
    expect(normalizarTelefono('+1 (201) 555-0123')).toBe('+1 2015550123');
    expect(normalizarTelefono('')).toBe('');
  });

  it('quita el prefijo troncal nacional cuando el número es válido sin él', () => {
    expect(formatearParaGuardar('GB', '07400123456')).toBe('+44 7400123456');
  });
});

describe('validación', () => {
  it.each([
    ['+57 3001234567', true], // Colombia móvil
    ['+57 6012345678', true], // Colombia fijo
    ['+52 5512345678', true], // México
    ['+1 2015550123', true], // EE. UU.
    ['+34 612345678', true], // España
    ['3001234567', true], // viejo sin indicativo
    ['+57 300123', false], // incompleto
    ['+57 300123456789', false], // demasiado largo
    ['', false],
  ])('esTelefonoValido(%p) → %p', (valor, esperado) => {
    expect(esTelefonoValido(valor)).toBe(esperado);
  });

  it('campo opcional: vacío es válido, incompleto no', () => {
    expect(telefonoOpcionalValido('')).toBe(true);
    expect(telefonoOpcionalValido(null)).toBe(true);
    expect(telefonoOpcionalValido('+57 300')).toBe(false);
    expect(telefonoOpcionalValido('+57 3001234567')).toBe(true);
  });

  it('mensajes por país', () => {
    expect(mensajeErrorTelefono('+57 300123')).toBe('El número está incompleto para Colombia.');
    expect(mensajeErrorTelefono('+52 551234567899')).toBe('El número tiene demasiados dígitos para México.');
    expect(mensajeErrorTelefono('+57 3001234567')).toBeNull();
    expect(mensajeErrorTelefono('')).toBeNull();
  });

  it('excedeLongitud impide escribir más dígitos de los que admite el país', () => {
    expect(excedeLongitud('CO', '3001234567')).toBe(false);
    expect(excedeLongitud('CO', '30012345678901')).toBe(true);
  });
});

describe('formatos de visualización', () => {
  it('formato nacional mientras se escribe', () => {
    expect(formatearNacional('CO', '3001234567')).toBe('300 1234567');
    expect(formatearNacional('MX', '5512345678')).toBe('55 1234 5678');
    expect(formatearNacional('US', '2015550123')).toBe('(201) 555-0123');
    expect(formatearNacional('ES', '612345678')).toBe('612 34 56 78');
  });

  it('E.164 para integraciones', () => {
    expect(aE164('+57 3001234567')).toBe('+573001234567');
    expect(aE164('3001234567')).toBe('+573001234567');
    expect(aE164('+57 300')).toBeNull();
    expect(aE164('')).toBeNull();
  });

  it('formato internacional para listas', () => {
    expect(formatearTelefono('3001234567')).toBe('+57 300 1234567');
    expect(formatearTelefono('')).toBe('');
  });
});

describe('selector de países', () => {
  it('sin ISO duplicados (las claves de React deben ser únicas)', () => {
    const isos = paisesTelefono.map((c) => c.iso);
    expect(new Set(isos).size).toBe(isos.length);
  });

  it('busca por nombre sin tildes, por ISO y por indicativo', () => {
    expect(buscarPaises('mexico').map((c) => c.iso)).toContain('MX');
    expect(buscarPaises('es').map((c) => c.iso)).toContain('ES');
    expect(buscarPaises('+57').map((c) => c.iso)).toEqual(['CO']);
    expect(buscarPaises('34').map((c) => c.iso)).toContain('ES');
  });
});

describe('paisIsoDeOrganizacion', () => {
  it('alfa-3 de organizations.country_code', () => {
    expect(paisIsoDeOrganizacion('COL', 'Colombia')).toBe('CO');
    expect(paisIsoDeOrganizacion('MEX', null)).toBe('MX');
  });

  it('cae al nombre y, sin datos, a null', () => {
    expect(paisIsoDeOrganizacion(null, 'Perú')).toBe('PE');
    expect(paisIsoDeOrganizacion(null, null)).toBeNull();
  });
});
