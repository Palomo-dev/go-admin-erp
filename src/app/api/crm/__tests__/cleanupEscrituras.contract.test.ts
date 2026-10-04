import { NextRequest } from 'next/server';
import { fakeSupabase, makeDb, ORG, OTRA, U, YO, OTRO_VENDEDOR, type Ola1Db } from './ola1Fake';

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
let db: Ola1Db;
let permisos: Set<string>;
let fallo: string | null;
let despuesLectura: ((tabla: string) => void) | null;
let autenticado: boolean;

function cliente() {
  const base = fakeSupabase(db);
  return { ...base, from: (tabla: string) => {
    const consulta = base.from(tabla);
    const leer = Reflect.get(consulta, 'maybeSingle') as () => Promise<{ data: unknown; error: unknown }>;
    Reflect.set(consulta, 'maybeSingle', async () => {
      if (tabla === fallo) return { data: null, error: { code: 'XX000', message: 'detalle privado' } };
      const resultado = await leer();
      const hook = despuesLectura;
      despuesLectura = null;
      hook?.(tabla);
      return resultado;
    });
    return consulta;
  } };
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => {
    if (!autenticado) throw new RealOrgContextError('Sin sesión', 401, 'UNAUTHENTICATED');
    return { organizationId: ORG, userId: YO, roleId: 4, isSuperAdmin: false, supabase: cliente() };
  }),
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, codigo: string) => permisos.has(codigo)),
}));

import { PATCH as clientePatch } from '../customers/[id]/route';
import { PATCH as tareaPatch } from '../tasks/[id]/route';

const request = (url: string, cuerpo: unknown) => new NextRequest(`http://localhost${url}`, {
  method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
});
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const llamarCliente = (cuerpo: unknown, id = U(10), query = '') => clientePatch(request(`/api/crm/customers/${id}${query}`, cuerpo), params(id));
const llamarTarea = (cuerpo: unknown, id = U(30), query = '') => tareaPatch(request(`/api/crm/tasks/${id}${query}`, cuerpo), params(id));

