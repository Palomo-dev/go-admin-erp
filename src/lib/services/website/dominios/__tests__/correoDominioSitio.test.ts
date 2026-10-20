/**
 * Alta del dominio comprado en el proveedor de correo, sin red.
 * Organización ficticia 120; host ficticio.
 */
import { EmailError } from '@/lib/services/crm/email/types';
import { fakeSupabase } from '@/lib/services/crm/email/__tests__/fakeSupabase';
import { aprovisionarCorreoDominioSitio, type DependenciasCorreoSitio, type FilaCorreo } from '../correoDominioSitio';
import { listarPendientes } from '../reintentoCorreoSitio';

const REGISTROS = [
  { record: 'DKIM', name: 'resend._domainkey', type: 'TXT', value: 'p=abc', status: 'not_started' },
  { record: 'SPF', name: 'send', type: 'MX', value: 'feedback-smtp.sa-east-1.amazonses.com', priority: 10, status: 'not_started' },
  { record: 'SPF', name: 'send', type: 'TXT', value: 'v=spf1 include:amazonses.com ~all', status: 'not_started' },
  { record: 'SPF', name: 'rsend', type: 'CNAME', value: 'track.example.com', status: 'not_started' },
  { record: 'Receiving', name: 'tumarca.co', type: 'MX', value: 'inbound.example.com', priority: 10, status: 'not_started' },
  { record: 'DMARC', name: '_dmarc.tumarca.co', type: 'TXT', value: 'v=DMARC1; p=none', status: 'recommended' },
];

function fila(parcial: Partial<FilaCorreo> = {}): FilaCorreo {
  return {
    id: 'dom-1',
    domain: 'tumarca.co',
    status: 'pending',
    is_default: false,
    dns_records: REGISTROS,
    from_email: 'pedidos@tumarca.co',
    ...parcial,
  };
}

function depsDe(sobre: Partial<DependenciasCorreoSitio> & Pick<DependenciasCorreoSitio, 'servicio'>): DependenciasCorreoSitio {
  return {
    dns: null,
    proveedorListo: true,
    crearDominio: jest.fn(async () => fila()),
    verificarDominio: jest.fn(async () => fila({ status: 'verified' })),
    adoptar: jest.fn(async () => null),
    ...sobre,
  };
}

