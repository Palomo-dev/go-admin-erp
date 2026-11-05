/**
 * Conexiones de logística: una conexión solo queda `connected` con una prueba real que el
 * adaptador acepta; los secretos van al Vault (RPC), nunca a `settings`; todo filtra por la
 * organización de la sesión.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthError } from '@/lib/integrations/core/errores';

// Adaptador de prueba para coordinadora: el resto del registro es el real.
const validar = jest.fn();
jest.mock('@/lib/integrations/core/registro', () => {
  const real = jest.requireActual('@/lib/integrations/core/registro');
  return {
    ...real,
    entradaRegistro: (code: string) => {
      const e = real.entradaRegistro(code);
      if (code !== 'coordinadora' || !e || process.env.__ADAPTADOR_REAL === '1') return e;
      return { ...e, crear: () => ({ tipo: 'transportadora', adaptador: { ...e.crear().adaptador, validateCredentials: validar } }) };
    },
  };
});

import {
  ConexionLogisticaError,
  crearConexionLogistica,
  guardarCredencialesLogistica,
  probarConexionLogistica,
} from '../conexionesLogistica.server';

type Fila = Record<string, unknown>;

/** Base falsa mínima: filtros eq/neq/in, insert/update/upsert y rpc. */
function baseFalsa(tablas: Record<string, Fila[]>) {
  const rpc = jest.fn(async (nombre: string, args: Fila) => {
    if (nombre === 'fn_set_provider_secret') {
      const t = (tablas.integration_credentials ??= []);
      const ref = `44444444-4444-4444-8444-${String(t.length).padStart(12, '0')}`;
      t.push({ connection_id: args.p_connection_id, purpose: args.p_purpose, secret_ref: ref, status: 'active', key_prefix: String(args.p_value).slice(0, 4) + '...' });
      return { data: ref, error: null };
    }
    if (nombre === 'fn_get_provider_secret') return { data: `secreto-${String(args.p_purpose)}`, error: null };
    return { data: null, error: { message: 'rpc desconocida' } };
  });

  function desde(tabla: string) {
    const filtros: ((f: Fila) => boolean)[] = [];
    let accion: { tipo: 'select' } | { tipo: 'insert'; filas: Fila[] } | { tipo: 'update'; cambios: Fila } = { tipo: 'select' };
    const filas = () => (tablas[tabla] ??= []);
    const ejecutar = () => {
      if (accion.tipo === 'insert') {
        const nuevas = accion.filas.map((f, i) => ({ id: `11111111-1111-4111-8111-${String(filas().length + i).padStart(12, '0')}`, ...f }));
        filas().push(...nuevas);
        return nuevas;
      }
      const coinciden = filas().filter((f) => filtros.every((p) => p(f)));
      if (accion.tipo === 'update') for (const f of coinciden) Object.assign(f, accion.cambios);
      return coinciden;
    };
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => (filtros.push((f) => f[c] === v), q),
      neq: (c: string, v: unknown) => (filtros.push((f) => f[c] !== v), q),
      in: (c: string, vs: unknown[]) => (filtros.push((f) => vs.includes(f[c])), q),
      limit: () => q,
      order: () => q,
      insert: (f: Fila | Fila[]) => ((accion = { tipo: 'insert', filas: Array.isArray(f) ? f : [f] }), q),
      update: (cambios: Fila) => ((accion = { tipo: 'update', cambios }), q),
      maybeSingle: async () => ({ data: ejecutar()[0] ?? null, error: null }),
      single: async () => {
        const r = ejecutar();
        return r[0] ? { data: r[0], error: null } : { data: null, error: { message: 'sin fila' } };
      },
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: ejecutar(), error: null }).then(ok, ko),
    };
    return q;
  }
  return { db: { from: desde, rpc } as unknown as SupabaseClient, rpc, tablas };
}

const CONECTOR_COORD = {
  id: 'k-coord',
  code: 'coordinadora',
  name: 'Coordinadora',
  is_active: true,
  capabilities: { webhook: false },
  integration_providers: { code: 'coordinadora', name: 'Coordinadora', category: 'delivery', metadata: {} },
  settings_schema: {
    version: 1,
    ambientes: ['sandbox', 'production'],
    campos: [
      { clave: 'nit', etiqueta: 'NIT', tipo: 'texto', requerido: true, secreto: false },
      { clave: 'apikey', etiqueta: 'API key', tipo: 'secreto', requerido: true, secreto: true },
    ],
  },
};
const CONECTOR_DROPI = {
  ...CONECTOR_COORD,
  id: 'k-dropi',
  code: 'dropi',
  integration_providers: { code: 'dropi', name: 'Dropi', category: 'delivery', metadata: { status: 'coming_soon' } },
};
const CONECTOR_RAPPI = { ...CONECTOR_COORD, id: 'k-rappi', code: 'rappi', integration_providers: { code: 'rappi', name: 'Rappi', category: 'delivery', metadata: {} } };

