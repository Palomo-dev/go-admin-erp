/**
 * Booking.com / Expedia / iCal (Frente INT, 2026-11-07): sin `value_encrypted` (columna inexistente),
 * secretos en la bóveda con propósitos que el CHECK admite, propiedad en `settings`, modo API
 * honesto sin cuenta de socio y pertenencia de los espacios a la organización.
 */
import { crearBaseFalsa, type BaseFalsa, type Fila } from './baseFalsa';

let base: BaseFalsa;
const ORG = 7;
const ctx = { organizationId: ORG, userId: 'usuario-1', supabase: {} as unknown, memberId: 1, roleId: 2, isSuperAdmin: false };

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => base.db }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/utils/orgContext', () => ({
  withOrg: (h: (c: unknown, r: Request, p: unknown) => Promise<Response>) => (r: Request, p: unknown) => h(ctx, r, p),
  hasOrgAdminOrPermission: jest.fn(async () => true),
}));
jest.mock('@/lib/security/organizationBody', () => ({
  readOrgBody: async (_c: unknown, r: Request) => (r.method === 'GET' ? null : r.json()),
  ORG_BODY_KEYS: ['organization_id', 'organizationId'],
}));
jest.mock('@/lib/services/integrations/channelManagerAccess', () => ({
  channelManagerClientsFor: () => ({ db: base.db, secrets: () => base.db }),
}));

import { guardarCredencialesOta, leerCredencialesOta } from '../credencialesOta';
import { createBookingConnectionService } from '@/lib/services/integrations/booking/bookingConnectionService';
import { createBookingAuthService } from '@/lib/services/integrations/booking/bookingAuthService';
import { BOOKING_OTA_CONNECTOR_ID } from '@/lib/services/integrations/booking/bookingTypes';
import { POST as postOta } from '@/app/api/integrations/conexiones/ota/route';
import { POST as postIcal } from '@/app/api/integrations/conexiones/ical/route';
import { guardarIcal } from '../otaIcal.server';

const CONEXION = 'cccccccc-cccc-4ccc-8ccc-000000000001';
const ESPACIO_PROPIO = 'eeeeeeee-eeee-4eee-8eee-000000000001';
const ESPACIO_AJENO = 'eeeeeeee-eeee-4eee-8eee-000000000002';

function peticion(url: string, cuerpo: unknown): Request {
  return new Request(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(cuerpo) });
}

const sinValueEncrypted = (filas: Fila[] = []) => filas.every((f) => !('value_encrypted' in f));
const PROPOSITOS_ADMITIDOS = ['primary', 'backup', 'legacy', 'rotation', 'public_key', 'private_key', 'events_secret', 'integrity_secret', 'access_token', 'refresh_token', 'webhook_secret'];

describe('credencialesOta', () => {
  it('guarda en la bóveda con propósitos que el CHECK actual admite', async () => {
    base = crearBaseFalsa();
    await guardarCredencialesOta(base.db, CONEXION, 'booking', { machine_client_id: 'cliente-1', machine_client_secret: 'secreto-1', access_token: 'tok' });
    const filas = base.tablas.integration_credentials ?? [];
    expect(filas.map((f) => f.purpose).sort()).toEqual(['access_token', 'private_key', 'public_key']);
    expect(filas.every((f) => PROPOSITOS_ADMITIDOS.includes(String(f.purpose)))).toBe(true);
    expect(filas.every((f) => /^[0-9a-f-]{36}$/.test(String(f.secret_ref)))).toBe(true);
    expect(sinValueEncrypted(filas)).toBe(true);
  });

  it('lee en sus dos formas: bóveda o valor en claro', async () => {
    base = crearBaseFalsa({
      integration_credentials: [{ connection_id: CONEXION, purpose: 'public_key', secret_ref: 'usuario-en-claro', status: 'active' }],
    });
    await base.db.rpc('fn_set_provider_secret', { p_connection_id: CONEXION, p_purpose: 'private_key', p_value: 'clave-boveda' });
    expect(await leerCredencialesOta(base.db, CONEXION, 'expedia')).toEqual({ eqc_username: 'usuario-en-claro', eqc_password: 'clave-boveda' });
  });
});

