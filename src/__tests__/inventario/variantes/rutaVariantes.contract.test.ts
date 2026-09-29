/**
 * POST /api/inventario/variantes (inventario B6a; reglas duras 5 y 6).
 *
 * - Sin sesión: 401 sin tocar la base.
 * - La organización sale de la sesión: una ajena en el cuerpo es 403 sin RPC;
 *   la RPC recibe `p_org` y `p_actor` de la sesión, nunca del cliente.
 * - El permiso se lee con la sesión del usuario ANTES de usar el cliente de
 *   servicio: sin `editar_catalogo` (o sin `eliminar` para borrar) → 403 y el
 *   cliente de servicio no se toca.
 * - Los errores de la RPC salen con estado HTTP y `codigo` estable.
 */
const ORG = 2;

const guion = {
  sinSesion: false,
  permisos: { ver: true, editar_catalogo: true, eliminar: false } as Record<string, boolean>,
  errorPermisos: null as null | { message: string },
  errorServicio: null as null | { message: string; code?: string; hint?: string; details?: string },
  datosServicio: { id: 7, variantes_actualizadas: 3 } as unknown,
};
const llamadasSesion: { nombre: string; args: Record<string, unknown> }[] = [];
const llamadasServicio: { nombre: string; args: Record<string, unknown> }[] = [];

const clienteSesion = {
  rpc: async (nombre: string, args: Record<string, unknown>) => {
    llamadasSesion.push({ nombre, args });
    if (nombre === 'fn_inventario_permisos') return guion.errorPermisos ? { data: null, error: guion.errorPermisos } : { data: guion.permisos, error: null };
    throw new Error(`la sesión no debería llamar ${nombre}`);
  },
  from: () => {
    throw new Error('la ruta no lee ni escribe tablas');
  },
};

jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => ({
    rpc: async (nombre: string, args: Record<string, unknown>) => {
      llamadasServicio.push({ nombre, args });
      return guion.errorServicio ? { data: null, error: guion.errorServicio } : { data: guion.datosServicio, error: null };
    },
    from: () => {
      throw new Error('el cliente de servicio no toca tablas');
    },
  }),
}));

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
  const ctx = { userId: 'usuario-sesion', organizationId: 2, roleId: 4, isSuperAdmin: false };
  return {
    OrgContextError,
    withOrg:
      (handler: (c: unknown, r: Request, p: unknown) => Promise<Response>) =>
      async (req: Request, params: unknown) => {
        try {
          if (guion.sinSesion) throw new OrgContextError('No autenticado', 401, 'UNAUTHENTICATED');
          return await handler({ ...ctx, supabase: clienteSesion }, req, params);
        } catch (err) {
          if (err instanceof OrgContextError) {
            const e = err as { message: string; code: string; statusCode: number };
            return new Response(JSON.stringify({ error: e.message, code: e.code }), { status: e.statusCode });
          }
          throw err;
        }
      },
  };
});

import { POST } from '@/app/api/inventario/variantes/route';

const post = (body: unknown) =>
  POST(new Request('http://x/api/inventario/variantes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), {
    params: Promise.resolve({}),
  });

beforeEach(() => {
  guion.sinSesion = false;
  guion.permisos = { ver: true, editar_catalogo: true, eliminar: false };
  guion.errorPermisos = null;
  guion.errorServicio = null;
  guion.datosServicio = { id: 7, variantes_actualizadas: 3 };
  llamadasSesion.length = 0;
  llamadasServicio.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('sesión y organización (regla 5)', () => {
  it('sin sesión → 401 sin llamar a ninguna RPC', async () => {
    guion.sinSesion = true;
    const r = await post({ accion: 'completar' });
    expect(r.status).toBe(401);
    expect(llamadasSesion).toEqual([]);
    expect(llamadasServicio).toEqual([]);
  });

  it('una organización ajena en el cuerpo → 403 sin RPC', async () => {
    const r = await post({ accion: 'tipo_guardar', id: null, datos: { nombre: 'Talla' }, organization_id: 999 });
    expect(r.status).toBe(403);
    expect(llamadasSesion).toEqual([]);
    expect(llamadasServicio).toEqual([]);
  });

  it('la misma organización en el cuerpo no molesta, y la RPC usa la de la sesión y el usuario de la sesión', async () => {
    const r = await post({ accion: 'tipo_guardar', id: 45, datos: { nombre: 'Talla', unificar: true }, organization_id: ORG });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ resultado: { id: 7, variantes_actualizadas: 3 } });
    expect(llamadasSesion).toEqual([{ nombre: 'fn_inventario_permisos', args: { p_org: ORG } }]);
    expect(llamadasServicio).toEqual([
      {
        nombre: 'fn_variantes_como_actor',
        args: { p_actor: 'usuario-sesion', p_org: ORG, p_accion: 'tipo_guardar', p_args: { id: 45, datos: { nombre: 'Talla', unificar: true } } },
      },
    ]);
  });
});

