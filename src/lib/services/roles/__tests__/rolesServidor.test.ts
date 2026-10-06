/**
 * Roles y permisos — servicio de servidor con un cliente Supabase simulado.
 *
 *  - «¿Qué puede hacer?»: lo efectivo lo da `get_user_permission_codes` (la
 *    misma función que usan `fn_tiene_permiso`, `check_user_permission` y el
 *    middleware); el servicio solo anota el origen. Se comprueba que se llama
 *    con la persona objetivo y que, si la base no devuelve un código, no se da
 *    por concedido aunque el rol lo tenga.
 *  - Guardar con conflicto: la RPC responde 40001 → 409 `conflicto` con lo que
 *    hay guardado ahora.
 *  - Eliminar con personas: el rol de destino llega a `fn_rol_eliminar`, que
 *    reasigna en la misma transacción; sin destino, 400 `requiere_destino`.
 *  - Permisos resueltos en el servidor: sin el permiso del catálogo, 403 antes
 *    de tocar la base; ningún dato del cliente decide.
 */
import {
  asignarRol,
  capacidadesDe,
  crearRol,
  eliminarRol,
  guardarAlcance,
  guardarRol,
  listarRoles,
  quePuedeHacer,
  type ContextoRoles,
} from '../rolesServidor.server';
import { ErrorRoles, errorDeRpc } from '../erroresRoles';

type Resultado = { data: unknown; error: { code?: string; message?: string; details?: string } | null };
interface Consulta {
  tabla: string;
  filtros: [string, unknown][];
  unico: boolean;
}

const ORG = 120;
const PERMISOS = [
  { id: 1, code: 'pos.view', module: 'pos', name: 'View', description: 'Ver el punto de venta' },
  { id: 2, code: 'pos.refund', module: 'pos', name: 'Refund', description: 'Devolver una venta' },
  { id: 3, code: 'inventory.view', module: 'inventory', name: 'View', description: 'Ver inventario' },
  { id: 4, code: 'roles.view', module: 'roles', name: 'View', description: 'Ver roles' },
];

/** Cliente mínimo: cada `from()` es encadenable y se resuelve con `tablas[tabla](consulta)`. */
function clienteSimulado(
  tablas: Record<string, (c: Consulta) => Resultado>,
  rpcs: Record<string, (args: Record<string, unknown>) => Resultado>,
) {
  const llamadasRpc: [string, Record<string, unknown>][] = [];
  const from = (tabla: string) => {
    const c: Consulta = { tabla, filtros: [], unico: false };
    const resolver = () => (tablas[tabla] ?? (() => ({ data: [], error: null })))(c);
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'limit']) q[m] = () => q;
    for (const m of ['eq', 'in', 'or', 'neq']) q[m] = (col: string, v?: unknown) => (c.filtros.push([`${m}:${col}`, v]), q);
    q.maybeSingle = () => ((c.unico = true), Promise.resolve(resolver()));
    q.then = (ok: (r: Resultado) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, ko);
    return q;
  };
  const rpc = (nombre: string, args: Record<string, unknown>) => {
    llamadasRpc.push([nombre, args]);
    return Promise.resolve((rpcs[nombre] ?? (() => ({ data: null, error: { code: 'PGRST202', message: 'no existe' } })))(args));
  };
  return { cliente: { from, rpc } as unknown as ContextoRoles['supabase'], llamadasRpc };
}

const filtro = (c: Consulta, clave: string) => c.filtros.find(([k]) => k === clave)?.[1];

