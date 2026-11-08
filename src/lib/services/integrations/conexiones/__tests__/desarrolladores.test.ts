/**
 * Desarrolladores (Frente INT): llaves de API con aleatoriedad criptográfica y solo su huella;
 * prueba de webhook saliente REAL, firmada y protegida contra SSRF.
 */
import crypto from 'crypto';
import { crearBaseFalsa } from './baseFalsa';
import {
  crearLlave,
  crearLookupSeguro,
  enviarConIpFijada,
  firmarCuerpo,
  generarLlaveApi,
  generarSecretoWebhook,
  huellaLlave,
  ipPublica,
  probarWebhookSaliente,
  validarDestino,
} from '../desarrolladores.server';

const ORG = 7;

describe('llaves de API', () => {
  it('usa crypto.randomBytes(32), guarda SHA-256 y una máscara con los últimos 4', () => {
    const aleatorio = jest.fn((n: number) => Buffer.alloc(n, 7));
    const { llave, hash, mascara } = generarLlaveApi(aleatorio);
    expect(aleatorio).toHaveBeenCalledWith(32);
    expect(llave.startsWith('goak_')).toBe(true);
    expect(llave.length).toBeGreaterThan(40);
    expect(hash).toBe(crypto.createHash('sha256').update(llave).digest('hex'));
    expect(mascara).toBe(`goak_··${llave.slice(-4)}`);
  });

  it('dos llaves seguidas son distintas y la huella es reproducible', () => {
    const a = generarLlaveApi();
    const b = generarLlaveApi();
    expect(a.llave).not.toBe(b.llave);
    expect(huellaLlave(a.llave)).toBe(a.hash);
  });

  it('crear guarda solo hash y máscara (nunca la llave) y devuelve la completa una vez', async () => {
    const base = crearBaseFalsa();
    const r = await crearLlave(base.db, { organizationId: ORG, userId: 'u', memberId: 3 }, { nombre: 'Tienda propia', alcances: ['read:products', 'inventado'] });
    const fila = base.tablas.channel_api_keys[0];
    expect(fila.key_hash).toBe(huellaLlave(r.completa));
    expect(JSON.stringify(fila)).not.toContain(r.completa);
    expect(fila.scopes).toEqual(['read:products']);
    expect(fila.organization_id).toBe(ORG);
  });

  it('el secreto de webhook también es criptográfico', () => {
    expect(generarSecretoWebhook(() => Buffer.alloc(24, 1))).toMatch(/^whsec_[A-Za-z0-9_-]{32}$/);
  });
});

describe('SSRF', () => {
  it.each(['127.0.0.1', '10.0.0.5', '172.16.3.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1'])('rechaza %s', (ip) => {
    expect(ipPublica(ip)).toBe(false);
  });
  it('acepta una IP pública', () => expect(ipPublica('8.8.8.8')).toBe(true));

  it('exige https, sin credenciales, y resuelve a IP pública', async () => {
    await expect(validarDestino('http://ejemplo.co/x', async () => ['8.8.8.8'])).rejects.toMatchObject({ status: 400 });
    await expect(validarDestino('https://u:p@ejemplo.co/x', async () => ['8.8.8.8'])).rejects.toMatchObject({ status: 400 });
    await expect(validarDestino('https://interno.ejemplo.co/x', async () => ['10.0.0.1'])).rejects.toMatchObject({ status: 400 });
    await expect(validarDestino('https://localhost/x', async () => ['8.8.8.8'])).rejects.toMatchObject({ status: 400 });
    await expect(validarDestino('https://ejemplo.co/x', async () => ['8.8.8.8'])).resolves.toBeInstanceOf(URL);
  });
});

describe('probarWebhookSaliente', () => {
  const ID = 'eeeeeeee-eeee-4eee-8eee-000000000001';
  const base = () => crearBaseFalsa({
    webhook_endpoints: [{ id: ID, organization_id: ORG, target_url: 'https://erp.ejemplo.co/hooks', secret: 'whsec_prueba', events: ['sale.created'], consecutive_failures: 2 }],
  });

  it('envía de verdad un POST firmado y registra el resultado', async () => {
    const b = base();
    const fetchImpl = jest.fn(async () => ({ status: 200 }) as Response);
    const r = await probarWebhookSaliente(b.db, ORG, ID, { fetchImpl: fetchImpl as unknown as typeof fetch, resolver: async () => ['8.8.8.8'] });
    expect(r).toMatchObject({ ok: true, http: 200 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://erp.ejemplo.co/hooks');
    expect(init.redirect).toBe('manual');
    const firma = (init.headers as Record<string, string>)['X-GoAdmin-Signature'];
    const t = Number(/t=(\d+)/.exec(firma)![1]);
    expect(firma).toBe(firmarCuerpo('whsec_prueba', String(init.body), t));
    expect(b.tablas.webhook_endpoints[0]).toMatchObject({ last_response_status: 200, consecutive_failures: 0 });
  });

  it('un 500 no es éxito y suma un fallo seguido', async () => {
    const b = base();
    const r = await probarWebhookSaliente(b.db, ORG, ID, { fetchImpl: (async () => ({ status: 500 })) as unknown as typeof fetch, resolver: async () => ['8.8.8.8'] });
    expect(r).toMatchObject({ ok: false, http: 500, motivo: 'respuesta' });
    expect(b.tablas.webhook_endpoints[0].consecutive_failures).toBe(3);
  });

  it('webhook de otra organización → 404 sin enviar nada', async () => {
    const b = base();
    const fetchImpl = jest.fn();
    await expect(probarWebhookSaliente(b.db, 8, ID, { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toMatchObject({ status: 404 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('DNS rebinding', () => {
  const lookupComo = (resolver: (h: string) => Promise<string[]>, all = false) =>
    new Promise<{ err: unknown; dir: unknown; fam?: unknown }>((ok) =>
      (crearLookupSeguro(resolver) as unknown as (h: string, o: object, cb: (e: unknown, d?: unknown, f?: unknown) => void) => void)(
        'erp.ejemplo.co',
        { all },
        (err, dir, fam) => ok({ err, dir, fam }),
      ),
    );

  it('la conexión usa la IP validada (pública) y nada más', async () => {
    expect(await lookupComo(async () => ['8.8.8.8'])).toMatchObject({ err: null, dir: '8.8.8.8', fam: 4 });
    expect(await lookupComo(async () => ['8.8.8.8'], true)).toMatchObject({ err: null, dir: [{ address: '8.8.8.8', family: 4 }] });
  });

  it('si el DNS cambia a una IP interna al conectar, la conexión se rechaza', async () => {
    const r = await lookupComo(async () => ['169.254.169.254']);
    expect(r.err).toMatchObject({ code: 'EDESTINO_PRIVADO' });
    const mezcla = await lookupComo(async () => ['8.8.8.8', '10.0.0.1']);
    expect(mezcla.err).toMatchObject({ code: 'EDESTINO_PRIVADO' });
  });

  it('el envío real falla antes de conectar si el nombre resuelve a una IP privada', async () => {
    await expect(
      enviarConIpFijada(new URL('https://interno.ejemplo.co/x'), { headers: {}, body: '{}', signal: new AbortController().signal }, async () => ['127.0.0.1']),
    ).rejects.toMatchObject({ code: 'EDESTINO_PRIVADO' });
  });
});
