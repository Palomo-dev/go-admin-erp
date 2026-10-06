/**
 * Reglas puras de la lista de dominios (Figma B/07-01, 07-24, 07-25). Se corre
 * con TZ=UTC y TZ=America/Bogota (`npm run test:tz-all`): los días para vencer
 * y la regla de 60 días son diferencias de instantes, no días de calendario.
 * Hosts ficticios.
 */
import {
  aDominioSitio,
  accionContextual,
  alertasDominios,
  esComprado,
  estadoInsignia,
  estadoSsl,
  lineaSecundaria,
  ordenarDominios,
  puedeSerPrincipal,
  renovacionDe,
  tipoDominio,
  transferenciaDisponible,
  type FilaDominioBd,
} from '../estadoDominio';
import { fechaCorta, haceCuanto } from '../formatoDominio';

const AHORA = new Date('2026-10-06T15:00:00Z');
const enDias = (n: number) => new Date(AHORA.getTime() + n * 86_400_000).toISOString();

function fila(p: Partial<FilaDominioBd> = {}): FilaDominioBd {
  return {
    id: 'd-1',
    host: 'tumarca.com',
    domain_type: 'custom_domain',
    status: 'verified',
    is_primary: false,
    is_active: true,
    verified_at: '2026-01-01T00:00:00Z',
    last_verification_at: null,
    redirect_to_domain_id: null,
    redirect_status_code: null,
    vercel_state: {},
    metadata: {},
    ...p,
  };
}

const vacio = new Map<string, FilaDominioBd>();

describe('tipo, insignia y SSL', () => {
  test('subdominio del sistema: siempre activo con SSL y no vence', () => {
    const f = fila({ domain_type: 'system_subdomain', host: 'tu-marca.goadmin.io' });
    expect(tipoDominio(f)).toBe('subdominio');
    expect(estadoInsignia(f, AHORA).estado).toBe('activo');
    expect(estadoSsl(f)).toBe('emitido');
    expect(renovacionDe(f, 'subdominio', null)).toEqual({ tipo: 'no_vence' });
  });

  test('comprado: por domain_purchases o por la marca de la compra en metadata', () => {
    expect(esComprado(fila(), { domain: 'tumarca.com', created_at: '2026-01-01T00:00:00Z', amount: 10, currency: 'USD' })).toBe(true);
    expect(esComprado(fila({ metadata: { purchased_via: 'vercel_registrar' } }), null)).toBe(true);
    expect(esComprado(fila({ metadata: { source: 'vercel_purchase' } }), null)).toBe(true);
    expect(esComprado(fila({ metadata: { source: 'vercel_manual' } }), null)).toBe(false);
    expect(tipoDominio(fila())).toBe('propio');
    expect(tipoDominio(fila({ domain_type: 'www_alias' }))).toBe('alias_www');
  });

  test('pendiente ya revisado se ve como «Verificando DNS»; sin revisar, «Pendiente»', () => {
    expect(estadoInsignia(fila({ status: 'pending' }), AHORA).estado).toBe('pendiente');
    expect(estadoInsignia(fila({ status: 'pending', last_verification_at: enDias(-0.01) }), AHORA).estado).toBe('verificando');
    expect(estadoInsignia(fila({ status: 'verifying' }), AHORA).estado).toBe('verificando');
  });

  test('mal configurado: status failed o la marca de la verificación; SSL «—»', () => {
    const f = fila({ status: 'failed', vercel_state: { registros: [{ tipo: 'A', estado: 'otro_valor' }] } });
    expect(estadoInsignia(f, AHORA).estado).toBe('mal_configurado');
    expect(estadoSsl(f)).toBe('no_aplica');
    expect(aDominioSitio(f, AHORA, vacio).motivoError).toBe('a_otro_servidor');
    expect(estadoInsignia(fila({ status: 'verifying', vercel_state: { misconfigured: true } }), AHORA).estado).toBe('mal_configurado');
  });

  test('vence en 30 días o menos → «Vence en N días»; ya vencido → «Vencido»', () => {
    const r = estadoInsignia(fila({ metadata: { expires_at: enDias(21) } }), AHORA);
    expect(r).toEqual({ estado: 'vence_pronto', dias: 21 });
    expect(estadoInsignia(fila({ metadata: { expires_at: enDias(31) } }), AHORA).estado).toBe('activo');
    expect(estadoInsignia(fila({ expires_at: enDias(-2) }), AHORA).estado).toBe('vencido');
  });
});

