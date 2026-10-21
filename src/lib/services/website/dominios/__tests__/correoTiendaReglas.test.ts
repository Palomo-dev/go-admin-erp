import {
  MENSAJE_LIMITE_PLAN,
  VALOR_DMARC,
  debePublicar,
  dominioDeEnvio,
  esAvisoLimitePlan,
  esperaReintentoMs,
  falloAlCrearDominio,
  limitePlanVisible,
  hostDeZona,
  nombreRelativo,
  registrosDeProveedor,
  vencioPlazo,
  yaTieneRemitenteVerificado,
} from '../correoTiendaReglas';

describe('correo de pedidos de la tienda', () => {
  test('el envío sale del dominio raíz y no de un subdominio de la plataforma', () => {
    expect(hostDeZona('tienda.example', 'custom_domain')).toBe('tienda.example');
    expect(hostDeZona('www.tienda.example', 'www_alias')).toBe('tienda.example');
    expect(hostDeZona('tienda.goadmin.io', 'system_subdomain')).toBeNull();
    expect(hostDeZona('otro.goadmin.io', 'custom_domain')).toBeNull();
    expect(dominioDeEnvio('tienda.example')).toBe('tienda.example');
    expect(dominioDeEnvio('send.tienda.example')).toBe('tienda.example');
  });

  test('un dominio ya verificado no se vuelve a crear', () => {
    const filas = [{ domain: 'tienda.example', status: 'verified' }];
    expect(yaTieneRemitenteVerificado(filas, 'tienda.example')).toBe(true);
    expect(yaTieneRemitenteVerificado([{ domain: 'send.tienda.example', status: 'verified' }], 'tienda.example')).toBe(true);
    expect(yaTieneRemitenteVerificado([{ domain: 'tienda.example', status: 'pending' }], 'tienda.example')).toBe(false);
  });

  test('el MX de la raíz no se publica y el DMARC existente no se pisa', () => {
    expect(nombreRelativo('send.tienda.example', 'tienda.example')).toBe('send');
    expect(nombreRelativo('resend._domainkey.tienda.example', 'tienda.example')).toBe('resend._domainkey');
    const registros = registrosDeProveedor([
      { type: 'TXT', name: 'send.tienda.example', value: 'v=spf1 include:amazonses.com ~all' },
      { type: 'MX', name: 'send.tienda.example', value: 'feedback-smtp.amazonses.com', priority: 10 },
      { type: 'MX', name: 'tienda.example', value: 'aspmx.example.net', priority: 1 },
    ], 'tienda.example');
    const dmarc = registros.find((r) => nombreRelativo(r.nombre, 'tienda.example') === '_dmarc');
    expect(dmarc?.valor).toBe(VALOR_DMARC);
    expect(debePublicar([], registros.find((r) => r.tipo === 'MX' && nombreRelativo(r.nombre, 'tienda.example') === '')!, 'tienda.example')).toBe(false);
    expect(debePublicar(
      [{ tipo: 'TXT', nombre: '_dmarc', valor: 'v=DMARC1; p=reject;' }],
      { tipo: 'TXT', nombre: '_dmarc.tienda.example', valor: VALOR_DMARC, prioridad: null },
      'tienda.example',
    )).toBe(false);
    expect(debePublicar([], registros[0], 'tienda.example')).toBe(true);
    expect(debePublicar(
      [{ tipo: 'TXT', nombre: 'send', valor: registros[0].valor }],
      registros[0],
      'tienda.example',
    )).toBe(false);
  });

  test('el límite del plan no se reintenta y cualquier otro fallo sí deja el mensaje', () => {
    const limite = falloAlCrearDominio(403, {
      name: 'validation_error',
      message: 'You have reached the domain limit of your plan. Upgrade to add more.',
    });
    expect(limite.limitePlan).toBe(true);
    expect(limite.mensaje.startsWith(MENSAJE_LIMITE_PLAN)).toBe(true);
    expect(limite.mensaje).toContain('validation_error');
    expect(esAvisoLimitePlan(limite.mensaje)).toBe(true);
    expect(falloAlCrearDominio(403, { message: 'API key is invalid' }).limitePlan).toBe(false);
    expect(falloAlCrearDominio(500, { message: 'timeout del proveedor' })).toEqual({
      limitePlan: false,
      mensaje: 'timeout del proveedor',
    });
    expect(falloAlCrearDominio(0, null).mensaje).toBe('El proveedor no creó el dominio.');
  });

  test('el panel usa el estado y el código, no el texto del error', () => {
    expect(limitePlanVisible('failed', 'plan_domain_limit')).toBe(true);
    expect(limitePlanVisible('failed', null)).toBe(false);
    expect(limitePlanVisible('pending', 'plan_domain_limit')).toBe(false);
    expect(limitePlanVisible('verified', 'plan_domain_limit')).toBe(false);
    expect(limitePlanVisible('failed', 'El plan de correo no admite más dominios.')).toBe(false);
  });

  test('el reintento espera el doble y a las 72 horas se rinde', () => {
    expect(esperaReintentoMs(1)).toBe(15 * 60 * 1000);
    expect(esperaReintentoMs(2)).toBe(30 * 60 * 1000);
    expect(esperaReintentoMs(8)).toBe(esperaReintentoMs(7));
    const ahora = new Date('2026-10-21T12:00:00Z');
    expect(vencioPlazo('2026-10-18T12:00:01Z', ahora)).toBe(false);
    expect(vencioPlazo('2026-10-18T12:00:00Z', ahora)).toBe(true);
  });
});
