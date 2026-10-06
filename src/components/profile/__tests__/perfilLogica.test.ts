/**
 * Lógica pura de «Mi perfil» (Figma 344:9278). Datos ficticios.
 */
import {
  agruparClave,
  codigoTotpValido,
  detalleDispositivo,
  estadoCorreo,
  hayCambios,
  limpiarCodigoTotp,
  mostrarDosPasos,
  nombreCompleto,
  normalizarDatos,
  ordenarDispositivos,
  rutaFotoPropia,
  SECCIONES_PERFIL,
  seccionPerfilDe,
  ubicacionLegible,
  validarCambioCorreo,
  validarFoto,
  vistaMovil,
} from '../perfilLogica';

describe('sección en la URL (?seccion=)', () => {
  it('ocho secciones en el orden del diseño', () => {
    expect(SECCIONES_PERFIL).toEqual([
      'datos-personales',
      'seguridad',
      'preferencias',
      'sesiones',
      'organizacion-roles',
      'notificaciones',
      'panel-vendedor',
      'eliminar-cuenta',
    ]);
  });

  it('un valor desconocido abre Datos personales; los ids antiguos van a la sección unida', () => {
    expect(seccionPerfilDe('sesiones')).toBe('sesiones');
    expect(seccionPerfilDe('roles')).toBe('organizacion-roles');
    expect(seccionPerfilDe('<script>')).toBe('datos-personales');
    expect(seccionPerfilDe(undefined)).toBe('datos-personales');
  });

  it('en móvil, sin ?seccion= se ve la lista', () => {
    expect(vistaMovil(null)).toBe('lista');
    expect(vistaMovil('  ')).toBe('lista');
    expect(vistaMovil('seguridad')).toBe('seccion');
  });
});

describe('datos personales', () => {
  const base = { nombre: 'María', apellidos: 'Gómez', telefono: '+573001234567' };

  it('normaliza espacios y deja el teléfono vacío en null', () => {
    expect(normalizarDatos({ nombre: '  María   José ', apellidos: ' Gómez ', telefono: '  ' })).toEqual({
      first_name: 'María José',
      last_name: 'Gómez',
      phone: null,
    });
  });

  it('un espacio de más no cuenta como cambio', () => {
    expect(hayCambios({ ...base, nombre: 'María ' }, base)).toBe(false);
    expect(hayCambios({ ...base, apellidos: 'Gómez Ruiz' }, base)).toBe(true);
    expect(hayCambios({ ...base, telefono: '' }, base)).toBe(true);
  });

  it('nombre completo sin huecos', () => {
    expect(nombreCompleto('María', null)).toBe('María');
    expect(nombreCompleto(' ', 'Gómez')).toBe('Gómez');
    expect(nombreCompleto(null, undefined)).toBe('');
  });
});

describe('correo', () => {
  it('valida en el orden del diálogo: formato, igual al actual, confirmación', () => {
    expect(validarCambioCorreo('no-es-correo', 'no-es-correo', 'ana@ejemplo.co')).toBe('invalido');
    expect(validarCambioCorreo('ANA@ejemplo.co', 'ana@ejemplo.co', 'ana@ejemplo.co')).toBe('igual');
    expect(validarCambioCorreo('nueva@ejemplo.co', 'otra@ejemplo.co', 'ana@ejemplo.co')).toBe('no_coinciden');
    expect(validarCambioCorreo(' Nueva@Ejemplo.co ', 'nueva@ejemplo.co', 'ana@ejemplo.co')).toBeNull();
  });

  it('estado según Auth', () => {
    expect(estadoCorreo({ email_confirmed_at: '2026-01-01T00:00:00Z' })).toBe('confirmado');
    expect(estadoCorreo({ email_confirmed_at: null })).toBe('sin_confirmar');
    expect(estadoCorreo({ email_confirmed_at: '2026-01-01T00:00:00Z', new_email: 'nueva@ejemplo.co' })).toBe('cambio_pendiente');
    expect(estadoCorreo(null)).toBe('confirmado');
  });
});

