/**
 * Reporte a Sentry desde el servidor sin SDK (5-nov-2026): envelope bien formado, sin datos de
 * productos en el mensaje, nunca lanza, y la regla que evita duplicar el reporte del asistente.
 */
import { armarEnvelope, leerDsn, limpiarMensaje, reportarSentryServidor } from '../sentryServidor';
import { motivoCookieCorrupta } from '@/lib/auth/motivoCookieCorrupta';
import { ErrorApi, reportadoPorServidor } from '@/components/inventario/productos/importar/apiImportacion';

const DSN = 'https://abc123@o42.ingest.us.sentry.io/4507';

describe('DSN', () => {
  test('arma el endpoint de envelopes del proyecto', () => {
    expect(leerDsn(DSN)).toEqual({ clave: 'abc123', url: 'https://o42.ingest.us.sentry.io/api/4507/envelope/', original: DSN });
  });
  test('sin DSN o inválido → null (no se reporta)', () => {
    expect(leerDsn(undefined)).toBeNull();
    expect(leerDsn('')).toBeNull();
    expect(leerDsn('https://o42.ingest.sentry.io/4507')).toBeNull();
    expect(leerDsn('no es url')).toBeNull();
  });
});

describe('mensaje sin datos de productos', () => {
  test('quita lo que Postgres repite entre comillas y en (col)=(valor)', () => {
    expect(limpiarMensaje('invalid input syntax for type numeric: "12,5 kg"')).toBe('invalid input syntax for type numeric: "…"');
    expect(limpiarMensaje("value 'Tenis Rojo 42' too long")).toBe("value '…' too long");
    expect(limpiarMensaje('Key (sku)=(ABC-123) already exists')).toBe('Key (…)=(…) already exists');
    expect(limpiarMensaje('x'.repeat(500))).toHaveLength(300);
  });
});

describe('envelope', () => {
  test('cabecera, ítem y evento con tags en texto y sin vacíos', () => {
    const { id, cuerpo, evento } = armarEnvelope(leerDsn(DSN)!, {
      error: new Error('duplicate key "SKU-1"'),
      tags: { area: 'importar_lote', organization_id: 120, bloque: 3, codigo: 'RPC_ERROR', vacio: null },
    }, new Date('2026-11-05T12:00:00Z'));
    const [cab, item, ev] = cuerpo.split('\n').map((l) => JSON.parse(l));
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(cab).toEqual({ event_id: id, sent_at: '2026-11-05T12:00:00.000Z', dsn: DSN });
    expect(item).toEqual({ type: 'event' });
    expect(ev).toEqual(evento);
    expect(ev.level).toBe('error');
    expect(ev.tags).toEqual({ area: 'importar_lote', organization_id: '120', bloque: '3', codigo: 'RPC_ERROR' });
    expect(ev.exception.values[0]).toEqual({ type: 'Error', value: 'duplicate key "…"' });
  });

  test('evento sin excepción (middleware): nivel warning y mensaje', () => {
    const { evento } = armarEnvelope(leerDsn(DSN)!, { mensaje: 'Redirección al login por sesión dañada', nivel: 'warning', tags: { area: 'sesion_corrupta' }, extra: { ruta: '/app/inicio' } });
    expect(evento.level).toBe('warning');
    expect(evento.message).toEqual({ formatted: 'Redirección al login por sesión dañada' });
    expect(evento.extra).toEqual({ ruta: '/app/inicio' });
    expect(evento).not.toHaveProperty('exception');
  });
});

describe('envío', () => {
  test('POST al endpoint con la clave; devuelve el id', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true });
    const id = await reportarSentryServidor({ mensaje: 'x', tags: { area: 'a' } }, { fetchImpl, dsnCrudo: DSN });
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://o42.ingest.us.sentry.io/api/4507/envelope/?sentry_key=abc123&sentry_version=7');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope' } });
  });

  test('sin DSN no llama; si Sentry falla o la red cae, no lanza', async () => {
    const fetchImpl = jest.fn();
    await expect(reportarSentryServidor({ mensaje: 'x', tags: {} }, { fetchImpl, dsnCrudo: null })).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    const espia = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(reportarSentryServidor({ mensaje: 'x', tags: {} }, { fetchImpl: jest.fn().mockRejectedValue(new Error('red')), dsnCrudo: DSN })).resolves.toBeNull();
    await expect(reportarSentryServidor({ mensaje: 'x', tags: {} }, { fetchImpl: jest.fn().mockResolvedValue({ ok: false }), dsnCrudo: DSN })).resolves.toBeNull();
    espia.mockRestore();
  });
});

describe('cookie de sesión dañada (middleware)', () => {
  test('las mismas condiciones de siempre, con su motivo', () => {
    expect(motivoCookieCorrupta('[object Object]')).toBe('object_object');
    expect(motivoCookieCorrupta('x[object Object]y')).toBe('object_object');
    expect(motivoCookieCorrupta('undefined')).toBe('undefined');
    expect(motivoCookieCorrupta('null')).toBe('null');
    expect(motivoCookieCorrupta('eyJhbGciOi')).toBe('no_json');
    expect(motivoCookieCorrupta(' {"access_token":"t"}')).toBeNull();
  });
});

describe('sin duplicar el reporte del asistente', () => {
  test('solo los 500 RPC_ERROR / INTERNAL de /importar/lote los reporta el servidor', () => {
    expect(reportadoPorServidor(new ErrorApi('x', 500, 'RPC_ERROR'))).toBe(true);
    expect(reportadoPorServidor(new ErrorApi('x', 500, 'INTERNAL'))).toBe(true);
    expect(reportadoPorServidor(new ErrorApi('x', 504, 'ERROR'))).toBe(false);
    expect(reportadoPorServidor(new ErrorApi('x', 400, 'INVALID_BODY'))).toBe(false);
    expect(reportadoPorServidor(new ErrorApi('x', 401, 'SESION_CORRUPTA'))).toBe(false);
    expect(reportadoPorServidor(new TypeError('Failed to fetch'))).toBe(false);
  });
});
