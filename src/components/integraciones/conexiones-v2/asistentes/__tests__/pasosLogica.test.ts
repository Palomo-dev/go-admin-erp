/**
 * Lógica de los asistentes de conexión (Frente INT): pasos por proveedor y modo, qué pasa tras
 * una prueba de llaves (solo «correcta» avanza), lectura honesta de las verificaciones, OTA sin
 * cuenta de socio, iCal y domicilios sin activación simulada.
 */
import { LLAVES } from '@/lib/services/integrations/conexiones/definicionesLlaves';
import {
  claveFalloPrueba,
  enlacesIcalParaGuardar,
  estadoTrasPrueba,
  interpretarOauth,
  interpretarVerificacionOta,
  pasoAnterior,
  pasosLlaves,
  pasosOta,
  pasoSiguiente,
  puedeActivarDomicilios,
  relacionesParaGuardar,
  urlIcalValida,
  verificacionesDePrueba,
} from '../pasosLogica';

describe('pasosLlaves', () => {
  it('Wompi: ambiente → llaves → prueba → webhook → uso (85-03…10)', () => {
    expect(pasosLlaves(LLAVES.wompi, false)).toEqual(['ambiente', 'llaves', 'prueba', 'webhook', 'uso']);
  });
  it('SendGrid: un solo ambiente y sin método de pago → sin «ambiente» ni «uso»', () => {
    expect(pasosLlaves(LLAVES.sendgrid, false)).toEqual(['llaves', 'prueba', 'webhook']);
  });
  it('reemplazar llave (85-12): solo dónde están y pegar/probar', () => {
    expect(pasosLlaves(LLAVES.wompi, true)).toEqual(['llaves', 'prueba']);
  });
  it('navegación entre pasos', () => {
    const p = pasosLlaves(LLAVES.wompi, false);
    expect(pasoSiguiente(p, 'prueba')).toBe('webhook');
    expect(pasoSiguiente(p, 'uso')).toBeNull();
    expect(pasoAnterior(p, 'ambiente')).toBeNull();
    expect(pasoAnterior(p, 'llaves')).toBe('ambiente');
  });
});

describe('después de probar las llaves', () => {
  it('solo «correcta» avanza; rechazada, sin respuesta y sin prueba se quedan en el paso', () => {
    expect(estadoTrasPrueba('correcta')).toBe('correcta');
    expect(estadoTrasPrueba('rechazada')).toBe('fallo');
    expect(estadoTrasPrueba('sin_respuesta')).toBe('fallo');
    expect(estadoTrasPrueba('sin_prueba')).toBe('fallo');
  });
  it('el mensaje distingue rechazo del proveedor y falta de respuesta', () => {
    expect(claveFalloPrueba('rechazada')).toBe('rechazada');
    expect(claveFalloPrueba('sin_respuesta')).toBe('sinRespuesta');
  });
  it('85-08: llave pública lista, privada rechazada, secretos sin probar', () => {
    const filas = verificacionesDePrueba(['public_key', 'private_key', 'events_secret', 'integrity_secret'], {
      resultado: 'rechazada',
      verificado: ['public_key', 'private_key'],
    });
    expect(filas.map((f) => f.estado)).toEqual(['listo', 'rechazada', 'sin_probar', 'sin_probar']);
  });
  it('sin respuesta no afirma nada de ninguna llave', () => {
    const filas = verificacionesDePrueba(['public_key'], { resultado: 'sin_respuesta', verificado: ['public_key'] });
    expect(filas[0].estado).toBe('sin_probar');
  });
});

describe('OTA', () => {
  it('modo API tiene 5 pasos; iCal pasa a calendarios', () => {
    expect(pasosOta('api')).toEqual(['modo', 'autorizar', 'verificar', 'habitaciones', 'sincronizar']);
    expect(pasosOta('ical')).toEqual(['modo', 'calendarios']);
  });
  it('409 CUENTA_SOCIO es honesto, no «sin autorizar»', () => {
    expect(interpretarVerificacionOta(409, { codigo: 'CUENTA_SOCIO' })).toBe('cuenta_socio');
    expect(interpretarVerificacionOta(409, { codigo: 'YA_EXISTE' })).toBe('ya_existe');
    expect(interpretarVerificacionOta(200, { verificada: false })).toBe('sin_autorizar');
    expect(interpretarVerificacionOta(200, { verificada: true })).toBe('verificada');
    expect(interpretarVerificacionOta(500, {})).toBe('error');
  });
  it('solo se guardan las habitaciones con id externo', () => {
    expect(relacionesParaGuardar({ a: ' 123 ', b: '' })).toEqual({ lista: [{ espacioId: 'a', externoId: '123' }], sinRelacionar: 1 });
  });
});

describe('iCal', () => {
  it('solo https', () => {
    expect(urlIcalValida('https://calendario.ejemplo.co/a.ics')).toBe(true);
    expect(urlIcalValida('http://calendario.ejemplo.co/a.ics')).toBe(false);
    expect(urlIcalValida('no es url')).toBe(false);
  });
  it('separa los enlaces válidos de los inválidos e ignora los vacíos', () => {
    expect(enlacesIcalParaGuardar({ a: 'https://x.co/a.ics', b: 'ftp://x', c: '  ' })).toEqual({
      lista: [{ espacioId: 'a', urlImportacion: 'https://x.co/a.ics' }],
      invalidos: ['b'],
    });
  });
});

describe('domicilios y OAuth', () => {
  it('domicilios nunca se activan sin conector, aunque el catálogo dijera «disponible»', () => {
    expect(puedeActivarDomicilios({ estado: 'en_construccion' })).toBe(false);
    expect(puedeActivarDomicilios({ estado: 'disponible' })).toBe(false);
  });
  it('OAuth: redirige solo a https; 500/503 = falta la app en el servidor', () => {
    expect(interpretarOauth(200, { url: 'https://www.facebook.com/dialog/oauth?x=1' })).toEqual({ tipo: 'redirigir', url: 'https://www.facebook.com/dialog/oauth?x=1' });
    expect(interpretarOauth(200, { url: 'javascript:alert(1)' })).toEqual({ tipo: 'error' });
    expect(interpretarOauth(503, {})).toEqual({ tipo: 'sin_app' });
    expect(interpretarOauth(500, {})).toEqual({ tipo: 'sin_app' });
    expect(interpretarOauth(403, {})).toEqual({ tipo: 'error' });
  });
});