/** Organización ficticia: rol 4 (Empleado) con pos.view y pos.refund; el cargo suma inventory.view. */
function tablasBase(extra: Partial<Record<string, (c: Consulta) => Resultado>> = {}) {
  const miembros = [
    { id: 10, user_id: 'u-sesion', role_id: 2, job_position_id: null, is_super_admin: false, is_active: true },
    { id: 11, user_id: 'u-cajera', role_id: 4, job_position_id: 'c-1', is_super_admin: false, is_active: true },
  ];
  return {
    permissions: () => ({ data: PERMISOS, error: null }),
    roles: (c: Consulta) =>
      // Roles visibles: los del sistema y los de ESTA organización (filtro .or de la sesión).
      c.filtros.some(([k]) => k === `or:organization_id.is.null,organization_id.eq.${ORG}`)
        ? {
            data: [
              { id: 2, name: 'Admin de organización', description: null, is_system: true, organization_id: null, version: 1, updated_at: null, based_on_role_id: null },
              { id: 4, name: 'Empleado', description: null, is_system: true, organization_id: null, version: 1, updated_at: null, based_on_role_id: null },
              { id: 77, name: 'Cajero de turno', description: null, is_system: false, organization_id: ORG, version: 3, updated_at: '2026-10-06T10:00:00Z', based_on_role_id: 4 },
            ],
            error: null,
          }
        : { data: [{ id: 2, name: 'Admin de organización' }, { id: 4, name: 'Empleado' }], error: null },
    role_permissions: (c: Consulta) => {
      const filas = [
        { role_id: 4, permission_id: 1 },
        { role_id: 4, permission_id: 2 },
        { role_id: 77, permission_id: 1 },
      ];
      const rol = filtro(c, 'eq:role_id');
      if (rol !== undefined) return { data: filas.filter((f) => f.role_id === rol), error: null };
      return { data: filas, error: null };
    },
    organization_members: (c: Consulta) => {
      if (c.unico) return { data: miembros.find((m) => m.id === filtro(c, 'eq:id')) ?? null, error: null };
      return { data: miembros, error: null };
    },
    organizations: () => ({ data: { owner_user_id: 'u-dueno' }, error: null }),
    profiles: () => ({
      data: [
        { id: 'u-sesion', first_name: 'Ana', last_name: 'Admin', email: 'ana@correo.co' },
        { id: 'u-cajera', first_name: 'Carla', last_name: 'Caja', email: 'carla@correo.co' },
      ],
      error: null,
    }),
    job_positions: () => ({ data: [{ id: 'c-1', name: 'Cajera' }], error: null }),
    job_position_permissions: () => ({ data: [{ permission_id: 3, allowed: true }], error: null }),
    branches: () => ({ data: [{ id: 1, name: 'Principal', address: null, city: null }, { id: 2, name: 'Norte', address: null, city: null }], error: null }),
    member_branches: () => ({ data: [{ branch_id: 2 }], error: null }),
    ...extra,
  } as Record<string, (c: Consulta) => Resultado>;
}