describe('aprovisionarCorreoDominioSitio', () => {
  test('crea el dominio solo de envío, publica el DNS y lo deja predeterminado al verificar', async () => {
    const { client, calls } = fakeSupabase((c) => {
      if (c.table === 'email_domains' && c.op === 'select') return { data: [], error: null };
      return { data: null, error: null };
    });
    const crear = jest.fn(async () => undefined);
    const deps = depsDe({
      servicio: client,
      dns: {
        listar: async () => [{ name: '', type: 'MX', value: 'aspmx.l.google.com', mxPriority: 1 }, { name: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=reject' }],
        crear,
      },
    });
    const r = await aprovisionarCorreoDominioSitio({ organizationId: 120, host: 'TuMarca.CO', nombreOrganizacion: 'Mi empresa' }, deps);
    expect(r).toEqual({ organizationId: 120, host: 'tumarca.co', estado: 'verificado' });
    expect(deps.crearDominio).toHaveBeenCalledWith(
      120,
      expect.objectContaining({
        domain: 'tumarca.co',
        region: 'sa-east-1',
        from_email_local: 'pedidos',
        from_name: 'Mi empresa',
        open_tracking: false,
        click_tracking: false,
        receiving_enabled: false,
        is_default: false,
      }),
      client,
    );
    expect(crear.mock.calls.map((c) => `${(c[1] as { type: string }).type} ${(c[1] as { name: string }).name}`)).toEqual([
      'TXT resend._domainkey',
      'MX send',
      'TXT send',
      'CNAME rsend',
    ]);
    expect(deps.verificarDominio).toHaveBeenCalledWith(120, 'dom-1', client);
    const pred = calls.filter((c) => c.op === 'update' && (c.args[0] as { is_default?: boolean }).is_default === true);
    expect(pred).toHaveLength(1);
    expect(pred[0].filters).toContainEqual(['eq', 'organization_id', 120]);
  });

  test('si ya está verificado no vuelve a crear el dominio y sí lo deja predeterminado', async () => {
    const { client } = fakeSupabase((c) => (c.table === 'email_domains' ? { data: [fila({ status: 'verified', is_default: false })], error: null } : { data: null, error: null }));
    const deps = depsDe({ servicio: client });
    const r = await aprovisionarCorreoDominioSitio({ organizationId: 120, host: 'tumarca.co', nombreOrganizacion: null }, deps);
    expect(r.estado).toBe('omitido');
    expect(r.motivo).toBe('ya_verificado');
    expect(deps.crearDominio).not.toHaveBeenCalled();
    expect(deps.verificarDominio).not.toHaveBeenCalled();
  });

  test('si el proveedor ya lo tiene y aquí no hay fila, adopta y verifica', async () => {
    const { client } = fakeSupabase((c) => (c.table === 'email_domains' && c.op === 'select' ? { data: [], error: null } : { data: null, error: null }));
    const deps = depsDe({
      servicio: client,
      crearDominio: jest.fn(async () => {
        throw new EmailError('PROVIDER', 'already registered', 502);
      }),
      adoptar: jest.fn(async () => fila()),
      verificarDominio: jest.fn(async () => fila({ status: 'pending' })),
    });
    const r = await aprovisionarCorreoDominioSitio({ organizationId: 120, host: 'tumarca.co', nombreOrganizacion: null }, deps);
    expect(deps.adoptar).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 120, host: 'tumarca.co' }), client);
    expect(r).toMatchObject({ estado: 'pendiente', motivo: 'pending' });
  });

  test('sin proveedor no llama a nadie', async () => {
    const deps = depsDe({ servicio: fakeSupabase(() => ({ data: null, error: null })).client, proveedorListo: false });
    const r = await aprovisionarCorreoDominioSitio({ organizationId: 120, host: 'tumarca.co', nombreOrganizacion: null }, deps);
    expect(r).toMatchObject({ estado: 'omitido', motivo: 'sin_proveedor' });
    expect(deps.crearDominio).not.toHaveBeenCalled();
  });

  test('un dominio de la plataforma no se registra', async () => {
    const deps = depsDe({ servicio: fakeSupabase(() => ({ data: null, error: null })).client });
    const r = await aprovisionarCorreoDominioSitio({ organizationId: 120, host: 'tienda.goadmin.io', nombreOrganizacion: null }, deps);
    expect(r).toMatchObject({ estado: 'omitido', motivo: 'host' });
  });
});

describe('listarPendientes', () => {
  test('pide los principales comprados que no tienen el correo verificado', async () => {
    const { client } = fakeSupabase((c) => {
      if (c.table === 'organization_domains') {
        return {
          data: [
            { organization_id: 10, host: 'comprado.test', status: 'verified', is_primary: true, is_active: true, domain_type: 'custom_domain', metadata: {} },
            { organization_id: 12, host: 'listo.test', status: 'verified', is_primary: true, is_active: true, domain_type: 'custom_domain', metadata: {} },
          ],
          error: null,
        };
      }
      if (c.table === 'domain_purchases') {
        return {
          data: [
            { organization_id: 10, domain: 'comprado.test', status: 'completed' },
            { organization_id: 12, domain: 'listo.test', status: 'completed' },
          ],
          error: null,
        };
      }
      if (c.table === 'email_domains') return { data: [{ organization_id: 12, domain: 'listo.test', status: 'verified' }], error: null };
      if (c.table === 'organizations') return { data: [{ id: 10, name: 'Mi empresa' }], error: null };
      return { data: [], error: null };
    });
    const lista = await listarPendientes(client, new Date('2026-10-20T15:00:00Z'), 8);
    expect(lista).toEqual([{ organizationId: 10, host: 'comprado.test', nombreOrganizacion: 'Mi empresa' }]);
  });
});
