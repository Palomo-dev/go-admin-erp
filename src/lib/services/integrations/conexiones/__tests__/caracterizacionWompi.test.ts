/**
 * Caracterización (Frente INT, 2026-11-07): cómo se lee HOY una conexión Wompi existente y cómo
 * el cobro la encuentra. Estas pruebas se escribieron ANTES de reemplazar el asistente y el
 * detalle de conexión, y deben seguir pasando: el dueño tiene Wompi funcionando en 4
 * organizaciones con las 4 llaves en `integration_credentials.secret_ref` (en claro, sin uuid).
 *
 * Datos de prueba inventados; nunca valores reales.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no se usa en estas pruebas'); } }));
jest.mock('@/lib/utils/orgContext', () => ({ hasOrgAdminOrPermission: jest.fn(async () => true) }));

import { wompiService } from '@/lib/services/integrations/wompi/wompiService';
import { resolverConexionDeCobro, CobroQrError } from '@/lib/services/integrations/qrShared/cobroQrServidor';
import { resolverSecretos, valorDeSecreto } from '../secretosConexion';
import { crearBaseFalsa, type Fila } from './baseFalsa';

const CONECTOR_WOMPI = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const CONEXION = 'cccccccc-cccc-4ccc-8ccc-000000000001';

/** Las 4 filas tal como las escribe hoy `wompiService.saveCredentials` / el asistente viejo. */
function filasDeHoy(connectionId = CONEXION): Fila[] {
  return [
    { connection_id: connectionId, credential_type: 'api_key', purpose: 'public_key', secret_ref: 'pub_prod_FALSO1234', key_prefix: 'pub_prod_FAL...', status: 'active' },
    { connection_id: connectionId, credential_type: 'api_key', purpose: 'private_key', secret_ref: 'prv_prod_FALSO5678', key_prefix: 'prv_prod_FAL...', status: 'active' },
    { connection_id: connectionId, credential_type: 'secret', purpose: 'events_secret', secret_ref: 'prod_events_FALSO9', key_prefix: 'prod_events_FAL...', status: 'active' },
    { connection_id: connectionId, credential_type: 'secret', purpose: 'integrity_secret', secret_ref: 'prod_integrity_FALSO0', key_prefix: 'prod_integrity_FAL...', status: 'active' },
  ];
}

describe('wompiService.getCredentials — conexión existente (forma de hoy)', () => {
  it('devuelve las 4 llaves tal cual están en secret_ref y el ambiente de la conexión, sin llamar a la bóveda', async () => {
    const base = crearBaseFalsa({
      integration_connections: [{ id: CONEXION, environment: 'production', organization_id: 7 }],
      integration_credentials: filasDeHoy(),
    });
    const cred = await wompiService.getCredentials(CONEXION, base.db);
    expect(cred).toEqual({
      publicKey: 'pub_prod_FALSO1234',
      privateKey: 'prv_prod_FALSO5678',
      eventsSecret: 'prod_events_FALSO9',
      integritySecret: 'prod_integrity_FALSO0',
      environment: 'production',
    });
    expect(base.rpc).not.toHaveBeenCalled();
  });

  it('ignora las credenciales revocadas y usa sandbox si la conexión no trae ambiente', async () => {
    const base = crearBaseFalsa({
      integration_connections: [{ id: CONEXION, environment: '', organization_id: 7 }],
      integration_credentials: [
        { connection_id: CONEXION, purpose: 'public_key', secret_ref: 'pub_test_VIEJA', status: 'revoked' },
        ...filasDeHoy().map((f) => ({ ...f, secret_ref: String(f.secret_ref).replace('prod', 'test') })),
      ],
    });
    const cred = await wompiService.getCredentials(CONEXION, base.db);
    expect(cred?.publicKey).toBe('pub_test_FALSO1234');
    expect(cred?.environment).toBe('sandbox');
  });

  it('sin credenciales activas devuelve null (la ruta responde «sin credenciales»)', async () => {
    const base = crearBaseFalsa({ integration_connections: [{ id: CONEXION, environment: 'production' }], integration_credentials: [] });
    expect(await wompiService.getCredentials(CONEXION, base.db)).toBeNull();
  });

  it('una conexión nueva en la bóveda (secret_ref uuid) se resuelve con fn_get_provider_secret', async () => {
    const base = crearBaseFalsa({ integration_connections: [{ id: CONEXION, environment: 'production' }] });
    for (const [p, v] of Object.entries({ public_key: 'pub_prod_B', private_key: 'prv_prod_B', events_secret: 'prod_events_B', integrity_secret: 'prod_integrity_B' })) {
      await base.db.rpc('fn_set_provider_secret', { p_connection_id: CONEXION, p_purpose: p, p_value: v });
    }
    base.rpc.mockClear();
    const cred = await wompiService.getCredentials(CONEXION, base.db);
    expect(cred).toMatchObject({ publicKey: 'pub_prod_B', privateKey: 'prv_prod_B', eventsSecret: 'prod_events_B', integritySecret: 'prod_integrity_B' });
    expect(base.rpc).toHaveBeenCalledWith('fn_get_provider_secret', expect.objectContaining({ p_connection_id: CONEXION }));
  });
});

