/** Presentación de Conexiones: estados honestos y explicación de errores de eventos. */
import { accionDeTarjeta, codigoErrorEvento, estadoConexion, resultadoEvento } from '../presentacion';

describe('presentación de Conexiones', () => {
  it('una conexión con errores en 24 h no se ve «Activa»', () => {
    expect(estadoConexion('connected', false)).toEqual({ clave: 'activa', tono: 'exito' });
    expect(estadoConexion('connected', true).clave).toBe('conErrores');
    expect(estadoConexion('error', true)).toEqual({ clave: 'revisar', tono: 'peligro' });
    expect(estadoConexion('paused', true).clave).toBe('pausada');
  });

  it('el resultado de un evento sale de su estado y de su error, nunca se inventa «Correcta»', () => {
    expect(resultadoEvento({ estado: 'processed', sentido: 'outbound', error: null }).clave).toBe('correcta');
    expect(resultadoEvento({ estado: 'processed', sentido: 'inbound', error: null }).clave).toBe('aplicada');
    expect(resultadoEvento({ estado: 'received', sentido: 'inbound', error: null }).clave).toBe('recibida');
    expect(resultadoEvento({ estado: 'error', sentido: 'outbound', error: 'prueba:rechazada (HTTP 401)' }).clave).toBe('rechazada');
    expect(resultadoEvento({ estado: 'error', sentido: 'inbound', error: 'checksum inválido' }).clave).toBe('firmaInvalida');
  });

  it('reconoce los errores que escribe el servidor al probar', () => {
    expect(codigoErrorEvento('prueba:sin_respuesta')).toBe('sin_respuesta');
    expect(codigoErrorEvento('prueba:sin_prueba')).toBe('sin_prueba');
    expect(codigoErrorEvento('timeout de base')).toBe('otro');
    expect(codigoErrorEvento(null)).toBeNull();
  });

  it('acción de la tarjeta: servicio de GO Admin → ir; con conexión → ver; sin ella → conectar', () => {
    expect(accionDeTarjeta({ estado: 'servicio_go_admin', conexionPrincipal: null, grupo: 'go_admin', asistente: 'enlace' })).toBe('ir');
    expect(accionDeTarjeta({ estado: 'conectado', conexionPrincipal: 'x', grupo: 'cobros', asistente: 'llaves' })).toBe('ver');
    expect(accionDeTarjeta({ estado: 'en_construccion', conexionPrincipal: null, grupo: 'domicilios', asistente: 'domicilios' })).toBe('conectar');
  });
});
