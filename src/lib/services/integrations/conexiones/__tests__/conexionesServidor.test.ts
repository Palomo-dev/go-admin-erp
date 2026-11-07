/**
 * Integraciones › Conexiones en el servidor (Frente INT): catálogo honesto, URL de webhook real,
 * «Probar» que de verdad llama al proveedor y nunca cambia el estado, llaves guardadas solo tras
 * una prueba correcta, y «Dónde se usa» que fusiona `settings` sin robar métodos.
 */
import fs from 'fs';
import path from 'path';
import { crearBaseFalsa, type Fila } from './baseFalsa';
import { construirCatalogo, SERVICIOS, conteoPorGrupo } from '../catalogoConexiones';
import { RUTA_WEBHOOK_POR_CONECTOR, urlWebhookDeConector } from '../urlsWebhook';
import { LLAVES, validarFormatoLlaves } from '../definicionesLlaves';
import { enlazarUso, guardarLlaves, probarConexion } from '../conexiones.server';
import { enmascararSecreto } from '../secretosConexion';

const ORG = 7;
const ACTOR = { organizationId: ORG, userId: 'u-1' };
const CONECTOR_WOMPI = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const CONEXION = 'cccccccc-cccc-4ccc-8ccc-000000000001';

function respuesta(status: number, json: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => json } as Response;
}

process.env.NEXT_PUBLIC_APP_URL = 'https://app.ejemplo.co';
afterEach(() => jest.restoreAllMocks());

describe('catálogo', () => {
  const proveedores = SERVICIOS.filter((s) => s.proveedor).map((s) => ({ code: s.proveedor as string, name: s.id, category: 'payments', is_active: true }));
  const conectores = SERVICIOS.flatMap((s) => s.conectores.map((c) => ({ code: c, provider_code: s.proveedor as string, is_active: true })));

  it('tiene 30 servicios en 7 grupos (diseño 85-00)', () => {
    expect(SERVICIOS).toHaveLength(30);
    const items = construirCatalogo({ proveedores, conectores, conexiones: [], estadoLogistica: () => 'disponible', oauthConfigurado: { meta: true, tiktok: true, google_ads: true } });
    expect(conteoPorGrupo(items)).toMatchObject({ todos: 30, cobros: 6, hospedaje: 5, domicilios: 3, publicidad: 3, mensajeria: 3, envios: 6, go_admin: 4 });
  });

  it('estados honestos: sin conector → en construcción; OAuth sin app → en construcción; GO Admin → servicio', () => {
    const items = construirCatalogo({ proveedores, conectores, conexiones: [], estadoLogistica: (c) => (c === 'coordinadora' ? 'disponible' : 'en_construccion') });
    const por = (id: string) => items.find((i) => i.id === id)!;
    expect(por('rappi')).toMatchObject({ estado: 'en_construccion', motivo: 'cuenta_socio' });
    expect(por('meta')).toMatchObject({ estado: 'en_construccion', motivo: 'app_oauth_sin_configurar' });
    expect(por('servientrega')).toMatchObject({ estado: 'en_construccion', motivo: 'adaptador_en_construccion' });
    expect(por('coordinadora').estado).toBe('disponible');
    expect(por('wompi').estado).toBe('disponible');
    expect(por('cobros_qr').estado).toBe('servicio_go_admin');
  });

  it('un proveedor que la base no tiene nunca sale «Disponible»', () => {
    const items = construirCatalogo({ proveedores: proveedores.filter((p) => p.code !== 'stripe'), conectores, conexiones: [] });
    expect(items.find((i) => i.id === 'stripe')).toMatchObject({ estado: 'en_construccion', motivo: 'sin_proveedor_en_base' });
  });

  it('conexión connected → Conectado; con errores 24 h o pausada → Revisar; borrador no cuenta', () => {
    const base = { proveedores, conectores };
    const est = (c: Partial<Fila>) =>
      construirCatalogo({ ...base, conexiones: [{ id: CONEXION, connector_code: 'wompi_co', status: 'connected', error_count_24h: 0, ...c } as never] }).find((i) => i.id === 'wompi')!;
    expect(est({}).estado).toBe('conectado');
    expect(est({}).conexionPrincipal).toBe(CONEXION);
    expect(est({ error_count_24h: 3 }).estado).toBe('revisar');
    expect(est({ status: 'paused' }).estado).toBe('revisar');
    expect(est({ status: 'draft' }).estado).toBe('disponible');
  });

  it('un proveedor activo de la base que el catálogo no conoce aparece (nada escondido)', () => {
    const items = construirCatalogo({ proveedores: [...proveedores, { code: 'nuevo_prov', name: 'Nuevo', category: 'payments', is_active: true }], conectores, conexiones: [] });
    expect(items.find((i) => i.id === 'nuevo_prov')).toMatchObject({ grupo: 'cobros', estado: 'en_construccion' });
  });
});

