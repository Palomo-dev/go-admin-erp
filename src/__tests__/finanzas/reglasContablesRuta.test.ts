/**
 * @jest-environment node
 *
 * Antes el servicio escribía con `.eq('id', id)` y RLS. Quien pertenecía a dos
 * empresas podía tocar una regla de la que no tenía activa. Estas pruebas fijan
 * que toda escritura lleva la organización de la sesión.
 */
import type { NextRequest } from 'next/server';

type Fila = Record<string, unknown>;

interface Llamada {
  tabla: string;
  operacion: string;
  valores?: Fila;
  filtros: [string, unknown][];
}

const llamadas: Llamada[] = [];
let respuesta: { data: unknown; error: unknown } = { data: { id: 'r1' }, error: null };
let tienePermiso = true;

function consulta(tabla: string) {
  const llamada: Llamada = { tabla, operacion: '', filtros: [] };
  llamadas.push(llamada);
  const cadena = {
    insert(valores: Fila) { llamada.operacion = 'insert'; llamada.valores = valores; return cadena; },
    update(valores: Fila) { llamada.operacion = 'update'; llamada.valores = valores; return cadena; },
    delete() { llamada.operacion = 'delete'; return cadena; },
    select() { return cadena; },
    eq(columna: string, valor: unknown) { llamada.filtros.push([columna, valor]); return cadena; },
    single: async () => respuesta,
    maybeSingle: async () => respuesta,
  };
  return cadena;
}

jest.mock('@/lib/utils/orgContext', () => ({
  hasOrgAdminOrPermission: jest.fn(async () => tienePermiso),
  withOrg: (handler: (ctx: unknown, req: Request, params: unknown) => Promise<Response>) =>
    async (req: Request, params: unknown) => {
      try {
        return await handler({ organizationId: 10, userId: 'u1', supabase: { from: consulta } }, req, params);
      } catch (err) {
        const fallo = err as { statusCode?: number; code?: string };
        return new Response(JSON.stringify({ code: fallo.code }), { status: fallo.statusCode ?? 500 });
      }
    },
}));

import { POST } from '@/app/api/finanzas/reglas-contables/route';
import { DELETE, PATCH } from '@/app/api/finanzas/reglas-contables/[id]/route';
import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';

const ID = '11111111-1111-4111-8111-111111111111';
const params = (id = ID) => ({ params: Promise.resolve({ id }) });
const peticion = (metodo: string, cuerpo?: unknown) => new Request('http://localhost/api/finanzas/reglas-contables', {
  method: metodo,
  headers: { 'content-type': 'application/json' },
  body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
}) as unknown as NextRequest;

const regla = {
  name: 'Venta',
  source_type: 'sale',
  event_type: 'created',
  debit_account_code: '1305',
  credit_account_code: '41359501',
};

beforeEach(() => {
  llamadas.length = 0;
  respuesta = { data: { id: ID }, error: null };
  tienePermiso = true;
});

describe('toda escritura va filtrada por la organización de la sesión', () => {
  test('PATCH filtra por id y organización', async () => {
    const r = await PATCH(peticion('PATCH', { is_active: false }), params());
    expect(r.status).toBe(200);
    expect(llamadas[0].filtros).toEqual([['id', ID], ['organization_id', 10]]);
    expect(llamadas[0].valores).toEqual({ is_active: false });
  });

  test('DELETE filtra por id y organización', async () => {
    const r = await DELETE(peticion('DELETE'), params());
    expect(r.status).toBe(200);
    expect(llamadas[0].operacion).toBe('delete');
    expect(llamadas[0].filtros).toEqual([['id', ID], ['organization_id', 10]]);
  });

  test('POST usa la organización de la sesión', async () => {
    const r = await POST(peticion('POST', regla), params());
    expect(r.status).toBe(201);
    expect(llamadas[0].valores).toMatchObject({ organization_id: 10 });
  });

  test('un cuerpo con otra organización se rechaza con 403 y no toca la base', async () => {
    const r = await PATCH(peticion('PATCH', { is_active: false, organization_id: 20 }), params());
    expect(r.status).toBe(403);
    expect(llamadas).toHaveLength(0);
  });

  test('una regla de otra empresa no aparece: 404', async () => {
    respuesta = { data: null, error: null };
    const r = await PATCH(peticion('PATCH', { name: 'x' }), params());
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ codigo: 'regla_no_encontrada' });
    const d = await DELETE(peticion('DELETE'), params());
    expect(d.status).toBe(404);
  });
});

describe('permisos en el servidor', () => {
  test.each([
    ['POST', () => POST(peticion('POST', regla), params())],
    ['PATCH', () => PATCH(peticion('PATCH', { name: 'x' }), params())],
    ['DELETE', () => DELETE(peticion('DELETE'), params())],
  ])('%s sin finance.create responde 403 y no toca la base', async (_nombre, ejecutar) => {
    tienePermiso = false;
    const r = await ejecutar();
    expect(r.status).toBe(403);
    expect(llamadas).toHaveLength(0);
    expect(hasOrgAdminOrPermission).toHaveBeenCalledWith(expect.anything(), 'finance.create');
  });
});

describe('errores', () => {
  test('una cuenta rechazada por el disparador llega con lado y cuenta', async () => {
    respuesta = {
      data: null,
      error: { code: '22023', message: 'cuenta_de_titulo: la cuenta 1435 no se puede usar en la regla', details: 'lado=debito;cuenta=1435' },
    };
    const r = await PATCH(peticion('PATCH', { debit_account_code: '1435' }), params());
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ codigo: 'cuenta_de_titulo', lado: 'debito', cuenta: '1435' });
  });

  test('un error desconocido no filtra el texto de Postgres', async () => {
    respuesta = { data: null, error: { code: 'XX000', message: 'relation "x" does not exist' } };
    const r = await POST(peticion('POST', regla), params());
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain('relation');
  });

  test('un id que no es uuid responde 404', async () => {
    const r = await PATCH(peticion('PATCH', { name: 'x' }), params('abc'));
    expect(r.status).toBe(404);
    expect(llamadas).toHaveLength(0);
  });

  test('un cuerpo inválido responde 400', async () => {
    const r = await PATCH(peticion('PATCH', { priority: 'alta' }), params());
    expect(r.status).toBe(400);
    expect(llamadas).toHaveLength(0);
  });
});
