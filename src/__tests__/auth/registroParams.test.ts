/**
 * @jest-environment jsdom
 *
 * Persistencia de parámetros del registro (?plan=, ?cycle=, UTM) durante el
 * flujo completo: /auth/signup → verificación de correo → /auth/signup/organizacion.
 */

import { guardarParamsRegistro, leerParamsRegistro, limpiarParamsRegistro } from '@/lib/auth/registroParams';

// Mock de sessionStorage para el entorno de pruebas.
const storage: Record<string, string> = {};
beforeEach(() => {
  Object.keys(storage).forEach(k => delete storage[k]);
  Object.defineProperty(window, 'sessionStorage', {
    value: {
      getItem: (key: string) => storage[key] || null,
      setItem: (key: string, value: string) => { storage[key] = value; },
      removeItem: (key: string) => { delete storage[key]; },
    },
    writable: true,
  });
});

describe('guardarParamsRegistro', () => {
  test('guarda plan y cycle cuando vienen en la URL', () => {
    const params = new URLSearchParams('?plan=business&cycle=yearly');
    guardarParamsRegistro(params);
    
    const leido = leerParamsRegistro();
    expect(leido.plan).toBe('business');
    expect(leido.cycle).toBe('yearly');
  });

  test('guarda solo plan si cycle no viene', () => {
    const params = new URLSearchParams('?plan=ultimate');
    guardarParamsRegistro(params);
    
    const leido = leerParamsRegistro();
    expect(leido.plan).toBe('ultimate');
    expect(leido.cycle).toBeUndefined();
  });

  test('guarda parámetros UTM cuando vienen en la URL', () => {
    const params = new URLSearchParams('?plan=pro&utm_source=google&utm_medium=cpc&utm_campaign=verano2026');
    guardarParamsRegistro(params);
    
    const leido = leerParamsRegistro();
    expect(leido.plan).toBe('pro');
    expect(leido.utm).toEqual({
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'verano2026',
    });
  });

  test('no guarda nada si no hay parámetros relevantes', () => {
    const params = new URLSearchParams('?foo=bar');
    guardarParamsRegistro(params);
    
    expect(storage['go_admin_signup_params']).toBeUndefined();
  });

  test('normaliza cycle inválido (no lo guarda)', () => {
    const params = new URLSearchParams('?plan=pro&cycle=invalid');
    guardarParamsRegistro(params);
    
    const leido = leerParamsRegistro();
    expect(leido.plan).toBe('pro');
    expect(leido.cycle).toBeUndefined();
  });
});

describe('leerParamsRegistro', () => {
  test('lee parámetros guardados previamente', () => {
    storage['go_admin_signup_params'] = JSON.stringify({ plan: 'business', cycle: 'monthly' });
    
    const leido = leerParamsRegistro();
    expect(leido.plan).toBe('business');
    expect(leido.cycle).toBe('monthly');
  });

  test('devuelve objeto vacío si no hay nada guardado', () => {
    const leido = leerParamsRegistro();
    expect(leido).toEqual({});
  });

  test('devuelve objeto vacío si el JSON es inválido', () => {
    storage['go_admin_signup_params'] = '{invalid json}';
    
    const leido = leerParamsRegistro();
    expect(leido).toEqual({});
  });
});

describe('limpiarParamsRegistro', () => {
  test('elimina los parámetros de sessionStorage', () => {
    storage['go_admin_signup_params'] = JSON.stringify({ plan: 'ultimate' });
    
    limpiarParamsRegistro();
    
    expect(storage['go_admin_signup_params']).toBeUndefined();
    const leido = leerParamsRegistro();
    expect(leido).toEqual({});
  });
});

describe('flujo completo', () => {
  test('guarda en /auth/signup y lee en /auth/signup/organizacion', () => {
    // Usuario entra a /auth/signup?plan=business&cycle=yearly&utm_source=facebook
    const paramsEntrada = new URLSearchParams('?plan=business&cycle=yearly&utm_source=facebook');
    guardarParamsRegistro(paramsEntrada);
    
    // ... se registra, confirma correo, etc. ...
    
    // Llega a /auth/signup/organizacion (sin parámetros en URL, pero en sessionStorage).
    const leido = leerParamsRegistro();
    expect(leido.plan).toBe('business');
    expect(leido.cycle).toBe('yearly');
    expect(leido.utm?.utm_source).toBe('facebook');
    
    // Después de crear la organización, se limpian los parámetros.
    limpiarParamsRegistro();
    
    const despuesLimpiar = leerParamsRegistro();
    expect(despuesLimpiar).toEqual({});
  });
});