beforeEach(() => {
  db = makeDb({
    customers: [
      { id: U(10), organization_id: ORG, customer_type: 'person', updated_at: '2026-09-01T00:00:00Z', first_name: 'Persona', last_name: 'Ejemplo' },
      { id: U(11), organization_id: ORG, customer_type: 'company', updated_at: '2026-09-01T00:00:00Z', company_name: 'Empresa de prueba' },
      { id: U(90), organization_id: OTRA, customer_type: 'person', updated_at: '2026-09-01T00:00:00Z' },
    ],
    opportunities: [{ id: U(1), organization_id: ORG, customer_id: U(10) }],
    tasks: [{ id: U(30), organization_id: ORG, created_by: YO, assigned_to: null, status: 'open', completed_at: null,
      updated_at: '2026-09-01T00:00:00Z', related_to_type: 'opportunity', related_to_id: U(1) }],
  });
  permisos = new Set(['crm.customers.edit']);
  fallo = null;
  despuesLectura = null;
  autenticado = true;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('edición de cliente por sesión y campos base', () => {
  it('reutiliza el reparto canónico de nombre, nunca escribe full_name y permite limpiar el correo', async () => {
    expect((await llamarCliente({ full_name: 'Ana María Pérez Gómez', email: '' })).status).toBe(200);
    expect(db.writes[0].payload).toEqual({ first_name: 'Ana María', last_name: 'Pérez Gómez', email: null, updated_at: expect.any(String) });
    expect(db.writes[0].filtros).toContainEqual({ k: 'eq', col: 'organization_id', v: ORG });
  });

  it('una empresa se renombra por company_name sin alterar sus nombres base', async () => {
    expect((await llamarCliente({ full_name: 'Empresa sintética nueva' }, U(11))).status).toBe(200);
    expect(db.writes[0].payload).toEqual({ company_name: 'Empresa sintética nueva', updated_at: expect.any(String) });
  });

  it('rechaza sin permiso, cliente ajeno y UUID inválido antes de cualquier escritura', async () => {
    permisos.clear();
    expect((await llamarCliente({ notes: 'x' })).status).toBe(403);
    permisos.add('crm.customers.edit');
    expect((await llamarCliente({ notes: 'x' }, U(90))).status).toBe(404);
    expect((await llamarCliente({ notes: 'x' }, 'otro')).status).toBe(400);
    expect(db.writes).toEqual([]);
  });

  it('campos de actor, rol, empresa o tipo de cliente no se cuelan desde el formulario', async () => {
    for (const extra of ['organization', 'created_by', 'role', 'company_name', 'customer_type']) {
      expect((await llamarCliente({ notes: 'x', [extra]: 'company' })).status).toBe(400);
    }
    expect(db.writes).toEqual([]);
  });

  it('una edición simultánea produce 409 sin pisar el cambio nuevo', async () => {
    despuesLectura = () => Object.assign(db.t.customers[0], { updated_at: '2026-10-01T00:00:00Z', notes: 'Edición concurrente' });
    expect((await llamarCliente({ notes: 'Edición anterior' })).status).toBe(409);
    expect(db.t.customers[0].notes).toBe('Edición concurrente');
  });

  it('un formulario abierto antes de otra edición produce 409 antes de escribir', async () => {
    expect((await llamarCliente({ notes: 'Formulario anterior', expected_updated_at: '2026-08-01T00:00:00Z' })).status).toBe(409);
    expect(db.writes).toEqual([]);
    expect((await llamarCliente({ notes: 'Versión actual', expected_updated_at: '2026-09-01T00:00:00Z' })).status).toBe(200);
    expect(db.writes[0].payload).not.toHaveProperty('expected_updated_at');
  });
});

describe('estado de tarea: autor, responsable y permiso canónico', () => {
  it('cerrar fecha en el servidor, repetir conserva completed_at y reabrir lo limpia', async () => {
    expect((await llamarTarea({ status: 'done' })).status).toBe(200);
    const cierre = db.t.tasks[0].completed_at;
    expect(Number.isFinite(Date.parse(String(cierre)))).toBe(true);
    expect(db.writes).toHaveLength(1);
    expect((await llamarTarea({ status: 'done' })).status).toBe(200);
    expect(db.t.tasks[0].completed_at).toBe(cierre);
    expect(db.writes).toHaveLength(1);
    expect((await llamarTarea({ status: 'open' })).status).toBe(200);
    expect(db.t.tasks[0].completed_at).toBeNull();
  });

  it('el responsable puede actuar; lo ajeno o sin autor exige activities.edit_any', async () => {
    db.t.tasks[0].created_by = OTRO_VENDEDOR;
    expect((await llamarTarea({ status: 'done' })).status).toBe(403);
    db.t.tasks[0].assigned_to = YO;
    expect((await llamarTarea({ status: 'done' })).status).toBe(200);
    db.t.tasks[0].status = 'open';
    db.t.tasks[0].assigned_to = null;
    db.t.tasks[0].created_by = null;
    expect((await llamarTarea({ status: 'done' })).status).toBe(403);
    permisos.add('crm.activities.edit_any');
    expect((await llamarTarea({ status: 'done' })).status).toBe(200);
  });

  it('calls.view_all no concede edición de tareas', async () => {
    db.t.tasks[0].created_by = OTRO_VENDEDOR;
    permisos.add('crm.calls.view_all');
    expect((await llamarTarea({ status: 'done' })).status).toBe(403);
    expect(db.writes).toEqual([]);
  });

  it('rechaza actor, timestamp, estado inválido y referencia de otro módulo', async () => {
    for (const cuerpo of [{ status: 'done', completed_at: '2000-01-01' }, { status: 'done', assigned_to: YO }, { status: 'fake' }]) {
      expect((await llamarTarea(cuerpo)).status).toBe(400);
    }
    db.t.tasks[0].related_to_type = 'project';
    expect((await llamarTarea({ status: 'done' })).status).toBe(409);
    expect(db.writes).toEqual([]);
  });

  it('referencia ausente da 404; error SQL real de esa lectura da 500 sin mutaciones ni detalles privados', async () => {
    db.t.opportunities = [];
    expect((await llamarTarea({ status: 'done' })).status).toBe(404);
    fallo = 'opportunities';
    const respuesta = await llamarTarea({ status: 'done' });
    expect(respuesta.status).toBe(500);
    expect(await respuesta.text()).not.toContain('detalle privado');
    expect(db.writes).toEqual([]);
  });

  it.each(['project', null])('el historial conserva la tarea enlazada directamente al cliente con referencia %s', async (tipo) => {
    Object.assign(db.t.tasks[0], { related_to_type: tipo, related_to_id: tipo ? U(99) : null, customer_id: U(10) });
    expect((await llamarTarea({ status: 'done' })).status).toBe(200);
    expect(db.writes[0].filtros).toContainEqual({ k: 'eq', col: 'customer_id', v: U(10) });
  });

  it('un cliente directo ajeno y un cambio simultáneo de cliente no permiten mutar la tarea', async () => {
    Object.assign(db.t.tasks[0], { related_to_type: null, related_to_id: null, customer_id: U(90) });
    expect((await llamarTarea({ status: 'done' })).status).toBe(404);
    expect(db.writes).toEqual([]);
    db.t.tasks[0].customer_id = U(10);
    despuesLectura = () => { db.t.tasks[0].customer_id = U(90); };
    expect((await llamarTarea({ status: 'done' })).status).toBe(409);
    expect(db.t.tasks[0].status).toBe('open');
  });

  it('un cambio simultáneo de responsable impide aplicar un permiso antiguo', async () => {
    db.t.tasks[0].created_by = OTRO_VENDEDOR;
    db.t.tasks[0].assigned_to = YO;
    despuesLectura = () => { db.t.tasks[0].assigned_to = OTRO_VENDEDOR; };
    expect((await llamarTarea({ status: 'done' })).status).toBe(409);
    expect(db.t.tasks[0].status).toBe('open');
  });
});

describe.each([['cliente', llamarCliente, { notes: 'x' }], ['tarea', llamarTarea, { status: 'done' }]] as const)('%s: contratos comunes', (_tipo, llamar, cuerpo) => {
  it('401 sin sesión y errores SQL no se convierten en 404 o éxito', async () => {
    autenticado = false;
    expect((await llamar(cuerpo)).status).toBe(401);
    autenticado = true;
    fallo = _tipo === 'cliente' ? 'customers' : 'tasks';
    expect((await llamar(cuerpo)).status).toBe(500);
    expect(db.writes).toEqual([]);
  });

  it.each(['organization_id', 'organizationId', 'orgId', 'org_id'])('%s ajena en body y query da 403 sin escribir', async (clave) => {
    expect((await llamar({ ...cuerpo, [clave]: OTRA })).status).toBe(403);
    expect((await llamar(cuerpo, undefined, `?${clave}=${OTRA}`)).status).toBe(403);
    expect((await llamar(cuerpo, undefined, `?${clave}=${ORG}&${clave}=${OTRA}`)).status).toBe(403);
    expect(db.writes).toEqual([]);
  });
});
