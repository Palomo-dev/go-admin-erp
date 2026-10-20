import {
  dominioCompradoAqui,
  elegirPendientes,
  loteRotativo,
  nombreRelativo,
  planPublicacion,
  registrosPublicables,
} from '../registrosCorreo';

const DOMINIO = 'tumarca.co';

describe('registros de correo del dominio comprado', () => {
  test('el nombre queda relativo al dominio', () => {
    expect(nombreRelativo('send.tumarca.co.', DOMINIO)).toBe('send');
    expect(nombreRelativo('resend._domainkey.tumarca.co', DOMINIO)).toBe('resend._domainkey');
    expect(nombreRelativo('@', DOMINIO)).toBe('');
    expect(nombreRelativo('tumarca.co', DOMINIO)).toBe('');
  });

  test('publica DKIM, el retorno en send y rsend; nunca el MX del apex ni www', () => {
    const pubs = registrosPublicables(
      [
        { record: 'DKIM', name: 'resend._domainkey.tumarca.co', type: 'TXT', value: 'p=abc' },
        { record: 'SPF', name: 'send', type: 'MX', value: 'feedback-smtp.sa-east-1.amazonses.com.', priority: 10 },
        { record: 'SPF', name: 'send', type: 'TXT', value: '"v=spf1 include:amazonses.com ~all"' },
        { record: 'SPF', name: 'rsend', type: 'CNAME', value: 'track.example.com' },
        { record: 'Receiving', name: 'tumarca.co', type: 'MX', value: 'inbound.example.com', priority: 10 },
        { record: 'Receiving', name: 'mail', type: 'MX', value: 'inbound.example.com', priority: 10 },
        { name: 'www', type: 'CNAME', value: 'cname.vercel-dns.com' },
        { record: 'DMARC', name: '_dmarc.tumarca.co', type: 'TXT', value: 'v=DMARC1; p=none' },
      ],
      DOMINIO,
    );
    expect(pubs.map((r) => `${r.type} ${r.name}`)).toEqual([
      'TXT resend._domainkey',
      'MX send',
      'TXT send',
      'CNAME rsend',
      'TXT _dmarc',
    ]);
    expect(pubs.find((r) => r.type === 'MX')?.mxPriority).toBe(10);
    expect(pubs.find((r) => r.name === 'send' && r.type === 'TXT')?.value).toBe('v=spf1 include:amazonses.com ~all');
  });

  test('no pisa un DMARC, un CNAME ni un MX que ya tengan otro valor', () => {
    const deseados = registrosPublicables(
      [
        { name: 'resend._domainkey', type: 'TXT', value: 'p=abc' },
        { name: 'send', type: 'MX', value: 'feedback-smtp.sa-east-1.amazonses.com', priority: 10 },
        { name: 'send', type: 'TXT', value: 'v=spf1 include:amazonses.com ~all' },
        { name: 'rsend', type: 'CNAME', value: 'track.example.com' },
        { name: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=none' },
      ],
      DOMINIO,
    );
    const plan = planPublicacion(
      deseados,
      [
        { name: '', type: 'MX', value: 'aspmx.l.google.com', mxPriority: 1 },
        { name: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=reject' },
        { name: 'rsend', type: 'CNAME', value: 'otro.example.com' },
        { name: 'send', type: 'TXT', value: 'v=spf1 include:amazonses.com ~all' },
      ],
      DOMINIO,
    );
    expect(plan.omitidos).toEqual(['cname:rsend', 'dmarc']);
    expect(plan.yaEstaban).toBe(1);
    expect(plan.crear.map((r) => `${r.type} ${r.name}`)).toEqual(['TXT resend._domainkey', 'MX send']);
  });

  test('un registro idéntico no se vuelve a crear', () => {
    const plan = planPublicacion(
      [{ name: 'send', type: 'MX', value: 'feedback-smtp.sa-east-1.amazonses.com', mxPriority: 10 }],
      [{ name: 'send.tumarca.co', type: 'MX', value: 'feedback-smtp.sa-east-1.amazonses.com.', mxPriority: 10 }],
      DOMINIO,
    );
    expect(plan.crear).toEqual([]);
    expect(plan.yaEstaban).toBe(1);
  });
});

describe('quién falta por verificar', () => {
  const base = {
    status: 'verified',
    isPrimary: true,
    isActive: true,
    domainType: 'custom_domain',
    metadata: {},
  };

  test('solo el comprado, principal y sin correo verificado', () => {
    const pendientes = elegirPendientes(
      [
        { ...base, organizationId: 10, host: 'Comprado.Test' },
        { ...base, organizationId: 11, host: 'propio.test' },
        { ...base, organizationId: 12, host: 'listo.test' },
        { ...base, organizationId: 13, host: 'pago.test', metadata: { stripe_payment_intent: 'pi_x' } },
        { ...base, organizationId: 14, host: 'alias.test', domainType: 'www_alias' },
        { ...base, organizationId: 15, host: 'apagado.test', isActive: false },
      ],
      [
        { organizationId: 10, domain: 'comprado.test', status: 'completed' },
        { organizationId: 12, domain: 'listo.test', status: 'completed' },
        { organizationId: 11, domain: 'propio.test', status: 'pending' },
      ],
      [
        { organizationId: 12, domain: 'listo.test', status: 'verified' },
        { organizationId: 10, domain: 'comprado.test', status: 'pending' },
      ],
    );
    expect(pendientes).toEqual([
      { organizationId: 10, host: 'comprado.test' },
      { organizationId: 13, host: 'pago.test' },
    ]);
  });

  test('el comprobante de compra basta, sin mirar el nombre', () => {
    expect(dominioCompradoAqui({}, { domain: 'comprado.test' })).toBe(true);
    expect(dominioCompradoAqui({ source: 'sitio_web' }, null)).toBe(false);
    expect(dominioCompradoAqui({ stripe_payment_intent: 'pi_x' }, null)).toBe(true);
  });

  test('el lote rota para no dejar siempre los mismos al principio', () => {
    const items = ['a', 'b', 'c', 'd'];
    expect(loteRotativo(items, 0, 2)).toEqual(['a', 'b']);
    expect(loteRotativo(items, 3, 2)).toEqual(['d', 'a']);
    expect(loteRotativo(items, -1, 2)).toEqual(['d', 'a']);
  });
});