const CONN = '22222222-2222-4222-8222-222222222222';

function escenario(extra: Partial<Fila> = {}) {
  return baseFalsa({
    integration_connectors: [CONECTOR_COORD, CONECTOR_DROPI, CONECTOR_RAPPI],
    integration_connections: [
      { id: CONN, organization_id: 7, connector_id: 'k-coord', name: 'Coordinadora (sandbox)', environment: 'sandbox', status: 'draft', settings: {}, last_error_message: null, last_health_check_at: null, connected_at: null, ...extra },
    ],
    transport_carriers: [{ id: 'tc-1', organization_id: 7, api_provider: 'coordinadora', service_type: 'cargo', api_credentials_ref: CONN, is_active: false }],
    integration_credentials: [],
    integration_events: [],
  });
}

beforeEach(() => validar.mockReset());

describe('crear conexión', () => {
  test('un proveedor «Próximamente» (Dropi) o sin registro (Rappi) no se conecta', async () => {
    const { db } = escenario();
    await expect(crearConexionLogistica(db, { organizationId: 7, userId: 'u' }, 'dropi', 'production')).rejects.toMatchObject({ status: 409 });
    await expect(crearConexionLogistica(db, { organizationId: 7, userId: 'u' }, 'rappi', 'production')).rejects.toMatchObject({ status: 409 });
  });

  test('crea en draft y la transportadora inactiva (cargo), sin tocar las de pasajeros', async () => {
    const { db, tablas } = baseFalsa({
      integration_connectors: [CONECTOR_COORD],
      integration_connections: [],
      transport_carriers: [{ id: 'pas', organization_id: 7, api_provider: 'coordinadora', service_type: 'passenger', is_active: true }],
    });
    const r = await crearConexionLogistica(db, { organizationId: 7, userId: 'u' }, 'coordinadora', 'sandbox');
    expect(r.creada).toBe(true);
    expect(tablas.integration_connections[0]).toMatchObject({ organization_id: 7, status: 'draft', environment: 'sandbox' });
    const cargo = tablas.transport_carriers.find((t) => t.service_type === 'cargo')!;
    expect(cargo).toMatchObject({ is_active: false, api_credentials_ref: r.connectionId });
    expect(tablas.transport_carriers.find((t) => t.id === 'pas')).toMatchObject({ is_active: true });
    expect(tablas.transport_carriers.find((t) => t.id === 'pas')).not.toHaveProperty('api_credentials_ref');
  });
});

describe('guardar credenciales', () => {
  test('los secretos van al Vault por RPC y nunca a settings; la conexión vuelve a draft', async () => {
    const { db, rpc, tablas } = escenario({ status: 'connected' });
    await guardarCredencialesLogistica(db, 7, CONN, { nit: '900', apikey: 'llave-super-secreta' });
    expect(rpc).toHaveBeenCalledWith('fn_set_provider_secret', expect.objectContaining({ p_purpose: 'apikey', p_value: 'llave-super-secreta', p_credential_type: 'secret' }));
    const conn = tablas.integration_connections[0];
    expect(conn.settings).toEqual({ nit: '900' });
    expect(JSON.stringify(conn)).not.toContain('llave-super-secreta');
    expect(conn.status).toBe('draft');
    expect(tablas.transport_carriers[0].is_active).toBe(false);
  });

  test('un campo que no está en el formulario se rechaza', async () => {
    const { db } = escenario();
    await expect(guardarCredencialesLogistica(db, 7, CONN, { nit: '1', apikey: 'x', url_base: 'https://otro' })).rejects.toBeInstanceOf(ConexionLogisticaError);
  });

  test('conexión de otra organización: 404', async () => {
    const { db } = escenario();
    await expect(guardarCredencialesLogistica(db, 8, CONN, { nit: '1' })).rejects.toMatchObject({ status: 404 });
  });
});