describe('permisos en el servidor (regla 6)', () => {
  it('sin editar_catalogo → 403 y no se usa el cliente de servicio', async () => {
    guion.permisos = { ver: true, editar_catalogo: false, eliminar: true };
    const r = await post({ accion: 'fusionar_tipos', ids: [47, 52], destino: 45 });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ codigo: 'sin_permiso' });
    expect(llamadasServicio).toEqual([]);
  });

  it('eliminar exige el permiso eliminar, no editar_catalogo', async () => {
    const r = await post({ accion: 'eliminar', ids: [53] });
    expect(r.status).toBe(403);
    expect(llamadasServicio).toEqual([]);
    guion.permisos = { ver: true, editar_catalogo: false, eliminar: true };
    const r2 = await post({ accion: 'eliminar', ids: [53] });
    expect(r2.status).toBe(200);
    expect(llamadasServicio[0].args.p_args).toEqual({ ids: [53], valores: [] });
  });

  it('si leer los permisos falla (otra organización, sesión vencida) → 403, nunca «todo permitido»', async () => {
    guion.errorPermisos = { message: 'Acceso denegado a la organización' };
    const r = await post({ accion: 'completar' });
    expect(r.status).toBe(403);
    expect(llamadasServicio).toEqual([]);
  });

  it('un permiso que no es `true` literal no concede', async () => {
    guion.permisos = { editar_catalogo: 'true' as unknown as boolean };
    const r = await post({ accion: 'completar' });
    expect(r.status).toBe(403);
  });
});

describe('validación y errores de la RPC', () => {
  it.each([
    ['acción desconocida', { accion: 'borrar_todo' }],
    ['nombre vacío', { accion: 'tipo_guardar', id: null, datos: { nombre: '   ' } }],
    ['hex inválido', { accion: 'valor_guardar', id: null, datos: { tipo_id: 45, valor: 'Rojo', hex: 'rojo' } }],
    ['campo de más', { accion: 'completar', extra: 1 }],
    ['ids no numéricos', { accion: 'fusionar_valores', ids: ['a'], destino: 1 }],
  ])('%s → 400 sin RPC', async (_n, cuerpo) => {
    const r = await post(cuerpo);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ codigo: 'datos_invalidos' });
    expect(llamadasSesion).toEqual([]);
    expect(llamadasServicio).toEqual([]);
  });

  it.each([
    ['42501', 403, 'sin_permiso'],
    ['P0002', 404, 'tipo_no_encontrado'],
    ['23505', 409, 'nombre_repetido'],
    ['23503', 409, 'en_uso'],
    ['22023', 400, 'tipo_distinto'],
  ])('SQLSTATE %s → %i con el código de la RPC', async (code, estado, mensaje) => {
    guion.errorServicio = { message: mensaje, code, hint: '45' };
    const r = await post({ accion: 'tipo_guardar', id: 47, datos: { nombre: 'Talla' } });
    expect(r.status).toBe(estado);
    expect(await r.json()).toEqual({ codigo: mensaje, sqlstate: code, relacionado: 45 });
  });

  it('un error inesperado no filtra el mensaje interno', async () => {
    guion.errorServicio = { message: 'relation "x" does not exist', code: '42P01' };
    const r = await post({ accion: 'completar' });
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ codigo: 'error_interno', sqlstate: '42P01', relacionado: null });
  });
});