describe('URL de webhook', () => {
  it('cada ruta mostrada existe como route.ts en la app', () => {
    for (const ruta of new Set(Object.values(RUTA_WEBHOOK_POR_CONECTOR))) {
      const archivo = path.join(process.cwd(), 'src', 'app', ...ruta.split('/').filter(Boolean), 'route.ts');
      expect(fs.existsSync(archivo)).toBe(true);
    }
  });
  it('el asistente de llaves solo muestra rutas reales', () => {
    for (const d of Object.values(LLAVES)) if (d.webhook) expect(RUTA_WEBHOOK_POR_CONECTOR[d.conector]).toBe(d.webhook);
  });
  it('conector sin receptor → null (antes /api/webhooks/<code>, inexistente)', () => {
    expect(urlWebhookDeConector('booking_ota', 'https://app.ejemplo.co')).toBeNull();
    expect(urlWebhookDeConector('wompi_co', 'https://app.ejemplo.co/')).toBe('https://app.ejemplo.co/api/integrations/wompi/webhook');
  });
});

describe('llaves: forma y máscara', () => {
  it('valida prefijos por ambiente', () => {
    const ok = { public_key: 'pub_prod_x', private_key: 'prv_prod_x', events_secret: 'prod_events_x', integrity_secret: 'prod_integrity_x' };
    expect(validarFormatoLlaves('wompi', 'production', ok)).toEqual([]);
    expect(validarFormatoLlaves('wompi', 'production', { ...ok, private_key: 'prv_test_x' })).toEqual([{ proposito: 'private_key', motivo: 'prefijo' }]);
    expect(validarFormatoLlaves('wompi', 'sandbox', {})).toHaveLength(4);
  });
  it('Stripe se enlaza a su método, nunca a «card»', () => {
    expect(LLAVES.stripe.metodoPago).toBe('stripe');
  });
  it('la máscara solo deja prefijo y últimos 4', () => {
    expect(enmascararSecreto('prv_prod_ABCDEFGH1234')).toBe('prv_prod_··1234');
    expect(enmascararSecreto('corto')).toBe('··to');
  });
});

function baseWompi(extra: Record<string, Fila[]> = {}) {
  return crearBaseFalsa({
    integration_providers: [{ code: 'wompi', name: 'Wompi', category: 'payments', is_active: true }],
    integration_connectors: [{ id: CONECTOR_WOMPI, code: 'wompi_co', name: 'Wompi Colombia', is_active: true, provider: { code: 'wompi', name: 'Wompi', category: 'payments' } }],
    branches: [{ id: 1, organization_id: ORG }, { id: 2, organization_id: ORG }],
    ...extra,
  });
}

const LLAVES_OK = { public_key: 'pub_prod_NUEVA1', private_key: 'prv_prod_NUEVA2', events_secret: 'prod_events_N3', integrity_secret: 'prod_integrity_N4' };

describe('guardarLlaves', () => {
  it('llaves rechazadas por el proveedor → no se crea conexión ni se guarda nada', async () => {
    const base = baseWompi();
    jest.spyOn(global, 'fetch').mockResolvedValue(respuesta(401));
    const r = await guardarLlaves(base.db, ACTOR, { proveedor: 'wompi', ambiente: 'production', valores: LLAVES_OK });
    expect(r.prueba.resultado).toBe('rechazada');
    expect(base.tablas.integration_connections ?? []).toHaveLength(0);
    expect(base.tablas.integration_credentials ?? []).toHaveLength(0);
  });

  it('sin respuesta del proveedor → tampoco se guarda (nunca se finge éxito)', async () => {
    const base = baseWompi();
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('red'));
    const r = await guardarLlaves(base.db, ACTOR, { proveedor: 'wompi', ambiente: 'production', valores: LLAVES_OK });
    expect(r.prueba.resultado).toBe('sin_respuesta');
    expect(base.tablas.integration_connections ?? []).toHaveLength(0);
  });

  it('correctas → conexión connected y las 4 llaves en la forma que leen la tienda y el POS', async () => {
    const base = baseWompi();
    jest.spyOn(global, 'fetch').mockResolvedValue(respuesta(200, { data: { name: 'Comercio' } }));
    const r = await guardarLlaves(base.db, ACTOR, { proveedor: 'wompi', ambiente: 'production', valores: LLAVES_OK });
    expect(r.prueba.resultado).toBe('correcta');
    expect(r.webhookUrl).toContain('/api/integrations/wompi/webhook');
    expect(base.tablas.integration_connections[0]).toMatchObject({ organization_id: ORG, status: 'connected', environment: 'production' });
    const creds = base.tablas.integration_credentials;
    expect(creds.map((c) => c.purpose).sort()).toEqual(['events_secret', 'integrity_secret', 'private_key', 'public_key']);
    expect(creds.find((c) => c.purpose === 'private_key')).toMatchObject({ secret_ref: 'prv_prod_NUEVA2', key_prefix: 'prv_prod_··EVA2' });
    expect(base.rpc).not.toHaveBeenCalledWith('fn_set_provider_secret', expect.anything());
  });

  it('formato inválido → 400 sin llamar al proveedor', async () => {
    const base = baseWompi();
    const f = jest.spyOn(global, 'fetch');
    await expect(guardarLlaves(base.db, ACTOR, { proveedor: 'wompi', ambiente: 'production', valores: { ...LLAVES_OK, public_key: 'pub_test_X' } })).rejects.toMatchObject({ status: 400, codigo: 'FORMATO' });
    expect(f).not.toHaveBeenCalled();
  });

  it('reemplazar llaves de una conexión de OTRA organización → 404', async () => {
    const base = baseWompi({ integration_connections: [{ id: CONEXION, organization_id: 8, connector_id: CONECTOR_WOMPI, environment: 'production', status: 'connected' }] });
    await expect(guardarLlaves(base.db, ACTOR, { proveedor: 'wompi', ambiente: 'production', valores: LLAVES_OK, conexionId: CONEXION })).rejects.toMatchObject({ status: 404 });
  });
});