describe('secretosConexion — las dos formas', () => {
  it('un valor en claro se devuelve igual aunque la bóveda falle', async () => {
    const base = crearBaseFalsa();
    base.rpc.mockRejectedValue(new Error('sin permiso'));
    expect(await valorDeSecreto(base.db, CONEXION, { purpose: 'events_secret', secret_ref: 'prod_events_X' })).toBe('prod_events_X');
    expect(base.rpc).not.toHaveBeenCalled();
  });

  it('un uuid que la bóveda no conoce conserva el comportamiento anterior (devuelve el secret_ref)', async () => {
    const base = crearBaseFalsa();
    const uuid = '99999999-9999-4999-8999-999999999999';
    expect(await valorDeSecreto(base.db, CONEXION, { purpose: 'events_secret', secret_ref: uuid })).toBe(uuid);
  });

  it('la primera fila de cada propósito gana, igual que el `find` de antes', async () => {
    const base = crearBaseFalsa();
    const mapa = await resolverSecretos(base.db, CONEXION, [
      { purpose: 'public_key', secret_ref: 'A' },
      { purpose: 'public_key', secret_ref: 'B' },
    ]);
    expect(mapa.public_key).toBe('A');
  });
});

describe('resolverConexionDeCobro — sucursal → método → general (Wompi QR Bancolombia)', () => {
  function base(conexiones: Fila[], metodos: Fila[] = []) {
    return crearBaseFalsa({
      integration_connectors: [{ id: CONECTOR_WOMPI, code: 'wompi_co' }],
      integration_connections: conexiones.map((c) => ({ organization_id: 7, connector_id: CONECTOR_WOMPI, status: 'connected', environment: 'production', settings: {}, ...c })),
      organization_payment_methods: metodos.map((m) => ({ organization_id: 7, is_active: true, ...m })),
    }).db;
  }
  const A = 'cccccccc-cccc-4ccc-8ccc-00000000000a';
  const B = 'cccccccc-cccc-4ccc-8ccc-00000000000b';
  const C = 'cccccccc-cccc-4ccc-8ccc-00000000000c';

  it('la única conexión general sirve en cualquier sucursal (caso de las 4 organizaciones de hoy)', async () => {
    const c = await resolverConexionDeCobro(base([{ id: A, branch_id: null }]), 7, 'bancolombia_qr_wompi', 3);
    expect(c.id).toBe(A);
    expect(c.connectorCode).toBe('wompi_co');
  });

  it('gana la de la sucursal sobre la general', async () => {
    const c = await resolverConexionDeCobro(base([{ id: A, branch_id: null }, { id: B, branch_id: 3 }]), 7, 'bancolombia_qr_wompi', 3);
    expect(c.id).toBe(B);
  });

  it('la de otra sucursal no sirve: usa la general', async () => {
    const c = await resolverConexionDeCobro(base([{ id: A, branch_id: null }, { id: B, branch_id: 9 }]), 7, 'bancolombia_qr_wompi', 3);
    expect(c.id).toBe(A);
  });

  it('con varias generales desempata la vinculada al método de pago «wompi»', async () => {
    const c = await resolverConexionDeCobro(
      base([{ id: A, branch_id: null }, { id: C, branch_id: null }], [{ payment_method_code: 'wompi', integration_connection_id: C }]),
      7, 'bancolombia_qr_wompi', 3,
    );
    expect(c.id).toBe(C);
  });

  it('varias generales sin vínculo → 409; ninguna conectada → 412', async () => {
    await expect(resolverConexionDeCobro(base([{ id: A, branch_id: null }, { id: C, branch_id: null }]), 7, 'bancolombia_qr_wompi', 3))
      .rejects.toMatchObject({ statusCode: 409 });
    await expect(resolverConexionDeCobro(base([{ id: A, branch_id: null, status: 'paused' }]), 7, 'bancolombia_qr_wompi', 3))
      .rejects.toBeInstanceOf(CobroQrError);
  });

  it('nunca toma la conexión de otra organización', async () => {
    const db = base([{ id: A, branch_id: null, organization_id: 8 }]);
    await expect(resolverConexionDeCobro(db, 7, 'bancolombia_qr_wompi', 3)).rejects.toMatchObject({ statusCode: 412 });
  });
});