describe('Booking.com: conexión API sin value_encrypted', () => {
  it('createConnection deja la propiedad en settings, los secretos en la bóveda y la conexión connected', async () => {
    base = crearBaseFalsa();
    const clients = { db: base.db, secrets: () => base.db };
    const r = await createBookingConnectionService(clients).createConnection({
      organizationId: ORG, hotelId: '8421577', machineClientId: 'cliente-1', machineClientSecret: 'secreto-1',
    });
    expect(r.success).toBe(true);
    const conexion = base.tablas.integration_connections?.[0] ?? {};
    expect(conexion).toMatchObject({ organization_id: ORG, connector_id: BOOKING_OTA_CONNECTOR_ID, status: 'connected' });
    expect(conexion).not.toHaveProperty('is_active');
    expect(conexion).not.toHaveProperty('config');
    expect((conexion.settings as Fila).hotel_id).toBe('8421577');
    expect(sinValueEncrypted(base.tablas.integration_credentials)).toBe(true);

    const cred = await createBookingAuthService(clients).getCredentials(String(conexion.id));
    expect(cred).toMatchObject({ machineClientId: 'cliente-1', machineClientSecret: 'secreto-1', hotelId: '8421577' });
  });

  it('no duplica la conexión del mismo hotel (busca por settings->>hotel_id)', async () => {
    base = crearBaseFalsa();
    const svc = createBookingConnectionService({ db: base.db, secrets: () => base.db });
    await svc.createConnection({ organizationId: ORG, hotelId: '111', machineClientId: 'a', machineClientSecret: 'b' });
    const otra = await svc.createConnection({ organizationId: ORG, hotelId: '111', machineClientId: 'a', machineClientSecret: 'b' });
    expect(otra.success).toBe(false);
    expect(base.tablas.integration_connections).toHaveLength(1);
  });
});

describe('POST /api/integrations/conexiones/ota', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('sin cuenta de proveedor de conectividad → 409 CUENTA_SOCIO y no crea nada', async () => {
    delete process.env.BOOKING_MACHINE_CLIENT_ID;
    delete process.env.BOOKING_MACHINE_CLIENT_SECRET;
    base = crearBaseFalsa();
    const res = await postOta(peticion('/api/integrations/conexiones/ota', { canal: 'booking', propiedadId: '8421577' }) as never, undefined as never);
    expect(res.status).toBe(409);
    expect((await res.json()).codigo).toBe('CUENTA_SOCIO');
    expect(base.tablas.integration_connections ?? []).toHaveLength(0);
    expect(base.tablas.integration_credentials ?? []).toHaveLength(0);
  });
});

describe('POST /api/integrations/conexiones/ical', () => {
  function baseConEspacios() {
    return crearBaseFalsa({
      branches: [{ id: 1, name: 'Principal', organization_id: ORG }, { id: 2, name: 'Otra', organization_id: 99 }],
      spaces: [{ id: ESPACIO_PROPIO, label: '101', branch_id: 1 }, { id: ESPACIO_AJENO, label: '201', branch_id: 2 }],
      integration_connectors: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-00000000000a', code: 'airbnb_ical', is_active: true }],
    });
  }
  it('un espacio de otra organización → 404 y no escribe', async () => {
    base = baseConEspacios();
    const res = await postIcal(peticion('/api/integrations/conexiones/ical', {
      canal: 'airbnb', enlaces: [{ espacioId: ESPACIO_AJENO, urlImportacion: 'https://www.airbnb.com/calendar/ical/1.ics' }],
    }) as never, undefined as never);
    expect(res.status).toBe(404);
    expect(base.tablas.channel_connections ?? []).toHaveLength(0);
    expect(base.tablas.integration_connections ?? []).toHaveLength(0);
  });

  it('una URL que no es https → 400', async () => {
    base = baseConEspacios();
    const res = await postIcal(peticion('/api/integrations/conexiones/ical', {
      canal: 'airbnb', enlaces: [{ espacioId: ESPACIO_PROPIO, urlImportacion: 'http://www.airbnb.com/calendar/ical/1.ics' }],
    }) as never, undefined as never);
    expect(res.status).toBe(400);
    expect(base.tablas.channel_connections ?? []).toHaveLength(0);
  });

  it('con espacios propios guarda el enlace y deja la conexión «Airbnb · iCal» en connected', async () => {
    base = baseConEspacios();
    const r = await guardarIcal(base.db, { organizationId: ORG, userId: 'usuario-1' }, 'airbnb',
      [{ espacioId: ESPACIO_PROPIO, urlImportacion: 'https://www.airbnb.com/calendar/ical/1.ics' }], async () => undefined);
    expect(base.tablas.channel_connections?.[0]).toMatchObject({ organization_id: ORG, space_id: ESPACIO_PROPIO, channel: 'airbnb', connection_type: 'ical' });
    expect(base.tablas.integration_connections?.[0]).toMatchObject({ id: r.conexionId, name: 'Airbnb · iCal', status: 'connected', organization_id: ORG });
  });
});