describe('probarConexion', () => {
  function baseConectada() {
    return baseWompi({
      integration_connections: [{ id: CONEXION, organization_id: ORG, connector_id: CONECTOR_WOMPI, environment: 'production', status: 'connected', settings: {} }],
      integration_credentials: Object.entries(LLAVES_OK).map(([purpose, secret_ref]) => ({ connection_id: CONEXION, purpose, secret_ref, status: 'active' })),
    });
  }

  it('llama al proveedor con las llaves guardadas hoy y deja un evento', async () => {
    const base = baseConectada();
    const f = jest.spyOn(global, 'fetch').mockResolvedValue(respuesta(200, { data: { name: 'Comercio' } }));
    const r = await probarConexion(base.db, ACTOR, CONEXION);
    expect(r.resultado).toBe('correcta');
    expect(String(f.mock.calls[0][0])).toContain('/merchants/pub_prod_NUEVA1');
    expect(base.tablas.integration_events[0]).toMatchObject({ connection_id: CONEXION, direction: 'outbound', status: 'processed' });
  });

  it('una prueba fallida NUNCA cambia el estado (el POS sigue encontrando la conexión)', async () => {
    const base = baseConectada();
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('red'));
    const r = await probarConexion(base.db, ACTOR, CONEXION);
    expect(r.resultado).toBe('sin_respuesta');
    expect(base.tablas.integration_connections[0].status).toBe('connected');
    expect(base.tablas.integration_connections[0].last_error_message).toMatch(/sin_respuesta/);
  });
});

describe('enlazarUso', () => {
  function baseConMetodo(metodo: Fila | null) {
    return baseWompi({
      integration_connections: [{ id: CONEXION, organization_id: ORG, connector_id: CONECTOR_WOMPI, environment: 'production', status: 'connected' }],
      organization_payment_methods: metodo ? [{ id: 5, organization_id: ORG, payment_method_code: 'wompi', is_active: true, ...metodo }] : [],
    });
  }

  it('fusiona settings del método existente (antes los sobrescribía)', async () => {
    const base = baseConMetodo({ integration_connection_id: null, settings: { account_mapping: { x: 1 }, propio: true } });
    await enlazarUso(base.db, ACTOR, CONEXION, { tienda: true, pos: true, sucursales: [1] });
    expect(base.tablas.organization_payment_methods[0]).toMatchObject({
      integration_connection_id: CONEXION,
      settings: { account_mapping: { x: 1 }, propio: true, gateway: 'Wompi', usar_en_pos: true },
      branch_ids: [1],
      show_on_website: true,
    });
  });

  it('no roba un método enlazado a otra conexión (409)', async () => {
    const base = baseConMetodo({ integration_connection_id: 'dddddddd-dddd-4ddd-8ddd-000000000001', settings: {} });
    await expect(enlazarUso(base.db, ACTOR, CONEXION, { tienda: true, pos: false, sucursales: [] })).rejects.toMatchObject({ status: 409, codigo: 'METODO_EN_USO' });
  });

  it('sucursal de otra organización → 404', async () => {
    const base = baseConMetodo(null);
    await expect(enlazarUso(base.db, ACTOR, CONEXION, { tienda: false, pos: true, sucursales: [99] })).rejects.toMatchObject({ status: 404 });
  });

  it('sin método previo lo crea enlazado, sin tocar otros métodos', async () => {
    const base = baseConMetodo(null);
    base.tablas.organization_payment_methods.push({ id: 9, organization_id: ORG, payment_method_code: 'card', settings: { a: 1 } });
    const r = await enlazarUso(base.db, ACTOR, CONEXION, { tienda: true, pos: false, sucursales: [] });
    expect(r).toEqual({ metodo: 'wompi', creado: true });
    expect(base.tablas.organization_payment_methods.find((m) => m.payment_method_code === 'card')).toEqual({ id: 9, organization_id: ORG, payment_method_code: 'card', settings: { a: 1 } });
  });
});
