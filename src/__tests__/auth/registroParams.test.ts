/**
 * @jest-environment jsdom
 *
 * Persistencia de parámetros del registro (?plan=, ?cycle=, UTM) durante el
 * flujo completo: /auth/signup → verificación de correo → /auth/signup/organizacion.
 */

import { guardarParamsRegistro, leerParamsRegistro, limpiarParamsRegistro } from '@/lib/auth/registroParams';

// Mock de localStorage y document.cookie para el entorno de pruebas.
const storage: Record<string, string> = {};
let cookieString = '';

beforeEach(() => {
  Object.keys(storage).forEach(k => delete storage[k]);
  cookieString = '';
  
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => storage[key] || null,
      setItem: (key: string, value: string) => { storage[key] = value; },
      removeItem: (key: string) => { delete storage[key]; },
    },
    writable: true,
  });
  
  Object.defineProperty(document, 'cookie', {
    get: () => cookieString,
    set: (value: string) => { cookieString = value; },
    configurable: true,
  });
  
  // Mock de Date.now para tests predecibles.
  jest.spyOn(Date, 'now').mockReturnValue(1609459200000); // 2021-01-01 00:00:00
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('guardarParamsRegistro', () => {
  test('guarda plan y cycle cuando vienen en la URL', () => {
    const params = new URLSearchParams('?plan=business&cycle=yearly');
    guardarParamsRegistro(params);
    
    const leido = leerParamsRegistro();
    expect(leido.plan).toBe('business');
    expect(leido.cycle).toBe('yearly');
    expect(leido.ts).toBe(1609459200000);
  });

  test('guarda solo plan si cycle no viene', () => {
    const params = new URLSearchParams('?plan=ultimate');
    guardarParamsRegistro(params);
    
    const leido = leerParamsRegistro();
    expect(leido.plan).toBe('ultimate');
    expect(leido.cycle).toBeUndefined();
  });

  test('guarda parámetros UTM solo si hay consentimiento de analytics', () => {
    // Establecer cookie de consentimiento con analytics=true.
    cookieString = 'goadmin_consent=' + encodeURIComponent(JSON.stringify({
      v: 1,
      analytics: true,
      marketing: false,
      ts: Date.now()
    }));
    
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

  test('NO guarda parámetros UTM si no hay consentimiento', () => {
    // Sin cookie de consentimiento.
    const params = new URLSearchParams('?plan=pro&utm_source=google&utm_medium=cpc');
    guardarParamsRegistro(params);
    
    const leido = leerParamsRegistro();
    expect(leido.plan).toBe('pro');
    expect(leido.utm).toBeUndefined();
  });

  test('NO guarda parámetros UTM si analytics=false en consentimiento', () => {
    // Establecer cookie de consentimiento con analytics=false.
    cookieString = 'goadmin_consent=' + encodeURIComponent(JSON.stringify({
      v: 1,
      analytics: false,
      marketing: true,
      ts: Date.now()
    }));
    
    const params = new URLSearchParams('?plan=business&utm_source=facebook');
    guardarParamsRegistro(params);
    
    const leido = leerParamsRegistro();
    expect(leido.plan).toBe('business');
    expect(leido.utm).toBeUndefined();
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
    storage['go_admin_signup_params'] = JSON.stringify({ 
      plan: 'business', 
      cycle: 'monthly',
      ts: Date.now()
    });
    
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

  test('devuelve objeto vacío si los datos expiraron (más de 7 días)', () => {
    const hace8Dias = Date.now() - (8 * 24 * 60 * 60 * 1000);
    storage['go_admin_signup_params'] = JSON.stringify({ 
      plan: 'ultimate',
      ts: hace8Dias
    });
    
    const leido = leerParamsRegistro();
    expect(leido).toEqual({});
    // Verificar que se limpió de localStorage.
    expect(storage['go_admin_signup_params']).toBeUndefined();
  });

  test('lee datos si están dentro del vencimiento (menos de 7 días)', () => {
    const hace3Dias = Date.now() - (3 * 24 * 60 * 60 * 1000);
    storage['go_admin_signup_params'] = JSON.stringify({ 
      plan: 'business',
      cycle: 'yearly',
      ts: hace3Dias
    });
    
    const leido = leerParamsRegistro();
    expect(leido.plan).toBe('business');
    expect(leido.cycle).toBe('yearly');
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
  test('guarda en /auth/signup y lee en /auth/signup/organizacion con consentimiento', () => {
    // Usuario da consentimiento para analytics.
    cookieString = 'goadmin_consent=' + encodeURIComponent(JSON.stringify({
      v: 1,
      analytics: true,
      marketing: false,
      ts: Date.now()
    }));
    
    // Usuario entra a /auth/signup?plan=business&cycle=yearly&utm_source=facebook
    const paramsEntrada = new URLSearchParams('?plan=business&cycle=yearly&utm_source=facebook');
    guardarParamsRegistro(paramsEntrada);
    
    // ... se registra, confirma correo, etc. ...
    
    // Llega a /auth/signup/organizacion (sin parámetros en URL, pero en localStorage).
    const leido = leerParamsRegistro();
    expect(leido.plan).toBe('business');
    expect(leido.cycle).toBe('yearly');
    expect(leido.utm?.utm_source).toBe('facebook');
    
    // Después de crear la organización, se limpian los parámetros.
    limpiarParamsRegistro();
    
    const despuesLimpiar = leerParamsRegistro();
    expect(despuesLimpiar).toEqual({});
  });

  test('guarda en /auth/signup y lee en /auth/signup/organizacion sin consentimiento (sin UTM)', () => {
    // Usuario NO da consentimiento (no hay cookie).
    // Usuario entra a /auth/signup?plan=ultimate&utm_source=google
    const paramsEntrada = new URLSearchParams('?plan=ultimate&utm_source=google');
    guardarParamsRegistro(paramsEntrada);
    
    // Llega a /auth/signup/organizacion.
    const leido = leerParamsRegistro();
    expect(leido.plan).toBe('ultimate');
    expect(leido.utm).toBeUndefined(); // No se guardó porque no hay consentimiento.
  });

  test('pestaña nueva: enlace de verificación abre nueva pestaña y lee desde localStorage', () => {
    // Simular pestaña 1: usuario se registra.
    const params = new URLSearchParams('?plan=business&cycle=yearly');
    guardarParamsRegistro(params);
    
    // Simular pestaña 2: enlace de verificación abre en pestaña nueva.
    // localStorage se comparte entre pestañas del mismo origen, pero sessionStorage no.
    // Por eso usamos localStorage.
    
    const leido = leerParamsRegistro();
    expect(leido.plan).toBe('business');
    expect(leido.cycle).toBe('yearly');
    
    // Verificar que los datos están en localStorage (no sessionStorage).
    expect(storage['go_admin_signup_params']).toBeDefined();
  });
});

describe('payload de registro (privacidad)', () => {
  test('CON consentimiento: payload incluye plan, cycle y UTM', () => {
    // Usuario da consentimiento para analytics.
    cookieString = 'goadmin_consent=' + encodeURIComponent(JSON.stringify({
      v: 1,
      analytics: true,
      marketing: false,
      ts: Date.now()
    }));
    
    // Usuario entra con todos los parámetros.
    const params = new URLSearchParams('?plan=business&cycle=yearly&utm_source=google&utm_campaign=test&gclid=abc123');
    guardarParamsRegistro(params);
    
    // Verificar que el payload leído incluye TODO.
    const payload = leerParamsRegistro();
    expect(payload.plan).toBe('business');
    expect(payload.cycle).toBe('yearly');
    expect(payload.utm).toEqual({
      utm_source: 'google',
      utm_campaign: 'test',
      gclid: 'abc123',
    });
  });

  test('SIN consentimiento: payload incluye SOLO plan y cycle (NO UTM, gclid, fbclid)', () => {
    // Usuario NO da consentimiento (no hay cookie).
    
    // Usuario entra con todos los parámetros incluidos UTM y click IDs.
    const params = new URLSearchParams('?plan=ultimate&cycle=monthly&utm_source=facebook&utm_medium=cpc&gclid=xyz789&fbclid=fb456');
    guardarParamsRegistro(params);
    
    // Verificar que el payload leído incluye SOLO plan y cycle.
    const payload = leerParamsRegistro();
    expect(payload.plan).toBe('ultimate');
    expect(payload.cycle).toBe('monthly');
    expect(payload.utm).toBeUndefined(); // No se guardó porque no hay consentimiento.
    
    // Verificar que NO hay rastro de parámetros analíticos en localStorage.
    const raw = storage['go_admin_signup_params'];
    expect(raw).toBeDefined();
    const stored = JSON.parse(raw);
    expect(stored.utm).toBeUndefined();
    expect(stored.gclid).toBeUndefined();
    expect(stored.fbclid).toBeUndefined();
  });

  test('SIN consentimiento pero con analytics=false: NO guarda parámetros analíticos', () => {
    // Usuario rechaza consentimiento de analytics.
    cookieString = 'goadmin_consent=' + encodeURIComponent(JSON.stringify({
      v: 1,
      analytics: false,
      marketing: true,
      ts: Date.now()
    }));
    
    // Usuario entra con parámetros analíticos.
    const params = new URLSearchParams('?plan=pro&utm_source=email&gclid=test123');
    guardarParamsRegistro(params);
    
    // Verificar que el payload NO incluye parámetros analíticos.
    const payload = leerParamsRegistro();
    expect(payload.plan).toBe('pro');
    expect(payload.utm).toBeUndefined();
  });
});