describe('foto de perfil', () => {
  it('solo PNG, JPG o WEBP de hasta 2 MB', () => {
    expect(validarFoto({ name: 'yo.PNG', size: 1000 })).toBeNull();
    expect(validarFoto({ name: 'yo.gif', size: 1000 })).toBe('formato');
    expect(validarFoto({ name: 'sin-extension', size: 1000 })).toBe('formato');
    expect(validarFoto({ name: 'yo.webp', size: 2 * 1024 * 1024 + 1 })).toBe('tamano');
  });

  it('solo borra fotos propias: nunca un archivo ajeno por una URL manipulada', () => {
    const uid = '11111111-1111-1111-1111-111111111111';
    expect(rutaFotoPropia(`https://x.supabase.co/storage/v1/object/public/profiles/avatars/${uid}-abc.png?t=1`, uid)).toBe(`avatars/${uid}-abc.png`);
    expect(rutaFotoPropia('https://x.supabase.co/storage/v1/object/public/profiles/avatars/otro-abc.png', uid)).toBeNull();
    expect(rutaFotoPropia('https://lh3.googleusercontent.com/a/foto', uid)).toBeNull();
    expect(rutaFotoPropia(null, uid)).toBeNull();
  });
});

describe('sesiones y dispositivos', () => {
  it('no muestra coordenadas ni frases de error como ubicación', () => {
    expect(ubicacionLegible('Coordenadas GPS: 4.6097, -74.0817')).toBeNull();
    expect(ubicacionLegible('4.6097, -74.0817')).toBeNull();
    expect(ubicacionLegible('Usuario denegó el acceso a la ubicación')).toBeNull();
    expect(ubicacionLegible('Bogotá')).toBe('Bogotá');
    expect(ubicacionLegible('')).toBeNull();
  });

  it('detalle con solo lo que hay (versión mayor)', () => {
    expect(detalleDispositivo({ os: 'Windows', os_version: '11.0', browser: 'Chrome', browser_version: '128.0.1', location: 'Bogotá' })).toEqual([
      'Windows 11',
      'Chrome 128',
      'Bogotá',
    ]);
    expect(detalleDispositivo({ os: 'iOS', os_version: '0', browser: null, location: 'Coordenadas GPS: 1, 2' })).toEqual(['iOS']);
  });

  it('el dispositivo actual primero; los demás por actividad descendente', () => {
    const lista = [
      { id: 'a', actual: false, ultimaActividad: '2026-09-01T10:00:00Z' },
      { id: 'b', actual: true, ultimaActividad: '2026-08-01T10:00:00Z' },
      { id: 'c', actual: false, ultimaActividad: '2026-10-01T10:00:00Z' },
      { id: 'd', actual: false, ultimaActividad: null },
    ];
    expect(ordenarDispositivos(lista).map((d) => d.id)).toEqual(['b', 'c', 'a', 'd']);
  });
});

describe('dos pasos', () => {
  it('código: 6 dígitos; al pegar se limpian espacios y letras', () => {
    expect(codigoTotpValido('123456')).toBe(true);
    expect(codigoTotpValido('12345')).toBe(false);
    expect(limpiarCodigoTotp('123 456')).toBe('123456');
    expect(limpiarCodigoTotp('12a34b5678')).toBe('123456');
  });

  it('clave agrupada de 4 en 4', () => {
    expect(agruparClave('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
  });

  it('se ofrece con la bandera o si ya hay un factor (para poder quitarlo)', () => {
    expect(mostrarDosPasos(undefined, 0)).toBe(false);
    expect(mostrarDosPasos('0', 0)).toBe(false);
    expect(mostrarDosPasos('1', 0)).toBe(true);
    expect(mostrarDosPasos('true', 0)).toBe(true);
    expect(mostrarDosPasos(undefined, 1)).toBe(true);
  });
});