describe('probar conexión: el único camino a connected', () => {
  const conSecreto = (e: ReturnType<typeof escenario>) => {
    e.tablas.integration_credentials.push({ connection_id: CONN, purpose: 'apikey', secret_ref: '33333333-3333-4333-8333-333333333333', status: 'active' });
    e.tablas.integration_connections[0].settings = { nit: '900' };
    return e;
  };

  test('faltan datos → no llama al proveedor ni cambia el estado', async () => {
    const e = escenario();
    const r = await probarConexionLogistica(e.db, 7, CONN);
    expect(r).toMatchObject({ ok: false, codigo: 'VALIDATION', faltantes: ['nit', 'apikey'] });
    expect(validar).not.toHaveBeenCalled();
    expect(e.tablas.integration_connections[0].status).toBe('draft');
  });

  test('el proveedor acepta → connected, transportadora activa y evento registrado sin secretos', async () => {
    const e = conSecreto(escenario());
    validar.mockResolvedValue(undefined);
    await expect(probarConexionLogistica(e.db, 7, CONN)).resolves.toEqual({ ok: true });
    expect(validar).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 7, environment: 'sandbox', credenciales: { nit: '900', apikey: 'secreto-apikey' } }));
    expect(e.tablas.integration_connections[0]).toMatchObject({ status: 'connected', last_error_message: null });
    expect(e.tablas.transport_carriers[0].is_active).toBe(true);
    expect(e.tablas.integration_events[0]).toMatchObject({ event_type: 'connection.test', status: 'processed', connection_id: CONN, organization_id: 7 });
    expect(JSON.stringify(e.tablas.integration_events)).not.toContain('secreto-apikey');
  });

  test('el proveedor rechaza → error con el mensaje para la UI, nunca connected', async () => {
    const e = conSecreto(escenario());
    validar.mockRejectedValue(new AuthError('coordinadora'));
    await expect(probarConexionLogistica(e.db, 7, CONN)).resolves.toMatchObject({ ok: false, codigo: 'AUTH' });
    expect(e.tablas.integration_connections[0].status).toBe('error');
    expect(e.tablas.transport_carriers[0].is_active).toBe(false);
    expect(e.tablas.integration_events[0]).toMatchObject({ status: 'error' });
  });

  test('adaptador real pendiente (NotConfiguredError) → sigue en draft con el motivo', async () => {
    process.env.__ADAPTADOR_REAL = '1';
    try {
      const e = conSecreto(escenario());
      const r = await probarConexionLogistica(e.db, 7, CONN);
      expect(r).toMatchObject({ ok: false, codigo: 'NOT_CONFIGURED' });
      expect(e.tablas.integration_connections[0].status).toBe('draft');
      expect(e.tablas.integration_connections[0].last_error_message).toMatch(/Coordinadora/);
      expect(e.tablas.transport_carriers[0].is_active).toBe(false);
    } finally {
      delete process.env.__ADAPTADOR_REAL;
    }
  });
});

describe('webhook de logística: cerrado por defecto', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { verificarWebhookLogistica } = require('../webhookLogistica.server') as typeof import('../webhookLogistica.server');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { rutaWebhookLogistica } = require('@/lib/integrations/core/rutasLogistica') as typeof import('@/lib/integrations/core/rutasLogistica');

  const conDb = (fila: Fila | null) =>
    ({
      from: () => {
        const q: Record<string, unknown> = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: fila, error: null }) };
        return q;
      },
    }) as unknown as SupabaseClient;
  const FILA = { id: CONN, status: 'connected', integration_connectors: { integration_providers: { code: 'coordinadora' } } };

  test('la URL es única por conexión', () => {
    expect(rutaWebhookLogistica('coordinadora', CONN)).toBe(`/api/integrations/logistica/coordinadora/webhook/${CONN}`);
  });

  test('conexión válida → 501 (sin verificación de firma no se procesa nada)', async () => {
    await expect(verificarWebhookLogistica(conDb(FILA), 'coordinadora', CONN)).resolves.toMatchObject({ aceptado: false, status: 501 });
  });

  test('proveedor que no coincide, fuera del registro, id inválido o revocada → 404', async () => {
    await expect(verificarWebhookLogistica(conDb(FILA), 'servientrega', CONN)).resolves.toMatchObject({ status: 404 });
    await expect(verificarWebhookLogistica(conDb(FILA), 'wompi', CONN)).resolves.toMatchObject({ status: 404 });
    await expect(verificarWebhookLogistica(conDb(FILA), 'coordinadora', 'no-es-uuid')).resolves.toMatchObject({ status: 404 });
    await expect(verificarWebhookLogistica(conDb({ ...FILA, status: 'revoked' }), 'coordinadora', CONN)).resolves.toMatchObject({ status: 404 });
    await expect(verificarWebhookLogistica(conDb(null), 'coordinadora', CONN)).resolves.toMatchObject({ status: 404 });
  });
});