describe('renovación', () => {
  test('comprado con renovación encendida o apagada, sin inventar fecha ni precio', () => {
    expect(renovacionDe(fila({ metadata: { auto_renew: true } }), 'comprado', null)).toEqual({ tipo: 'automatica', venceEn: null, precio: null, moneda: null });
    const apagada = renovacionDe(fila({ metadata: { auto_renew: false, expires_at: enDias(10) }, renewal_price: '89.9', renewal_currency: 'USD' }), 'comprado', null);
    expect(apagada).toEqual({ tipo: 'apagada', venceEn: enDias(10), precio: 89.9, moneda: 'USD' });
    // La columna nueva manda sobre metadata.
    expect(renovacionDe(fila({ auto_renew: true, metadata: { auto_renew: false } }), 'comprado', null).tipo).toBe('automatica');
  });

  test('propio: lo gestiona el proveedor; alias: incluido con su raíz', () => {
    expect(renovacionDe(fila(), 'propio', null)).toEqual({ tipo: 'proveedor' });
    expect(renovacionDe(fila({ host: 'www.tumarca.com' }), 'alias_www', 'tumarca.com')).toEqual({ tipo: 'incluida', con: 'tumarca.com' });
  });
});

describe('alertas (B/07-24)', () => {
  const porId = new Map<string, FilaDominioBd>();
  const compra = { domain: 'tumarca.co', created_at: '2026-01-01T00:00:00Z', amount: 10, currency: 'USD' };

  test('comprado que vence pronto con la renovación apagada → advertencia con «Activar renovación»', () => {
    const d = aDominioSitio(fila({ host: 'tumarca.co', metadata: { auto_renew: false, expires_at: enDias(21) } }), AHORA, porId, compra);
    expect(alertasDominios([d])).toEqual([
      { id: 'vence-d-1', dominioId: 'd-1', host: 'tumarca.co', tipo: 'vence_sin_renovar', tono: 'advertencia', dias: 21, puedeActivarRenovacion: true },
    ]);
  });

  test('con renovación automática, sin fecha o externo: sin alerta', () => {
    const auto = aDominioSitio(fila({ metadata: { auto_renew: true, expires_at: enDias(5) } }), AHORA, porId, compra);
    const sinFecha = aDominioSitio(fila({ metadata: { auto_renew: false } }), AHORA, porId, compra);
    const externo = aDominioSitio(fila({ metadata: { expires_at: enDias(5) } }), AHORA, porId, null);
    expect(alertasDominios([auto, sinFecha, externo])).toEqual([]);
  });

  test('vencido → peligro primero', () => {
    const a = aDominioSitio(fila({ id: 'a', metadata: { auto_renew: false, expires_at: enDias(10) } }), AHORA, porId, compra);
    const b = aDominioSitio(fila({ id: 'b', metadata: { auto_renew: true, expires_at: enDias(-1) } }), AHORA, porId, compra);
    expect(alertasDominios([a, b]).map((x) => x.tono)).toEqual(['peligro', 'advertencia']);
  });
});