function contexto(cliente: ContextoRoles['supabase'], sesion: Partial<ContextoRoles> = {}): ContextoRoles {
  return { userId: 'u-sesion', organizationId: ORG, roleId: 2, isSuperAdmin: false, memberId: 10, supabase: cliente, ...sesion };
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('capacidades: resueltas en el servidor', () => {
  test('admin por id de rol: todo, sin consultar la base', async () => {
    const { cliente, llamadasRpc } = clienteSimulado(tablasBase(), {});
    expect(Object.values(await capacidadesDe(contexto(cliente))).every(Boolean)).toBe(true);
    expect(llamadasRpc).toEqual([]);
  });

  test('no admin: cada capacidad sale de get_user_permission_codes del usuario de la SESIÓN', async () => {
    const { cliente, llamadasRpc } = clienteSimulado(tablasBase(), {
      get_user_permission_codes: () => ({ data: ['roles.edit', 'users.view'], error: null }),
    });
    const caps = await capacidadesDe(contexto(cliente, { roleId: 4 }));
    expect(caps).toMatchObject({ ver: true, editar: true, verPersonas: true, crear: false, eliminar: false, asignar: false });
    expect(llamadasRpc[0]).toEqual(['get_user_permission_codes', { p_user_id: 'u-sesion', p_organization_id: ORG }]);
  });

  test('si la base falla, nada (fail-closed) y la lista responde 403', async () => {
    const { cliente } = clienteSimulado(tablasBase(), {
      get_user_permission_codes: () => ({ data: null, error: { code: '57014', message: 'timeout' } }),
    });
    await expect(listarRoles(contexto(cliente, { roleId: 4 }))).rejects.toMatchObject({ estado: 403, codigo: 'sin_permiso' });
  });

  test('sin roles.create no se llama a la RPC de crear', async () => {
    const { cliente, llamadasRpc } = clienteSimulado(tablasBase(), {
      get_user_permission_codes: () => ({ data: ['roles.view'], error: null }),
    });
    await expect(crearRol(contexto(cliente, { roleId: 4 }), { nombre: 'Nuevo' })).rejects.toMatchObject({ estado: 403 });
    expect(llamadasRpc.map(([n]) => n)).toEqual(['get_user_permission_codes']);
  });
});

describe('lista de roles', () => {
  test('roles del sistema y propios; personas contadas SOLO en esta organización', async () => {
    const { cliente } = clienteSimulado(tablasBase(), {});
    const r = await listarRoles(contexto(cliente));
    expect(r.modeloListo).toBe(true);
    expect(r.roles.map((x) => [x.id, x.sistema, x.personas])).toEqual([
      [2, true, 1],
      [4, true, 1],
      [77, false, 0],
    ]);
    expect(r.roles.find((x) => x.id === 2)).toMatchObject({ esAdmin: true, duplicable: false });
    expect(r.roles.find((x) => x.id === 77)).toMatchObject({ basadoEnNombre: 'Empleado', version: 3 });
    expect(r.totalPersonas).toBe(2);
  });

  test('antes de la migración (sin roles.organization_id): solo los del sistema y de solo lectura', async () => {
    const { cliente } = clienteSimulado(
      tablasBase({
        roles: (c) =>
          c.filtros.some(([k]) => k.startsWith('or:'))
            ? { data: null, error: { code: '42703', message: 'column roles.organization_id does not exist' } }
            : { data: [{ id: 4, name: 'Empleado', description: null, is_system: true }], error: null },
      }),
      {},
    );
    const r = await listarRoles(contexto(cliente));
    expect(r.modeloListo).toBe(false);
    expect(r.roles.map((x) => x.id)).toEqual([4]);
  });
});

describe('«¿Qué puede hacer esta persona?»', () => {
  test('usa get_user_permission_codes de la persona objetivo y anota rol / cargo', async () => {
    const { cliente, llamadasRpc } = clienteSimulado(tablasBase(), {
      // La base es la que decide: devuelve pos.view (rol) e inventory.view (cargo), NO pos.refund.
      get_user_permission_codes: () => ({ data: ['pos.view', 'inventory.view'], error: null }),
    });
    const r = await quePuedeHacer(contexto(cliente), 11);
    expect(llamadasRpc).toEqual([['get_user_permission_codes', { p_user_id: 'u-cajera', p_organization_id: ORG }]]);
    const de = (id: number) => r.permisos.find((p) => p.id === id)!;
    expect(de(1)).toMatchObject({ concedido: true, origenes: ['rol'] });
    expect(de(3)).toMatchObject({ concedido: true, origenes: ['cargo'] });
    // El rol lo tiene, pero la base no lo devolvió: no se pinta como concedido.
    expect(de(2)).toMatchObject({ concedido: false, origenes: [] });
    expect(r).toMatchObject({ accesoTotal: false, total: 2, rol: { id: 4, nombre: 'Empleado', total: 2 }, cargo: { id: 'c-1', nombre: 'Cajera', suma: 1, quita: 0 } });
    expect(r.alcance).toMatchObject({ modo: 'algunas', asignadas: [2] });
    expect(r.puedeEditarAlcance).toBe(true);
  });

  test('admin (rol 1/2 por id): acceso total sin pedir los códigos y alcance «todas»', async () => {
    const { cliente, llamadasRpc } = clienteSimulado(tablasBase(), {});
    const r = await quePuedeHacer(contexto(cliente), 10);
    expect(llamadasRpc).toEqual([]);
    expect(r).toMatchObject({ accesoTotal: true, motivoAccesoTotal: 'rolAdmin', total: PERMISOS.length });
    expect(r.alcance).toMatchObject({ modo: 'todas', esAdmin: true });
    expect(r.puedeEditarAlcance).toBe(false);
  });

  test('sin users.view solo se puede consultar a uno mismo; otra organización = 404', async () => {
    const { cliente } = clienteSimulado(tablasBase(), {
      get_user_permission_codes: () => ({ data: ['roles.view'], error: null }),
    });
    await expect(quePuedeHacer(contexto(cliente, { roleId: 4, memberId: 10 }), 11)).rejects.toMatchObject({ estado: 403 });
    const otro = clienteSimulado(tablasBase(), {}).cliente;
    await expect(quePuedeHacer(contexto(otro), 999)).rejects.toMatchObject({ estado: 404, codigo: 'no_encontrado' });
  });
});

describe('guardar un rol con control de versión', () => {
  test('pasa la versión leída a fn_rol_guardar', async () => {
    const { cliente, llamadasRpc } = clienteSimulado(tablasBase(), {
      fn_rol_guardar: () => ({ data: { id: 77, version: 4 }, error: null }),
    });
    const r = await guardarRol(contexto(cliente), 77, { version: 3, nombre: 'Cajero de turno', descripcion: null, permisoIds: [1, 1, 3, -2] });
    expect(r).toEqual({ id: 77, version: 4 });
    expect(llamadasRpc[0]).toEqual(['fn_rol_guardar', { p_role_id: 77, p_version: 3, p_nombre: 'Cajero de turno', p_descripcion: '', p_permisos: [1, 3] }]);
  });

  test('conflicto (40001): 409 con lo que hay guardado ahora para reaplicar mis cambios', async () => {
    const { cliente } = clienteSimulado(tablasBase(), {
      fn_rol_guardar: () => ({ data: null, error: { code: '40001', message: 'roles: otra persona guardó este rol mientras lo editabas', details: '4' } }),
    });
    const err = await guardarRol(contexto(cliente), 77, { version: 2, nombre: 'Cajero de turno', descripcion: null, permisoIds: [1, 3] }).catch((e) => e);
    expect(err).toBeInstanceOf(ErrorRoles);
    expect(err).toMatchObject({ estado: 409, codigo: 'conflicto', extra: { actual: { version: 3, nombre: 'Cajero de turno', permisoIds: [1] } } });
  });

  test('rol del sistema: la base lo rechaza y se traduce a 403 rol_sistema', async () => {
    const { cliente } = clienteSimulado(tablasBase(), {
      fn_rol_guardar: () => ({ data: null, error: { code: '42501', message: 'roles: los roles del sistema no se editan; duplícalo como rol propio' } }),
    });
    await expect(guardarRol(contexto(cliente), 4, { version: 1, nombre: 'Empleado', descripcion: null, permisoIds: [] })).rejects.toMatchObject({
      estado: 403,
      codigo: 'rol_sistema',
    });
  });

  test('migración sin aplicar: 503 migracion_pendiente', async () => {
    const { cliente } = clienteSimulado(tablasBase(), {});
    await expect(guardarRol(contexto(cliente), 77, { version: 3, nombre: 'X1', descripcion: null, permisoIds: [] })).rejects.toMatchObject({
      estado: 503,
      codigo: 'migracion_pendiente',
    });
  });
});

describe('eliminar un rol con personas: reasignar a otro', () => {
  test('el destino llega a fn_rol_eliminar (reasigna y borra en una transacción)', async () => {
    const { cliente, llamadasRpc } = clienteSimulado(tablasBase(), {
      fn_rol_eliminar: () => ({ data: { id: 77, reasignados: 3, invitaciones: 1, destino: 4 }, error: null }),
    });
    expect(await eliminarRol(contexto(cliente), 77, 4)).toEqual({ reasignados: 3 });
    expect(llamadasRpc[0]).toEqual(['fn_rol_eliminar', { p_role_id: 77, p_rol_destino: 4 }]);
  });

  test('sin destino y con personas: 400 requiere_destino; destino ajeno: 400 destino_no_valido', async () => {
    const sinDestino = clienteSimulado(tablasBase(), {
      fn_rol_eliminar: () => ({ data: null, error: { code: '22023', message: 'roles: el rol tiene personas; elige a qué rol pasan' } }),
    });
    await expect(eliminarRol(contexto(sinDestino.cliente), 77, null)).rejects.toMatchObject({ estado: 400, codigo: 'requiere_destino' });
    const ajeno = clienteSimulado(tablasBase(), {
      fn_rol_eliminar: () => ({ data: null, error: { code: '22023', message: 'roles: rol de destino no válido' } }),
    });
    await expect(eliminarRol(contexto(ajeno.cliente), 77, 999)).rejects.toMatchObject({ estado: 400, codigo: 'destino_no_valido' });
  });
});

describe('asignar y alcance', () => {
  test('asignar a varias personas: la organización sale de la sesión, todo o nada', async () => {
    const { cliente, llamadasRpc } = clienteSimulado(tablasBase(), {
      fn_rol_asignar_miembros: () => ({ data: { role_id: 77, asignados: 2 }, error: null }),
    });
    expect(await asignarRol(contexto(cliente), 77, [11, 12, 11])).toEqual({ asignados: 2 });
    expect(llamadasRpc[0]).toEqual(['fn_rol_asignar_miembros', { p_organization_id: ORG, p_role_id: 77, p_member_ids: [11, 12] }]);
    const fallo = clienteSimulado(tablasBase(), {
      fn_rol_asignar_miembros: () => ({ data: null, error: { code: '42501', message: 'roles: no puedes cambiarte a ti mismo', details: '10' } }),
    });
    await expect(asignarRol(contexto(fallo.cliente), 77, [10])).rejects.toMatchObject({ estado: 403, codigo: 'miembro_no_valido', extra: { detalle: '10' } });
  });

  test('alcance: la misma RPC que Miembros; «todas» explícito, «algunas» = las elegidas', async () => {
    const { cliente, llamadasRpc } = clienteSimulado(tablasBase(), {
      fn_miembro_asignar_sucursales: (a) => ({
        data: { id: 11, todas: a.p_todas, sucursales: a.p_todas ? [] : a.p_branch_ids },
        error: null,
      }),
    });
    expect(await guardarAlcance(contexto(cliente), 11, null)).toEqual({ sucursales: [] });
    expect(await guardarAlcance(contexto(cliente), 11, [2, 2])).toEqual({ sucursales: [2] });
    expect(llamadasRpc).toEqual([
      ['fn_miembro_asignar_sucursales', { p_member_id: 11, p_branch_ids: null, p_todas: true }],
      ['fn_miembro_asignar_sucursales', { p_member_id: 11, p_branch_ids: [2], p_todas: false }],
    ]);
  });

  test('alcance: una lista vacía NO es «todas»; se rechaza sin llamar a la base', async () => {
    const { cliente, llamadasRpc } = clienteSimulado(tablasBase(), {});
    await expect(guardarAlcance(contexto(cliente), 11, [])).rejects.toMatchObject({ estado: 400, codigo: 'datos_invalidos' });
    await expect(guardarAlcance(contexto(cliente), 11, [0, -3])).rejects.toMatchObject({ estado: 400, codigo: 'datos_invalidos' });
    expect(llamadasRpc).toEqual([]);
  });

  test('alcance: los errores de la RPC de miembros llegan con código estable', async () => {
    const { cliente } = clienteSimulado(tablasBase(), {
      fn_miembro_asignar_sucursales: () => ({ data: null, error: { code: '22023', message: 'miembros: alguna sucursal no es de esta organización' } }),
    });
    await expect(guardarAlcance(contexto(cliente), 11, [999])).rejects.toMatchObject({ estado: 400, codigo: 'datos_invalidos' });
  });
});

describe('errorDeRpc', () => {
  test('códigos estables para la interfaz', () => {
    expect(errorDeRpc({ code: '23505', message: 'roles: ya existe un rol con ese nombre' }).codigo).toBe('nombre_duplicado');
    expect(errorDeRpc({ code: 'P0002', message: 'roles: rol no encontrado' }).codigo).toBe('no_encontrado');
    expect(errorDeRpc({ code: '22023', message: 'roles: ese rol no se puede usar como plantilla' }).codigo).toBe('plantilla_no_valida');
    expect(errorDeRpc({ code: '42501', message: 'roles: no tienes permiso (roles.edit)' }).codigo).toBe('sin_permiso');
    expect(errorDeRpc({ code: 'XX000', message: 'algo' })).toMatchObject({ estado: 500, codigo: 'error_interno' });
  });
});
