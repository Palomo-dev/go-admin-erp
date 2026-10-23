import { estadoListaEntidad } from '../selectorEntidadLogica';
import {
  interpretarNit,
  opcionTercero,
  textoTerceroGuardado,
  valorAlEscribir,
  type TerceroElegido,
} from '../terceroPickerLogica';

describe('interpretarNit', () => {
  it('calcula el DV cuando el texto es solo la base', () => {
    expect(interpretarNit('900123456')).toEqual({
      esNit: true,
      valido: true,
      dvInvalido: false,
      nit: '900123456',
      dv: '8',
    });
    expect(interpretarNit('900.123.456').valido).toBe(true);
    expect(interpretarNit('900.123.456').dv).toBe('8');
  });

  it('acepta 900123456-8 y rechaza el DV 7', () => {
    expect(interpretarNit('900123456-8')).toMatchObject({ valido: true, dvInvalido: false, nit: '900123456', dv: '8' });
    expect(interpretarNit('900123456-7')).toEqual({
      esNit: true,
      valido: false,
      dvInvalido: true,
      nit: null,
      dv: null,
    });
  });

  it('un nombre no es un NIT', () => {
    expect(interpretarNit('Juan')).toMatchObject({ esNit: false, valido: false });
    expect(interpretarNit('')).toMatchObject({ esNit: false });
    expect(interpretarNit('12')).toMatchObject({ esNit: false });
  });
});

describe('valor separado del texto', () => {
  const elegido: TerceroElegido = { tipo: 'cliente', id: 'c1', nit: null, dv: null, nombre: 'Ana' };

  it('escribir devuelve el mismo valor', () => {
    expect(valorAlEscribir(elegido, 'Juan')).toBe(elegido);
    expect(valorAlEscribir(null, '900123456')).toBeNull();
  });
});

describe('opcionTercero', () => {
  it('incluye a quien no tiene documento', () => {
    const opcion = opcionTercero(
      { tipo: 'empleado', id: 'u1', nit: null, dv: null, nombre: 'Luis Mora', email: 'luis@example.com', documento: null },
      'Empleado',
    );
    expect(opcion.titulo).toBe('Luis Mora');
    expect(opcion.subtitulo).toBeNull();
    expect(opcion.meta).toBe('luis@example.com');
    expect(opcion.etiqueta).toBe('Empleado');
    expect(opcion.conAvatar).toBe(true);
    expect(opcion.id).toBe('u1');
  });
});

describe('estados de la lista', () => {
  it('distingue carga, error, vacío y resultados', () => {
    expect(estadoListaEntidad({ cargando: true, error: false, total: 0, texto: '' })).toBe('cargando');
    expect(estadoListaEntidad({ cargando: false, error: true, total: 0, texto: 'Juan' })).toBe('error');
    expect(estadoListaEntidad({ cargando: false, error: false, total: 0, texto: '' })).toBe('inicial');
    expect(estadoListaEntidad({ cargando: false, error: false, total: 0, texto: 'Juan' })).toBe('sinResultados');
    expect(estadoListaEntidad({ cargando: false, error: false, total: 2, texto: 'Juan' })).toBe('resultados');
  });
});

describe('textoTerceroGuardado', () => {
  it('deja igual un NIT histórico sin DV', () => {
    expect(textoTerceroGuardado('900123456', 'Ana')).toBe('900123456 · Ana');
    expect(textoTerceroGuardado('900123456', null, null)).toBe('900123456');
  });

  it('agrega el DV solo cuando la columna lo trae', () => {
    expect(textoTerceroGuardado('900123456', 'Ana', '8')).toBe('900123456-8 · Ana');
    expect(textoTerceroGuardado('900123456-8', 'Ana', '8')).toBe('900123456-8 · Ana');
  });
});