describe('orden, línea secundaria y acciones', () => {
  const raiz = fila({ id: 'r', host: 'tumarca.com', is_primary: true });
  const www = fila({ id: 'w', host: 'www.tumarca.com', domain_type: 'www_alias', redirect_to_domain_id: 'r', redirect_status_code: 308 });
  const otro = fila({ id: 'o', host: 'tumarca.co' });
  const sub = fila({ id: 's', host: 'tu-marca.goadmin.io', domain_type: 'system_subdomain' });
  const porId = new Map([raiz, www, otro, sub].map((f) => [f.id, f]));
  const dtos = [sub, otro, www, raiz].map((f) => aDominioSitio(f, AHORA, porId, null));

  test('principal primero, su www debajo, el subdominio al final', () => {
    expect(ordenarDominios(dtos).map((d) => d.host)).toEqual(['tumarca.com', 'www.tumarca.com', 'tumarca.co', 'tu-marca.goadmin.io']);
  });

  test('línea secundaria por caso', () => {
    const [p, w, o, s] = ordenarDominios(dtos);
    expect(lineaSecundaria(p, true)).toEqual({ clave: 'principal' });
    expect(lineaSecundaria(w, true)).toEqual({ clave: 'redirige', host: 'tumarca.com', codigo: 308 });
    expect(lineaSecundaria(o, true)).toEqual({ clave: 'tambienAbre' });
    expect(lineaSecundaria(s, true)).toEqual({ clave: 'subdominioRedirige' });
    expect(lineaSecundaria(s, false)).toEqual({ clave: 'subdominio' });
    const verif = aDominioSitio(fila({ status: 'verifying', last_verification_at: '2026-10-06T14:56:00Z' }), AHORA, vacio);
    expect(lineaSecundaria(verif, true)).toEqual({ clave: 'revisado', en: '2026-10-06T14:56:00Z' });
  });

  test('acción contextual: Renovar, Registros o Revisar', () => {
    const c = { domain: 'x', created_at: '2026-01-01T00:00:00Z', amount: 1, currency: 'USD' };
    expect(accionContextual(aDominioSitio(fila({ metadata: { expires_at: enDias(5) } }), AHORA, vacio, c))).toBe('renovar');
    expect(accionContextual(aDominioSitio(fila({ status: 'verifying' }), AHORA, vacio))).toBe('registros');
    expect(accionContextual(aDominioSitio(fila({ status: 'failed' }), AHORA, vacio))).toBe('revisar');
    expect(accionContextual(aDominioSitio(fila(), AHORA, vacio))).toBeNull();
  });

  test('solo un dominio activo y verificado puede ser principal', () => {
    const [p, w, o, s] = ordenarDominios(dtos);
    expect(puedeSerPrincipal(p)).toBe(false);
    expect(puedeSerPrincipal(w)).toBe(false);
    expect(puedeSerPrincipal(o)).toBe(true);
    expect(puedeSerPrincipal(s)).toBe(true);
    expect(puedeSerPrincipal(aDominioSitio(fila({ status: 'verifying' }), AHORA, vacio))).toBe(false);
  });
});

describe('transferencia y formatos', () => {
  test('60 días desde la compra (ICANN)', () => {
    expect(transferenciaDisponible(enDias(-59), AHORA).puede).toBe(false);
    expect(transferenciaDisponible(enDias(-61), AHORA).puede).toBe(true);
    expect(transferenciaDisponible(null, AHORA)).toEqual({ puede: false, disponibleEn: null });
  });

  test('«14 mar 2027» en la zona de la organización, sin importar TZ del proceso', () => {
    expect(fechaCorta('2027-03-14T15:00:00Z', 'America/Bogota', 'es-CO')).toBe('14 mar 2027');
    // 03:00 UTC del 15 es todavía el 14 en Bogotá.
    expect(fechaCorta('2027-03-15T03:00:00Z', 'America/Bogota', 'es-CO')).toBe('14 mar 2027');
  });

  test('«hace N min / h / días»', () => {
    expect(haceCuanto('2026-10-06T14:59:40Z', AHORA)).toEqual({ clave: 'ahora' });
    expect(haceCuanto('2026-10-06T14:56:00Z', AHORA)).toEqual({ clave: 'minutos', n: 4 });
    expect(haceCuanto('2026-10-06T12:00:00Z', AHORA)).toEqual({ clave: 'horas', n: 3 });
    expect(haceCuanto('2026-10-05T12:00:00Z', AHORA)).toEqual({ clave: 'unDia' });
    expect(haceCuanto('2026-10-01T12:00:00Z', AHORA)).toEqual({ clave: 'dias', n: 5 });
    expect(haceCuanto(null, AHORA)).toBeNull();
  });
});
