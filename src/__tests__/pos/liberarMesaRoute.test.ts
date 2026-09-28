// ============================================================
// /api/pos/mesas/[id]/liberar — la ruta que libera una mesa resolviendo antes
// su saldo.
//
// Reglas duras 5 y 6: la organización sale de la SESIÓN (nunca de la query ni
// del body) y el permiso de anular se resuelve en el SERVIDOR. Se fija que:
//   - con saldo, «liberar» a secas es 409 y la RPC de liberar no se llama;
//   - anular sin permiso es 403 y no se llama; con permiso exige motivo;
//   - una organización ajena en el body o la query es 403 sin tocar la base;
//   - la RPC recibe la organización y el actor de la sesión.
// ============================================================

const ORG_SESION = 120;
const USUARIO = 'u-1';
const MESA = '11111111-2222-4333-8444-555555555555';

interface LlamadaRpc {
  nombre: string;
  args: Record<string, unknown>;
}

const llamadas: LlamadaRpc[] = [];
const guion = {
  puedeAnular: false,
  resumen: null as unknown,
  errorResumen: null as null | { code: string; message: string },
  errorLiberar: null as null | { code: string; message: string },
};

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
  return {
    OrgContextError,
    getServerOrgContext: async () => ({
      userId: 'u-1',
      organizationId: 120,
      roleId: 5,
      isSuperAdmin: false,
      supabase: {},
    }),
    hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => code === 'pos.void' && guion.puedeAnular),
  };
});

jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => ({
    rpc: async (nombre: string, args: Record<string, unknown>) => {
      llamadas.push({ nombre, args });
      if (nombre === 'pos_mesa_resumen_liberacion') {
        return guion.errorResumen ? { data: null, error: guion.errorResumen } : { data: guion.resumen, error: null };
      }
      if (nombre === 'pos_mesa_liberar') {
        if (guion.errorLiberar) return { data: null, error: guion.errorLiberar };
        return { data: { accion: args.p_accion, resolucion: 'anulada' }, error: null };
      }
      return { data: null, error: { code: 'XX000', message: 'rpc inesperada' } };
    },
  }),
}));

import { GET, POST } from '@/app/api/pos/mesas/[id]/liberar/route';
import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';

function resumen(venta: Record<string, unknown> | null) {
  return {
    mesa: { id: MESA, nombre: 'Mesa 4', zona: null, estado: 'occupied' },
    sesion: { id: 'ses-1', estado: 'active', abierta_en: null, minutos_abierta: 10, comensales: 2, mesero: 'Ana' },
    venta,
    cliente: null,
    cocina: [],
    otras_sesiones_con_saldo: 0,
  };
}

const VENTA_CON_SALDO = {
  sale_id: 'v-1',
  estado: 'pending',
  customer_id: null,
  branch_id: 1,
  total: 30000,
  pagado: 0,
  saldo: 30000,
  division: false,
  facturas: 0,
  factura_saldo: 0,
  factura_con_cliente: false,
};

const params = (id = MESA) => ({ params: Promise.resolve({ id }) });

function post(body: unknown, query = '') {
  return new Request(`http://localhost/api/pos/mesas/${MESA}/liberar${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const liberarLlamada = () => llamadas.find((l) => l.nombre === 'pos_mesa_liberar');

beforeEach(() => {
  llamadas.length = 0;
  guion.puedeAnular = false;
  guion.resumen = resumen(VENTA_CON_SALDO);
  guion.errorResumen = null;
  guion.errorLiberar = null;
  (hasOrgAdminOrPermission as jest.Mock).mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /api/pos/mesas/[id]/liberar', () => {
  test('devuelve resumen y decisión con la organización de la sesión', async () => {
    const res = await GET(new Request(`http://localhost/api/pos/mesas/${MESA}/liberar`), params());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.decision.requiereResolucion).toBe(true);
    expect(json.decision.opciones.anular).toEqual({ disponible: false, motivo: 'sin_permiso' });
    expect(llamadas[0]).toEqual({ nombre: 'pos_mesa_resumen_liberacion', args: { p_organization_id: ORG_SESION, p_table_id: MESA } });
    expect(hasOrgAdminOrPermission).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG_SESION }), 'pos.void');
  });

  test('una organización ajena en la query → 403 sin consultar la base', async () => {
    const res = await GET(new Request(`http://localhost/api/pos/mesas/${MESA}/liberar?organization_id=999`), params());
    expect(res.status).toBe(403);
    expect(llamadas).toHaveLength(0);
  });

  test('id que no es uuid → 400', async () => {
    const res = await GET(new Request('http://localhost/api/pos/mesas/x/liberar'), params('x'));
    expect(res.status).toBe(400);
    expect((await res.json()).codigo).toBe('mesa_invalida');
  });

  test('mesa de otra organización (la RPC no la encuentra) → 404', async () => {
    guion.errorResumen = { code: 'P0002', message: 'mesa_no_encontrada' };
    const res = await GET(new Request(`http://localhost/api/pos/mesas/${MESA}/liberar`), params());
    expect(res.status).toBe(404);
    expect((await res.json()).codigo).toBe('mesa_no_encontrada');
  });
});

