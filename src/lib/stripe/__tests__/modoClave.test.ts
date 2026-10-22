/**
 * sk_live_ y rk_live_ son live. El arranque solo registra;
 * requireStripe() es quien rechaza.
 */

import { register } from '../../../../instrumentation';
import { registrarModoClaveAlArrancar } from '@/lib/stripe/modoClave';

const CLAVE = 'STRIPE_SECRET_KEY';
const ENTORNO = 'VERCEL_ENV';

function entornoProduccion(clave: string | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', [ENTORNO]: 'production' };
  if (clave !== undefined) env[CLAVE] = clave;
  return env;
}

describe('registrarModoClaveAlArrancar', () => {
  let error: jest.SpyInstance;

  beforeEach(() => {
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    error.mockRestore();
  });

  it('con sk_test_ en producción deja el error en el log y no lanza', () => {
    expect(() => registrarModoClaveAlArrancar(entornoProduccion('sk_test_abc'))).not.toThrow();
    expect(error).toHaveBeenCalledWith(
      '[stripe]',
      'STRIPE_SECRET_KEY no es de live y este proceso está en producción.',
    );
    expect(error.mock.calls.flat().join(' ')).not.toContain('sk_test_abc');
  });

  it('rk_live_ en producción no registra error', () => {
    registrarModoClaveAlArrancar(entornoProduccion('rk_live_abc'));
    expect(error).not.toHaveBeenCalled();
  });

  it('sin clave no registra nada', () => {
    registrarModoClaveAlArrancar(entornoProduccion(undefined));
    expect(error).not.toHaveBeenCalled();
  });
});

describe('instrumentation.register', () => {
  const previaClave = process.env[CLAVE];
  const previoEntorno = process.env[ENTORNO];
  let error: jest.SpyInstance;

  beforeEach(() => {
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    error.mockRestore();
    if (previaClave === undefined) delete process.env[CLAVE];
    else process.env[CLAVE] = previaClave;
    if (previoEntorno === undefined) delete process.env[ENTORNO];
    else process.env[ENTORNO] = previoEntorno;
  });

  it('no tumba el arranque cuando la clave de producción no es live', async () => {
    process.env[ENTORNO] = 'production';
    process.env[CLAVE] = 'sk_test_abc';
    await expect(register()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      '[stripe]',
      expect.stringContaining('no es de live'),
    );
  });
});

describe('requireStripe', () => {
  const previaClave = process.env[CLAVE];
  const previoEntorno = process.env[ENTORNO];

  afterEach(() => {
    if (previaClave === undefined) delete process.env[CLAVE];
    else process.env[CLAVE] = previaClave;
    if (previoEntorno === undefined) delete process.env[ENTORNO];
    else process.env[ENTORNO] = previoEntorno;
    jest.resetModules();
  });

  it('importar el cliente no lanza aunque la clave de producción sea de prueba', async () => {
    process.env[ENTORNO] = 'production';
    process.env[CLAVE] = 'sk_test_abc';
    jest.resetModules();
    await expect(import('../server')).resolves.toHaveProperty('requireStripe');
  });

  it('rechaza sk_test_ y acepta rk_live_', async () => {
    process.env[ENTORNO] = 'production';
    process.env[CLAVE] = 'sk_test_abc';
    jest.resetModules();
    const conPrueba = await import('../server');
    expect(() => conPrueba.requireStripe()).toThrow(/no es de live/);

    process.env[CLAVE] = 'rk_live_abc';
    jest.resetModules();
    const conRestringida = await import('../server');
    expect(conRestringida.requireStripe()).toBeTruthy();
  });
});
