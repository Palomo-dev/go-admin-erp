/**
 * Cierre del Frente INT: borrar e importar conexiones, pasos de Meta (85-42/43) y el navegador
 * sin secretos (integrationsService).
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no se usa'); } }));
jest.mock('@/lib/services/integrations/marketingAccess', () => ({ resolveOrgStoreDomain: async () => 'tienda.ejemplo.co' }));

const meta = {
  getCredentials: jest.fn(),
  getBusinessAccounts: jest.fn(),
  getAdAccounts: jest.fn(),
  listCatalogs: jest.fn(),
  listPixels: jest.fn(),
  createCatalog: jest.fn(),
  createPixel: jest.fn(),
  saveCredentials: jest.fn(),
  getProductsForSync: jest.fn(),
};
jest.mock('@/lib/services/integrations/meta/metaMarketingService', () => ({ metaMarketingService: meta }));

import fs from 'fs';
import path from 'path';
import { crearBaseFalsa } from './baseFalsa';
import { eliminarConexion, importarConexiones } from '../conexiones.server';
import { activosMeta, guardarActivosMeta, leerEnviosMeta } from '../metaActivos.server';

const ORG = 7;
const ACTOR = { organizationId: ORG, userId: 'u-1' };
const CONEXION = 'cccccccc-cccc-4ccc-8ccc-000000000001';
const CONECTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';

describe('eliminarConexion', () => {
  const base = (extra: Record<string, Record<string, unknown>[]> = {}) =>
    crearBaseFalsa({ integration_connections: [{ id: CONEXION, organization_id: ORG, connector_id: CONECTOR, status: 'connected' }], ...extra });

  it('no borra si un método de pago la usa (hay que desenlazar primero)', async () => {
    const b = base({ organization_payment_methods: [{ organization_id: ORG, payment_method_code: 'wompi', integration_connection_id: CONEXION }] });
    await expect(eliminarConexion(b.db, ACTOR, CONEXION)).rejects.toMatchObject({ status: 409, codigo: 'EN_USO' });
    expect(b.tablas.integration_connections).toHaveLength(1);
  });

  it('no borra si ya tiene cobros QR (se ofrece desconectar)', async () => {
    const b = base({ payment_qr_sessions: [{ id: 'q1', integration_connection_id: CONEXION }] });
    await expect(eliminarConexion(b.db, ACTOR, CONEXION)).rejects.toMatchObject({ status: 409, codigo: 'CON_HISTORIA' });
  });

  it('borra una conexión sin uso; la de otra organización → 404', async () => {
    const b = base();
    await expect(eliminarConexion(b.db, { ...ACTOR, organizationId: 8 }, CONEXION)).rejects.toMatchObject({ status: 404 });
    await expect(eliminarConexion(b.db, ACTOR, CONEXION)).resolves.toEqual({ eliminada: true });
    expect(b.tablas.integration_connections).toHaveLength(0);
  });
});

describe('importarConexiones', () => {
  it('crea solo borradores y reporta cada fila inválida', async () => {
    const b = crearBaseFalsa({
      integration_connectors: [{ id: CONECTOR, is_active: true }],
      branches: [{ id: 1, organization_id: ORG }],
      integration_connections: [{ id: CONEXION, organization_id: ORG, name: 'Existente' }],
    });
    const r = await importarConexiones(b.db, ACTOR, CONECTOR, [
      { nombre: 'Nueva', sucursalId: 1, ambiente: 'sandbox' },
      { nombre: 'existente' },
      { nombre: 'Otra', sucursalId: 99 },
      { nombre: 'Mala', ambiente: 'prod' },
      { nombre: '' },
    ]);
    expect(r).toMatchObject({ creadas: 1, fallidas: 4 });
    expect(r.errores[0]).toMatch(/^Fila 3/);
    const nueva = b.tablas.integration_connections.find((c) => c.name === 'Nueva');
    expect(nueva).toMatchObject({ status: 'draft', organization_id: ORG, branch_id: 1, environment: 'sandbox' });
  });

  it('conector inexistente → 404', async () => {
    const b = crearBaseFalsa({ integration_connectors: [] });
    await expect(importarConexiones(b.db, ACTOR, CONECTOR, [{ nombre: 'X' }])).rejects.toMatchObject({ status: 404 });
  });
});

describe('Meta: activos y qué se envía', () => {
  const conexionMeta = () =>
    crearBaseFalsa({
      integration_connections: [{ id: CONEXION, organization_id: ORG, settings: { otro: 1 }, connector: { code: 'meta_marketing' } }],
    });
  beforeEach(() => {
    jest.clearAllMocks();
    meta.getCredentials.mockResolvedValue({ accessToken: 'tok', appSecret: '', businessId: 'b1', adAccountId: 'act_1', pixelId: 'p1', catalogId: 'c1', productSetId: 's1' });
    meta.getBusinessAccounts.mockResolvedValue([{ id: 'b1', name: 'Negocio' }]);
    meta.getAdAccounts.mockResolvedValue([{ id: 'act_1', name: 'Cuenta', account_id: '1', currency: 'COP', account_status: 1 }]);
    meta.listCatalogs.mockResolvedValue([{ id: 'c1', name: 'Catálogo' }]);
    meta.listPixels.mockResolvedValue([{ id: 'p1', name: 'Píxel' }]);
    meta.getProductsForSync.mockResolvedValue([{}, {}]);
    meta.saveCredentials.mockResolvedValue(true);
  });

  it('por defecto se envía todo lo de hoy', () => {
    expect(leerEnviosMeta({})).toEqual({ catalogo: true, compras: true });
    expect(leerEnviosMeta({ meta_envios: { compras: false } })).toEqual({ catalogo: true, compras: false });
  });

  it('lista activos reales y nunca devuelve el token', async () => {
    const r = await activosMeta(conexionMeta().db, ORG, CONEXION);
    expect(r).toMatchObject({ autorizada: true, seleccion: { negocio: 'b1', cuenta: 'act_1', catalogo: 'c1', pixel: 'p1' }, productosTienda: 2 });
    expect(JSON.stringify(r)).not.toContain('tok');
  });

  it('rechaza ids que Meta no devuelve para ese token', async () => {
    await expect(
      guardarActivosMeta(conexionMeta().db, ORG, CONEXION, { negocio: 'b1', cuenta: 'act_1', catalogo: 'otro', pixel: 'p1', envios: { catalogo: true, compras: true } }, 'Org'),
    ).rejects.toMatchObject({ status: 400, codigo: 'CATALOGO' });
    expect(meta.saveCredentials).not.toHaveBeenCalled();
  });

  it('guarda la elección y fusiona «qué se envía» sin pisar otros ajustes', async () => {
    const b = conexionMeta();
    meta.createPixel.mockResolvedValue({ id: 'p2', name: 'Nuevo' });
    await guardarActivosMeta(b.db, ORG, CONEXION, { negocio: 'b1', cuenta: 'act_1', catalogo: 'c1', pixel: 'nuevo', envios: { catalogo: false, compras: true } }, 'Org');
    expect(meta.saveCredentials).toHaveBeenCalledWith(CONEXION, expect.objectContaining({ pixelId: 'p2', catalogId: 'c1', productSetId: 's1' }), b.db);
    expect(b.tablas.integration_connections[0].settings).toEqual({ otro: 1, meta_envios: { catalogo: false, compras: true } });
  });

  it('conexión de otra organización → 404', async () => {
    await expect(activosMeta(conexionMeta().db, 8, CONEXION)).rejects.toMatchObject({ status: 404 });
  });
});

describe('el navegador ya no lee secretos', () => {
  const fuente = (r: string) => fs.readFileSync(path.join(process.cwd(), r), 'utf8');
  it('integrationsService no pide secret_ref ni webhook_endpoints.secret con select(*)', () => {
    const s = fuente('src/lib/services/integrationsService.ts');
    for (const tabla of ['integration_credentials', 'integration_webhooks', 'webhook_endpoints']) {
      const usos = s.split(`.from('${tabla}')`).slice(1).map((t) => t.slice(0, 120));
      for (const u of usos) expect(u).not.toMatch(/\.select\((['"]\*['"])?\)/);
    }
  });
  it('el formulario viejo no precarga secretos y no borra llaves con campos vacíos', () => {
    const s = fuente('src/app/app/integraciones/conexiones/nueva/page.tsx');
    expect(s).not.toMatch(/secretObj\[cred\.purpose\] = cred\.secret_ref/);
    expect(s).toMatch(/hayCredencialesNuevas/);
  });
});