describe('POST /api/pos/mesas/[id]/liberar', () => {
  test('liberar con saldo → 409 saldo_pendiente y la mesa NO se libera', async () => {
    const res = await POST(post({ accion: 'liberar' }), params());
    expect(res.status).toBe(409);
    expect((await res.json()).codigo).toBe('saldo_pendiente');
    expect(liberarLlamada()).toBeUndefined();
  });

  test('sin saldo → libera con la organización y el actor de la sesión', async () => {
    guion.resumen = resumen(null);
    const res = await POST(post({ accion: 'liberar' }), params());
    expect(res.status).toBe(200);
    expect(liberarLlamada()?.args).toEqual({
      p_organization_id: ORG_SESION,
      p_table_id: MESA,
      p_actor: USUARIO,
      p_accion: 'liberar',
      p_motivo: null,
      p_puede_anular: false,
    });
  });

  test('anular sin permiso → 403, se registra y no se llama a la base', async () => {
    const res = await POST(post({ accion: 'anular', motivo: 'se fue' }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).codigo).toBe('sin_permiso');
    expect(liberarLlamada()).toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  test('anular con permiso exige motivo', async () => {
    guion.puedeAnular = true;
    const res = await POST(post({ accion: 'anular', motivo: '  ' }), params());
    expect(res.status).toBe(400);
    expect((await res.json()).codigo).toBe('motivo_requerido');
    expect(liberarLlamada()).toBeUndefined();
  });

  test('anular con permiso y motivo → la RPC recibe el permiso resuelto y el motivo recortado', async () => {
    guion.puedeAnular = true;
    const res = await POST(post({ accion: 'anular', motivo: '  el cliente se fue  ' }), params());
    expect(res.status).toBe(200);
    expect(liberarLlamada()?.args).toMatchObject({
      p_organization_id: ORG_SESION,
      p_actor: USUARIO,
      p_accion: 'anular',
      p_motivo: 'el cliente se fue',
      p_puede_anular: true,
    });
  });

  test('cartera sin cliente → 409 sin_cliente', async () => {
    const res = await POST(post({ accion: 'cartera' }), params());
    expect(res.status).toBe(409);
    expect((await res.json()).codigo).toBe('sin_cliente');
    expect(liberarLlamada()).toBeUndefined();
  });

  test('cartera con cliente → llama a la RPC', async () => {
    guion.resumen = resumen({ ...VENTA_CON_SALDO, customer_id: 'c-1' });
    const res = await POST(post({ accion: 'cartera', motivo: 'paga el viernes' }), params());
    expect(res.status).toBe(200);
    expect(liberarLlamada()?.args).toMatchObject({ p_accion: 'cartera', p_motivo: 'paga el viernes' });
  });

  test('una organización ajena en el body → 403 sin tocar la base', async () => {
    const res = await POST(post({ accion: 'liberar', organization_id: 999 }), params());
    expect(res.status).toBe(403);
    expect(llamadas).toHaveLength(0);
  });

  test('la organización de la sesión en el body se tolera (se descarta)', async () => {
    guion.resumen = resumen(null);
    const res = await POST(post({ accion: 'liberar', organization_id: ORG_SESION }), params());
    expect(res.status).toBe(200);
    expect(liberarLlamada()?.args.p_organization_id).toBe(ORG_SESION);
  });

  test('acción desconocida o campos de más → 400', async () => {
    expect((await POST(post({ accion: 'regalar' }), params())).status).toBe(400);
    expect((await POST(post({ accion: 'liberar', p_puede_anular: true }), params())).status).toBe(400);
    expect(liberarLlamada()).toBeUndefined();
  });

  test('si el saldo cambió entre la lectura y la transacción, la base manda (409)', async () => {
    guion.resumen = resumen(null);
    guion.errorLiberar = { code: 'P0001', message: 'saldo_pendiente' };
    const res = await POST(post({ accion: 'liberar' }), params());
    expect(res.status).toBe(409);
    expect((await res.json()).codigo).toBe('saldo_pendiente');
  });

  test('un error interno de la base no filtra su mensaje', async () => {
    guion.resumen = resumen(null);
    guion.errorLiberar = { code: 'XX000', message: 'relation "x" does not exist' };
    const res = await POST(post({ accion: 'liberar' }), params());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'error_interno', codigo: 'error_interno' });
  });
});
