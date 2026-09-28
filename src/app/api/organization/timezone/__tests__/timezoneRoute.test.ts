// ============================================================
// Cierre de fase A — PUT /api/organization/timezone.
//
// Reglas duras 5 y 6: la organización sale de la SESIÓN y el permiso se
// resuelve en el SERVIDOR por id de rol. Aquí se fija que:
//   - sin admin no se escribe nada (403 antes de tocar la base);
//   - una organización en el body no desvía la escritura;
//   - una sucursal de otro inquilino es 404 y no se toca;
//   - una zona que no es IANA canónica se rechaza con 400.
// ============================================================

import { readFileSync } from 'fs';
import { join } from 'path';

interface Escritura {
  tabla: string;
  patch: Record<string, unknown>;
  filtros: Array<[string, unknown]>;
}

const escrituras: Escritura[] = [];
const guion = {
  esAdmin: true,
  sucursalDeLaOrg: true,
  errorUpdate: null as null | { message: string },
};

const ORG_SESION = 120;

// `orgContext` arrastra webhookSignatures -> svix (ESM puro), que Jest (CJS)
// no sabe parsear; por eso se dobla ENTERO en vez de con requireActual. Es el
// mismo motivo por el que `isOrgAdminLike` se extrajo a `orgAdmin.ts`.
jest.mock('@/lib/utils/orgContext', () => ({
  jsonError: (status: number, code: string, message?: string) =>
    new Response(JSON.stringify({ error: message ?? code, code }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  withOrg: (handler: (ctx: unknown, req: Request) => Promise<Response>, opts?: { admin?: boolean }) =>
    async (req: Request) => {
      if (opts?.admin && !guion.esAdmin) {
        return new Response(
          JSON.stringify({ error: 'Requiere rol de administrador', code: 'ADMIN_REQUIRED' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const ctx = {
        userId: 'u-1',
        organizationId: ORG_SESION,
        roleId: 2,
        isSuperAdmin: false,
        supabase: {
          from: (tabla: string) => {
            const filtros: Array<[string, unknown]> = [];
            const q: Record<string, unknown> = {
              select: () => q,
              eq: (columna: string, valor: unknown) => { filtros.push([columna, valor]); return q; },
              maybeSingle: async () => ({
                data: guion.sucursalDeLaOrg ? { id: filtros[0]?.[1] } : null,
                error: null,
              }),
              update: (patch: Record<string, unknown>) => {
                const u: Record<string, unknown> = {
                  eq: (columna: string, valor: unknown) => {
                    filtros.push([columna, valor]);
                    const p = Promise.resolve({ error: guion.errorUpdate });
                    return Object.assign(p, u);
                  },
                };
                escrituras.push({ tabla, patch, filtros });
                return u;
              },
            };
            return q;
          },
          rpc: async () => ({ data: 'Europe/Madrid', error: null }),
        },
      };
      return handler(ctx, req);
    },
}));

import { PUT } from '@/app/api/organization/timezone/route';

function peticion(cuerpo: unknown): Request {
  return new Request('http://localhost/api/organization/timezone', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
}

// El wrapper real pasa (req, routeParams); el doble solo usa req.
const llamar = (cuerpo: unknown) =>
  (PUT as unknown as (r: Request) => Promise<Response>)(peticion(cuerpo));

beforeEach(() => {
  escrituras.length = 0;
  guion.esAdmin = true;
  guion.sucursalDeLaOrg = true;
  guion.errorUpdate = null;
});

describe('permiso en el servidor (regla dura 6)', () => {
  it('sin admin: 403 y NI UNA escritura', async () => {
    guion.esAdmin = false;
    const res = await llamar({ scope: 'organization', timezone: 'Europe/Madrid' });
    expect(res.status).toBe(403);
    expect(escrituras).toEqual([]);
  });

  it('el handler se envuelve exigiendo admin, no solo sesión', () => {
    const fuente = readFileSync(join(__dirname, '..', 'route.ts'), 'utf8');
    expect(fuente).toContain("withOrg(guardar, { admin: true })");
  });
});

describe('la organización sale de la sesión (regla dura 5)', () => {
  it('escribe sobre la organización de la sesión', async () => {
    const res = await llamar({ scope: 'organization', timezone: 'Europe/Madrid' });
    expect(res.status).toBe(200);
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0].tabla).toBe('organizations');
    expect(escrituras[0].patch).toEqual({ timezone: 'Europe/Madrid' });
    expect(escrituras[0].filtros).toContainEqual(['id', ORG_SESION]);
  });

  it('una organización distinta en el body no desvía la escritura', async () => {
    await llamar({ scope: 'organization', timezone: 'Europe/Madrid', organization_id: 999 });
    expect(escrituras[0].filtros).toContainEqual(['id', ORG_SESION]);
    expect(escrituras[0].filtros.some(([, v]) => v === 999)).toBe(false);
  });

  it('la organización no puede «heredar»: es la raíz de la cascada', async () => {
    const res = await llamar({ scope: 'organization', timezone: null });
    expect(res.status).toBe(400);
    expect(escrituras).toEqual([]);
  });
});

describe('sucursal', () => {
  it('guarda la zona propia filtrando también por la organización de la sesión', async () => {
    const res = await llamar({ scope: 'branch', branchId: 4102, timezone: 'Europe/Madrid' });
    expect(res.status).toBe(200);
    const update = escrituras.find((e) => e.tabla === 'branches');
    expect(update?.patch).toEqual({ timezone: 'Europe/Madrid' });
    expect(update?.filtros).toContainEqual(['organization_id', ORG_SESION]);
  });

  it('devuelve la zona efectiva que calcula fn_timezone_for', async () => {
    const res = await llamar({ scope: 'branch', branchId: 4102, timezone: 'Europe/Madrid' });
    await expect(res.json()).resolves.toMatchObject({ effectiveTimezone: 'Europe/Madrid' });
  });

  it('«heredar» guarda NULL, no la cadena vacía', async () => {
    await llamar({ scope: 'branch', branchId: 4102, timezone: '   ' });
    const update = escrituras.find((e) => e.tabla === 'branches');
    expect(update?.patch).toEqual({ timezone: null });
  });

  it('una sucursal de otro inquilino es 404 y no se escribe', async () => {
    guion.sucursalDeLaOrg = false;
    const res = await llamar({ scope: 'branch', branchId: 777, timezone: 'Europe/Madrid' });
    expect(res.status).toBe(404);
    expect(escrituras.filter((e) => e.tabla === 'branches')).toEqual([]);
  });

  it('sin branchId no se escribe nada', async () => {
    const res = await llamar({ scope: 'branch', timezone: 'Europe/Madrid' });
    expect(res.status).toBe(400);
    expect(escrituras).toEqual([]);
  });
});

describe('validación de la zona', () => {
  it.each(['EST', 'america/bogota', 'Marte/Olympus', 42])(
    '%s se rechaza con 400 antes de tocar la base',
    async (valor) => {
      const res = await llamar({ scope: 'organization', timezone: valor });
      expect(res.status).toBe(400);
      expect(escrituras).toEqual([]);
    },
  );

  it('un 22023 del trigger llega a la pantalla, no se traga', async () => {
    guion.errorUpdate = { message: 'Zona horaria no reconocida por Postgres' };
    const res = await llamar({ scope: 'organization', timezone: 'Europe/Madrid' });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: 'TIMEZONE_REJECTED' });
  });
});
