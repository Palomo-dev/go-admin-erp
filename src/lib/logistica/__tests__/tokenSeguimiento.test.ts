/**
 * El token del ERP es el MISMO que valida la tienda (goadmin-websites lib/orders/tokenSeguimiento.ts):
 * HMAC-SHA256(secreto, "<org>:<pedido>") en base64url, 32 caracteres. Este valor fijo lo
 * comprueba: si alguien cambia el algoritmo aquí, los enlaces de los avisos dejan de abrir.
 */
import { createHmac } from 'crypto';

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  jest.resetModules();
});

async function cargar() {
  return import('../tokenSeguimiento.server');
}

it('mismo algoritmo que la tienda (valor conocido)', async () => {
  process.env.ORDER_TRACKING_SECRET = 'secreto-de-prueba-123456';
  const { tokenSeguimiento } = await cargar();
  const esperado = createHmac('sha256', Buffer.from('secreto-de-prueba-123456'))
    .update('120:9b7c5b1e-0000-4000-8000-000000000001')
    .digest('base64url')
    .slice(0, 32);
  expect(tokenSeguimiento(120, '9b7c5b1e-0000-4000-8000-000000000001')).toBe(esperado);
  expect(esperado).toHaveLength(32);
});

it('valida el propio y rechaza el de otra organización u otro pedido', async () => {
  process.env.ORDER_TRACKING_SECRET = 'secreto-de-prueba-123456';
  const { tokenSeguimiento, tokenSeguimientoValido } = await cargar();
  const t = tokenSeguimiento(120, 'pedido-a')!;
  expect(tokenSeguimientoValido(120, 'pedido-a', t)).toBe(true);
  expect(tokenSeguimientoValido(121, 'pedido-a', t)).toBe(false);
  expect(tokenSeguimientoValido(120, 'pedido-b', t)).toBe(false);
  expect(tokenSeguimientoValido(120, 'pedido-a', null)).toBe(false);
  expect(tokenSeguimientoValido(120, 'pedido-a', 'corto')).toBe(false);
});

it('sin secreto propio deriva de la service role; sin ninguno, falla cerrado', async () => {
  delete process.env.ORDER_TRACKING_SECRET;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-ficticia-de-prueba';
  let m = await cargar();
  expect(m.tokenSeguimiento(1, 'x')).toHaveLength(32);

  jest.resetModules();
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  m = await cargar();
  expect(m.tokenSeguimiento(1, 'x')).toBeNull();
  expect(m.urlRastreo('tienda.example.com', 1, { id: 'x', order_number: 'WEB 1' })).toBe('https://tienda.example.com/pedido/WEB%201');
});

it('la URL usa el dominio de la tienda y el token', async () => {
  process.env.ORDER_TRACKING_SECRET = 'secreto-de-prueba-123456';
  const { urlRastreo, tokenSeguimiento } = await cargar();
  const t = tokenSeguimiento(7, 'p1');
  expect(urlRastreo('https://tienda.example.com/', 7, { id: 'p1', order_number: 'WEB-0001' }))
    .toBe(`https://tienda.example.com/pedido/WEB-0001?t=${t}`);
});
