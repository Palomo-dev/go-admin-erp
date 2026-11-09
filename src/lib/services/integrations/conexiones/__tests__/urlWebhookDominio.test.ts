/**
 * URL de eventos de Wompi por dominio (decisión del dueño, 2026-11-08): Wompi admite UNA sola URL
 * por comercio y ambiente; se pega la del dominio principal verificado de la organización
 * (`https://{dominio}/api/webhooks/wompi_co`, en la tienda), que reenvía al ERP lo que no es suyo.
 * Sin dominio verificado se conserva la del ERP y la UI explica por qué.
 */
import fs from 'fs';
import path from 'path';
import { crearBaseFalsa, type Fila } from './baseFalsa';
import { hostPrincipalVerificado, RUTA_WEBHOOK_WOMPI_TIENDA, usaDominioDeTienda, webhookDeConexion } from '../urlsWebhook';
import { detalleConexion, guardarLlaves } from '../conexiones.server';

const ORG = 7;
const OTRA_ORG = 8;
const ACTOR = { organizationId: ORG, userId: 'u-1' };
const CONECTOR_WOMPI = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const CONEXION = 'cccccccc-cccc-4ccc-8ccc-000000000001';
const ERP = 'https://app.ejemplo.co';
const LLAVES_OK = { public_key: 'pub_prod_NUEVA1', private_key: 'prv_prod_NUEVA2', events_secret: 'prod_events_N3', integrity_secret: 'prod_integrity_N4' };

process.env.NEXT_PUBLIC_APP_URL = ERP;
afterEach(() => jest.restoreAllMocks());

const dominio = (extra: Partial<Fila> = {}): Fila => ({
  id: `d-${Math.random()}`,
  organization_id: ORG,
  host: 'tienda-ejemplo.co',
  domain_type: 'custom_domain',
  status: 'verified',
  is_primary: true,
  is_active: true,
  updated_at: '2026-11-01T00:00:00Z',
  ...extra,
});

const fila = (d: Fila) => ({
  host: String(d.host),
  domain_type: String(d.domain_type),
  status: String(d.status),
  is_primary: d.is_primary === true,
  is_active: d.is_active === true,
  updated_at: (d.updated_at as string) ?? null,
});

function respuesta(status: number, json: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => json } as Response;
}

function baseWompi(extra: Record<string, Fila[]> = {}) {
  return crearBaseFalsa({
    integration_providers: [{ code: 'wompi', name: 'Wompi', category: 'payments', is_active: true }],
    integration_connectors: [{ id: CONECTOR_WOMPI, code: 'wompi_co', name: 'Wompi Colombia', is_active: true, provider: { code: 'wompi', name: 'Wompi', category: 'payments' } }],
    branches: [{ id: 1, organization_id: ORG }],
    ...extra,
  });
}

describe('hostPrincipalVerificado', () => {
  it('dominio propio principal, verificado y activo', () => {
    expect(hostPrincipalVerificado([fila(dominio())])).toBe('tienda-ejemplo.co');
  });
  it('subdominio del sistema principal y verificado (también lo sirve la tienda)', () => {
    expect(hostPrincipalVerificado([fila(dominio({ host: 'mitienda.goadmin.io', domain_type: 'system_subdomain' }))])).toBe('mitienda.goadmin.io');
  });
  it('sin principal verificado y activo → null (nunca el subdominio sin verificar)', () => {
    expect(hostPrincipalVerificado([fila(dominio({ status: 'pending' }))])).toBeNull();
    expect(hostPrincipalVerificado([fila(dominio({ is_active: false }))])).toBeNull();
    expect(hostPrincipalVerificado([fila(dominio({ is_primary: false }))])).toBeNull();
    expect(hostPrincipalVerificado([fila(dominio({ domain_type: 'www_alias' }))])).toBeNull();
    expect(hostPrincipalVerificado([])).toBeNull();
  });
  it('normaliza el host y descarta valores que no son un host', () => {
    expect(hostPrincipalVerificado([fila(dominio({ host: 'HTTPS://Tienda-Ejemplo.CO/' }))])).toBe('tienda-ejemplo.co');
    expect(hostPrincipalVerificado([fila(dominio({ host: 'no es un host' }))])).toBeNull();
  });
});

