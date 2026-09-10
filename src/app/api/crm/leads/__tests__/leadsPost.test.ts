/// <reference types="jest" />
/**
 * POST /api/crm/leads — alta manual de un lead con cliente nuevo.
 *
 * Motivo de esta suite: el alta reventaba con **500 y el mensaje crudo de
 * Postgres** cuando el correo del cliente nuevo ya existía en la organización.
 * La base tiene el índice `unique_customer_email_per_org` sobre
 * `(organization_id, email)`, así que repetir un correo es un caso NORMAL de
 * uso —el comercial da de alta a alguien que ya está en la ficha— y no un
 * error del servidor. La ruta hacía `if (error) throw error` sin distinguir la
 * violación de unicidad, y el `catch` final lo convertía en 500.
 *
 * Se dobla `@/lib/utils/orgContext` con una fábrica para no cargar el módulo
 * real, que arrastra `svix` (sólo ESM) y no carga bajo jest en CJS. Es el mismo
 * motivo por el que `f9Routes.smoke.test.ts` se quedó en análisis estático;
 * aquí sí se ejecuta el manejador, que es lo que hace falta para observar el
 * código de estado.
 */

class FakeOrgContextError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.statusCode = statusCode;
  }
}

/** Error tal y como lo devuelve PostgREST ante `unique_customer_email_per_org`. */
const ERROR_CORREO_DUPLICADO = {
  code: '23505',
  message:
    'duplicate key value violates unique constraint "unique_customer_email_per_org"',
  details: 'Key (organization_id, email)=(7, ana@example.com) already exists.',
  hint: null,
};

/** Filas que devuelve cada tabla; `customers.insert` es lo que se manipula. */
interface Guion {
  insertCustomerError: unknown;
  insertCustomerData: unknown;
  clienteExistente?: { id: string } | null;
}

let guion: Guion;

/**
 * Doble encadenable del cliente de Supabase. Cada método devuelve `this` y la
 * cadena se resuelve en `maybeSingle`/`single`, que es como la usa la ruta.
 */
function fakeSupabase() {
  const make = (tabla: string) => {
    let esInsert = false;
    const chain: Record<string, unknown> = {
      insert(payload: unknown) {
        esInsert = true;
        (chain as { _payload?: unknown })._payload = payload;
        return chain;
      },
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      delete: () => chain,
      async maybeSingle() {
        if (tabla === 'pipelines') return { data: { id: 'pipe-1' }, error: null };
        if (tabla === 'stages') return { data: { id: 'stage-1' }, error: null };
        if (tabla === 'customers') return { data: guion.clienteExistente ?? null, error: null };
        if (tabla === 'organization_members') return { data: { user_id: 'u-1' }, error: null };
        return { data: null, error: null };
      },
      async single() {
        if (tabla === 'customers' && esInsert) {
          return { data: guion.insertCustomerData, error: guion.insertCustomerError };
        }
        if (tabla === 'opportunities' && esInsert) {
          return { data: { id: 'opp-1' }, error: null };
        }
        return { data: null, error: null };
      },
    };
    return chain;
  };
  return { from: (tabla: string) => make(tabla) };
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: FakeOrgContextError,
  getServerOrgContext: jest.fn(async () => ({
    organizationId: 7,
    userId: 'u-1',
    supabase: fakeSupabase(),
  })),
}));

import { NextRequest } from 'next/server';
import { POST } from '../route';

const peticion = (body: unknown) =>
  new NextRequest('http://localhost/api/crm/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const CUERPO = {
  name: 'Lead de prueba',
  new_customer: { first_name: 'Ana', email: 'ana@example.com' },
};

describe('POST /api/crm/leads · correo de cliente ya existente', () => {
  beforeEach(() => {
    guion = { insertCustomerError: null, insertCustomerData: { id: 'cust-1', full_name: 'Ana' } };
  });

  it('NO responde 500 cuando el correo ya existe en la organización', async () => {
    guion.insertCustomerError = ERROR_CORREO_DUPLICADO;
    guion.insertCustomerData = null;

    const res = await POST(peticion(CUERPO));
    expect(res.status).not.toBe(500);
  });

  it('responde 409 y explica que el cliente ya existe, sin filtrar el error de Postgres', async () => {
    guion.insertCustomerError = ERROR_CORREO_DUPLICADO;
    guion.insertCustomerData = null;

    const res = await POST(peticion(CUERPO));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    // El comercial tiene que entender qué pasó y qué hacer.
    expect(json.error).toMatch(/ya existe/i);
    expect(json.error).toContain('ana@example.com');
    // Nada de jerga de base de datos hacia el cliente de la API.
    expect(json.error).not.toMatch(/duplicate key|constraint|23505/i);
  });

  it('el alta normal sigue funcionando (la corrección no rompe el camino feliz)', async () => {
    const res = await POST(peticion(CUERPO));
    expect([200, 201]).toContain(res.status);
  });
});