describe('webhookDeConexion', () => {
  it('Wompi con dominio → la URL de la tienda', () => {
    expect(webhookDeConexion('wompi_co', 'tienda-ejemplo.co', ERP)).toEqual({
      url: `https://tienda-ejemplo.co${RUTA_WEBHOOK_WOMPI_TIENDA}`,
      origen: 'tienda',
      sinDominioVerificado: false,
    });
  });
  it('Wompi sin dominio → la del ERP, marcada para que la UI explique', () => {
    expect(webhookDeConexion('wompi_co', null, ERP)).toEqual({
      url: `${ERP}/api/integrations/wompi/webhook`,
      origen: 'erp',
      sinDominioVerificado: true,
    });
  });
  it('los demás conectores no cambian aunque haya dominio', () => {
    expect(webhookDeConexion('bold_link', 'tienda-ejemplo.co', ERP)).toEqual({ url: `${ERP}/api/integrations/bold/webhook`, origen: 'erp', sinDominioVerificado: false });
    expect(webhookDeConexion('booking_ota', 'tienda-ejemplo.co', ERP)).toEqual({ url: null, origen: null, sinDominioVerificado: false });
    expect(usaDominioDeTienda('wompi_co')).toBe(true);
    expect(usaDominioDeTienda('mp_checkout')).toBe(false);
  });
});

describe('guardarLlaves y detalle: la URL sale del dominio de LA organización de la sesión', () => {
  it('Wompi con dominio principal verificado → URL de la tienda', async () => {
    const base = baseWompi({ organization_domains: [dominio(), dominio({ host: 'mitienda.goadmin.io', domain_type: 'system_subdomain', is_primary: false })] });
    jest.spyOn(global, 'fetch').mockResolvedValue(respuesta(200, { data: { name: 'Comercio' } }));
    const r = await guardarLlaves(base.db, ACTOR, { proveedor: 'wompi', ambiente: 'production', valores: LLAVES_OK });
    expect(r.prueba.resultado).toBe('correcta');
    expect(r).toMatchObject({ webhookUrl: 'https://tienda-ejemplo.co/api/webhooks/wompi_co', webhookOrigen: 'tienda', webhookSinDominio: false });
  });

  it('el dominio de OTRA organización nunca se muestra', async () => {
    const base = baseWompi({ organization_domains: [dominio({ organization_id: OTRA_ORG, host: 'otra-tienda.co' })] });
    jest.spyOn(global, 'fetch').mockResolvedValue(respuesta(200, { data: { name: 'Comercio' } }));
    const r = await guardarLlaves(base.db, ACTOR, { proveedor: 'wompi', ambiente: 'production', valores: LLAVES_OK });
    expect(r.webhookUrl).toBe(`${ERP}/api/integrations/wompi/webhook`);
    expect(r).toMatchObject({ webhookOrigen: 'erp', webhookSinDominio: true });
  });

  it('dominio sin verificar → la del ERP con la explicación', async () => {
    const base = baseWompi({ organization_domains: [dominio({ status: 'verifying' })] });
    jest.spyOn(global, 'fetch').mockResolvedValue(respuesta(200, { data: { name: 'Comercio' } }));
    const r = await guardarLlaves(base.db, ACTOR, { proveedor: 'wompi', ambiente: 'production', valores: LLAVES_OK });
    expect(r).toMatchObject({ webhookUrl: `${ERP}/api/integrations/wompi/webhook`, webhookOrigen: 'erp', webhookSinDominio: true });
  });

  it('llaves rechazadas → sin URL', async () => {
    const base = baseWompi({ organization_domains: [dominio()] });
    jest.spyOn(global, 'fetch').mockResolvedValue(respuesta(401));
    const r = await guardarLlaves(base.db, ACTOR, { proveedor: 'wompi', ambiente: 'production', valores: LLAVES_OK });
    expect(r).toMatchObject({ webhookUrl: null, webhookOrigen: null, webhookSinDominio: false });
  });

  it('el detalle de la conexión muestra la misma URL', async () => {
    const base = baseWompi({
      organization_domains: [dominio()],
      integration_connections: [{ id: CONEXION, organization_id: ORG, connector_id: CONECTOR_WOMPI, environment: 'production', status: 'connected', settings: {} }],
    });
    const d = await detalleConexion(base.db, ORG, CONEXION);
    expect(d).toMatchObject({ webhookUrl: 'https://tienda-ejemplo.co/api/webhooks/wompi_co', webhookOrigen: 'tienda', webhookSinDominio: false });
  });
});

describe('receptor de Wompi del ERP con el reenvío de la tienda', () => {
  const fuente = fs.readFileSync(path.join(process.cwd(), 'src/app/api/integrations/wompi/webhook/route.ts'), 'utf8');
  it('no elige la organización por cabeceras: solo por la firma del cuerpo', () => {
    expect(fuente).not.toMatch(/request\.headers/);
    expect(fuente).not.toMatch(/x-goadmin|x-forwarded-host|x-custom-domain/i);
    expect(fuente).toMatch(/conexionesQueFirmaron\(admin, event\)/);
  });
  it('sin firma válida de ninguna conexión → 401 (lo que la tienda devuelve a Wompi)', () => {
    expect(fuente).toMatch(/if \(firmantes\.length === 0\) \{\s*return noAutorizado/);
  });
});
