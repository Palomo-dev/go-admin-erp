/**
 * «Caja — lo que sale entre turnos», fase 1 (servidor). Migración
 * 20261126070000; lógica en src/lib/pos/cajas/entreTurnos.ts.
 *
 * - Los destinos del efectivo suman lo CONTADO (no lo esperado) y cada tipo
 *   trae sus datos obligatorios (consignación con foto del comprobante).
 * - Cierre ciego: ninguna respuesta de la ruta de cierre lleva esperado,
 *   diferencia ni estado del descuadre a quien no puede verlos, aunque la base
 *   los mandara por error.
 * - Tolerancia y reconteo: dentro, sin novedad; fuera, un reconteo y luego
 *   «por revisar».
 * - Cuenta del dueño según el tipo de organización.
 * - Apertura con diferencia: motivo y estado.
 * - Aprobar un descuadre exige el permiso nuevo, resuelto en el servidor.
 *
 * Organización ficticia 120; sin datos reales.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  codigoErrorTurno,
  cuentaContrapartida,
  decisionDescuadre,
  diferenciaApertura,
  estadoDiferenciaApertura,
  leerCierreTurno,
  motivosPara,
  parametrosCierreTurno,
  porRepartir,
  propuestaConTope,
  todoComoBase,
  validarDestinos,
  type DestinoEfectivo,
} from '@/lib/pos/cajas/entreTurnos';

// ── Ruta de cierre y de descuadre con Supabase y sesión dobladas ─────────────
let rpcRespuesta: { data: unknown; error: { message: string; code?: string } | null } = { data: null, error: null };
const rpcLlamadas: Array<[string, Record<string, unknown>]> = [];
let caja: { id: number; opened_by: string; status: string } | null = { id: 7, opened_by: 'u-cajero', status: 'open' };
let usuario = 'u-cajero';
let permisoExplicar = false;

const supabase = {
  rpc: async (fn: string, args: Record<string, unknown>) => {
    rpcLlamadas.push([fn, args]);
    return rpcRespuesta;
  },
  from: () => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: caja, error: null }),
    };
    return q;
  },
};

jest.mock('@/lib/utils/orgContext', () => {
  class OrgContextError extends Error {
    code = 'X';
    statusCode = 401;
  }
  return {
    OrgContextError,
    getServerOrgContext: async () => ({ organizationId: 120, userId: usuario, roleId: 4, isSuperAdmin: false, supabase }),
  };
});
jest.mock('@/lib/security/organizationBody', () => ({
  ORG_BODY_KEYS: ['organization_id', 'organizationId', 'orgId', 'org_id'],
  readOrgBody: async (_ctx: unknown, req: Request) => req.json(),
}));
jest.mock('@/lib/pos/cajas/permisosCaja', () => ({
  resolverPermisosCaja: async () => ({ cerrarCajasAjenas: false, verEsperadoEnCierreCiego: false, explicarDiferencias: permisoExplicar }),
}));

import { POST as cerrar } from '@/app/api/pos/cajas/[id]/cerrar/route';
import { POST as aprobarDescuadre } from '@/app/api/pos/cajas/[id]/descuadre/route';

const pedir = (fn: typeof cerrar, body: unknown, id = '7') =>
  fn(new Request('http://localhost/api/pos/cajas/7/x', { method: 'POST', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  rpcLlamadas.length = 0;
  rpcRespuesta = { data: null, error: null };
  caja = { id: 7, opened_by: 'u-cajero', status: 'open' };
  usuario = 'u-cajero';
  permisoExplicar = false;
});

describe('destinos del efectivo', () => {
  const contado = 421000;
  const ok: DestinoEfectivo[] = [
    { tipo: 'base', monto: 150000 },
    { tipo: 'consignar', monto: 200000, cuenta_banco_id: 3, soporte_path: '120/0b9e8c1a-1111-4222-8333-944455556666.jpg', referencia: '000981233' },
    { tipo: 'dueno', monto: 71000 },
  ];

  test('suman lo contado: válido; si falta o sobra un peso, no', () => {
    expect(validarDestinos(contado, ok)).toBeNull();
    expect(porRepartir(contado, ok)).toBe(0);
    expect(validarDestinos(contado, ok.slice(0, 2))).toBe('destinos_no_suman');
    expect(porRepartir(contado, ok.slice(0, 2))).toBe(71000);
    expect(validarDestinos(contado + 1, ok)).toBe('destinos_no_suman');
  });

  test('«Dejar todo como base» es un clic y siempre suma lo contado', () => {
    expect(todoComoBase(contado)).toEqual([{ tipo: 'base', monto: contado }]);
    expect(validarDestinos(contado, todoComoBase(contado))).toBeNull();
    expect(validarDestinos(0, todoComoBase(0))).toBeNull();
  });

  test('consignar exige cuenta y foto del comprobante; gasto exige 51/52 y soporte', () => {
    expect(validarDestinos(10, [{ tipo: 'consignar', monto: 10, cuenta_banco_id: 3 }])).toBe('consignacion_sin_soporte');
    expect(validarDestinos(10, [{ tipo: 'consignar', monto: 10, soporte_path: 'x' }])).toBe('consignacion_sin_cuenta');
    expect(validarDestinos(10, [{ tipo: 'gasto', monto: 10, cuenta_gasto: '4135', soporte_path: 'x' }])).toBe('gasto_sin_cuenta');
    expect(validarDestinos(10, [{ tipo: 'gasto', monto: 10, cuenta_gasto: '519595' }])).toBe('gasto_sin_soporte');
    expect(validarDestinos(10, [{ tipo: 'trasladar', monto: 10 }])).toBe('traslado_sin_caja');
    expect(validarDestinos(10, [{ tipo: 'sin_soporte', monto: 10 }])).toBeNull();
  });

  test('un destino distinto de la base no puede ir en cero', () => {
    expect(validarDestinos(10, [{ tipo: 'base', monto: 10 }, { tipo: 'dueno', monto: 0 }])).toBe('destino_sin_monto');
  });

  test('el tope propone consignar el exceso; sin tope todo es base', () => {
    expect(propuestaConTope(421000, 300000)).toEqual({ base: 300000, exceso: 121000 });
    expect(propuestaConTope(200000, 300000)).toEqual({ base: 200000, exceso: 0 });
    expect(propuestaConTope(421000, null)).toEqual({ base: 421000, exceso: 0 });
  });

  test('parámetros de la RPC: sin efectivo en el mapa por método ni montos vacíos', () => {
    const p = parametrosCierreTurno(7, { counted_amount: 421000, destinos: ok, counted_by_method: { cash: 1, card: 50000, nequi: 0 } });
    expect(p.p_contado_por_metodo).toEqual({ card: 50000 });
    expect(p.p_destinos).toHaveLength(3);
    expect(p.p_faltante_cajero).toBe(false);
    expect(p).not.toHaveProperty('p_difference');
  });
});

describe('tolerancia, reconteo y descuadre', () => {
  test('dentro de la tolerancia: sin novedad; fuera: reconteo una vez y luego por revisar', () => {
    expect(decisionDescuadre(800, 1000, false)).toBe('sin_novedad');
    expect(decisionDescuadre(-1000, 1000, false)).toBe('sin_novedad');
    expect(decisionDescuadre(5000, 1000, false)).toBe('reconteo');
    expect(decisionDescuadre(5000, 1000, true)).toBe('por_revisar');
    expect(decisionDescuadre(-5000, 1000, true)).toBe('por_revisar');
  });
});

describe('cierre ciego: el cajero nunca recibe el esperado ni la diferencia', () => {
  const filtrado = {
    estado: 'cerrada',
    session_id: 7,
    final_amount: 654700,
    base_dejada: 100000,
    // La base no los manda con oculto=true; si llegaran por error, la lectura los quita.
    difference: 5000,
    expected_amount: 649700,
    descuadre_estado: 'por_revisar',
    faltante_a_cargo: 'tienda',
    oculto: true,
  };

  test('leerCierreTurno descarta las cifras ocultas', () => {
    const r = leerCierreTurno(filtrado);
    expect(r).toMatchObject({ estado: 'cerrada', diferencia: null, esperado: null, descuadre: null, faltanteACargo: null, oculto: true });
    const rec = leerCierreTurno({ estado: 'reconteo', session_id: 7, difference: -3000, expected_amount: 9, tolerancia: 500, oculto: true });
    expect(rec).toEqual({ estado: 'reconteo', sessionId: 7, diferencia: null, esperado: null, tolerancia: null, oculto: true });
    // Sin la marca, se asume oculto (falla cerrada).
    expect(leerCierreTurno({ estado: 'cerrada', session_id: 7, difference: 1 })).toMatchObject({ diferencia: null, oculto: true });
  });

  test('POST cerrar con destinos: la respuesta de reconteo no trae cifras ni sentido', async () => {
    rpcRespuesta = { data: { estado: 'reconteo', session_id: 7, difference: 5000, expected_amount: 649700, tolerancia: 1000, oculto: true }, error: null };
    const res = await pedir(cerrar, { final_amount: 654700, destinos: [{ tipo: 'base', monto: 654700 }] });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ reconteo: true, sessionId: 7, oculto: true });
    expect(JSON.stringify(json)).not.toMatch(/649700|5000/);
    expect(rpcLlamadas[0][0]).toBe('pos_caja_cerrar_turno');
    expect(rpcLlamadas[0][1]).not.toHaveProperty('p_difference');
  });

  test('POST cerrar con destinos: el cierre ciego responde solo «conteo registrado»', async () => {
    rpcRespuesta = { data: filtrado, error: null };
    const res = await pedir(cerrar, { final_amount: 654700, destinos: [{ tipo: 'base', monto: 654700 }] });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.oculto).toBe(true);
    expect(json.esperado).toBeNull();
    expect(json.session.difference).toBeNull();
    expect(json).not.toHaveProperty('descuadre');
    expect(json).not.toHaveProperty('faltanteACargo');
    expect(JSON.stringify(json)).not.toMatch(/649700|por_revisar/);
  });

  test('sin cierre ciego (o con permiso) sí ve esperado, diferencia y descuadre', async () => {
    rpcRespuesta = { data: { ...filtrado, oculto: false }, error: null };
    const json = await (await pedir(cerrar, { final_amount: 654700, destinos: [{ tipo: 'base', monto: 654700 }] })).json();
    expect(json).toMatchObject({ esperado: 649700, oculto: false, descuadre: 'por_revisar', faltanteACargo: 'tienda' });
    expect(json.session.difference).toBe(5000);
  });

  test('destinos que no suman lo contado: 400 sin llamar a la base', async () => {
    const res = await pedir(cerrar, { final_amount: 100, destinos: [{ tipo: 'base', monto: 90 }] });
    expect(res.status).toBe(400);
    expect((await res.json()).codigo).toBe('destinos_no_suman');
    expect(rpcLlamadas).toHaveLength(0);
  });

  test('sin destinos sigue el cierre de siempre (pos_caja_cerrar)', async () => {
    rpcRespuesta = { data: { ya_cerrada: false, session_id: 7, final_amount: 1, initial_amount: 0, oculto: true }, error: null };
    await pedir(cerrar, { final_amount: 1 });
    expect(rpcLlamadas[0][0]).toBe('pos_caja_cerrar');
  });

  test('un error conocido de la base llega como código traducible', async () => {
    rpcRespuesta = { data: null, error: { message: 'falta_socio', code: '22023' } };
    const res = await pedir(cerrar, { final_amount: 10, destinos: [{ tipo: 'dueno', monto: 10 }] });
    expect(res.status).toBe(400);
    expect((await res.json()).codigo).toBe('falta_socio');
  });
});

describe('cuenta del dueño según el tipo de organización', () => {
  test('persona natural → 3130; sociedad → 2380 (retiro) y 1325 (sin soporte); caja de otra persona → 136525', () => {
    expect(cuentaContrapartida('dueno', 'natural', false)).toBe('3130');
    expect(cuentaContrapartida('sin_soporte', 'natural', false)).toBe('3130');
    expect(cuentaContrapartida('dueno', 'sociedad', false)).toBe('2380');
    expect(cuentaContrapartida('sin_soporte', 'sociedad', false)).toBe('1325');
    expect(cuentaContrapartida('sin_soporte', 'sociedad', true)).toBe('136525');
    expect(cuentaContrapartida('sin_soporte', 'natural', true)).toBe('136525');
  });
});

describe('apertura con diferencia', () => {
  test('diferencia contra la base sugerida; primera apertura sin diferencia', () => {
    expect(diferenciaApertura(39000, 150000)).toBe(-111000);
    expect(diferenciaApertura(150000.3, 150000)).toBeNull();
    expect(diferenciaApertura(150000, null)).toBeNull();
  });

  test('motivos según el sentido; retiro/aporte del dueño explican, el resto queda por explicar', () => {
    expect(motivosPara(-1)).toContain('retiro_dueno');
    expect(motivosPara(-1)).not.toContain('aporte_dueno');
    expect(motivosPara(1)).toContain('aporte_dueno');
    expect(motivosPara(1)).not.toContain('retiro_dueno');
    expect(estadoDiferenciaApertura('retiro_dueno')).toBe('explicada');
    expect(estadoDiferenciaApertura('no_se')).toBe('por_explicar');
    expect(estadoDiferenciaApertura('consignacion')).toBe('por_explicar');
  });

  test('codigoErrorTurno reconoce los códigos de la base', () => {
    expect(codigoErrorTurno('motivo_requerido')).toBe('motivo_requerido');
    expect(codigoErrorTurno('destinos_no_suman')).toBe('destinos_no_suman');
    expect(codigoErrorTurno('otra cosa')).toBeNull();
  });
});

describe('aprobar un descuadre', () => {
  test('sin el permiso nuevo: 403 sin tocar la base', async () => {
    const res = await pedir(aprobarDescuadre, { nota: 'visto' });
    expect(res.status).toBe(403);
    expect(rpcLlamadas).toHaveLength(0);
  });

  test('con el permiso: llama a pos_caja_revisar_descuadre con la nota', async () => {
    permisoExplicar = true;
    rpcRespuesta = { data: { session_id: 7, descuadre_estado: 'aprobado' }, error: null };
    const res = await pedir(aprobarDescuadre, { nota: 'Revisado con la cajera' });
    expect(res.status).toBe(200);
    expect(rpcLlamadas[0]).toEqual(['pos_caja_revisar_descuadre', { p_session_id: 7, p_nota: 'Revisado con la cajera' }]);
  });

  test('sin nota: 400', async () => {
    permisoExplicar = true;
    expect((await pedir(aprobarDescuadre, { nota: '  ' })).status).toBe(400);
  });
});

describe('guardarraíles de la migración', () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '..', 'supabase', 'migrations', '20261126070000_caja_entre_turnos_fase1.sql'),
    'utf8',
  );
  const rollback = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '..', 'supabase', 'rollbacks', '20261126070000_caja_entre_turnos_fase1_rollback.sql'),
    'utf8',
  );

  test('no repite el asiento de sobrante/faltante del cierre (es de 20261126040000)', () => {
    expect(sql).not.toMatch(/create or replace function public\.fn_auto_journal_cash_session/i);
  });

  test('la respuesta del cierre esconde esperado, diferencia y descuadre sin permiso', () => {
    const cierre = sql.slice(sql.indexOf('function public.pos_caja_cerrar_turno'));
    expect(cierre).toMatch(/'difference', case when v_ve then s\.difference end/);
    expect(cierre).toMatch(/'expected_amount', case when v_ve then v_arqueo\.expected_amount end/);
    expect(cierre).toMatch(/'descuadre_estado', case when v_ve then s\.descuadre_estado end/);
    expect(cierre).toMatch(/case when v_ve then jsonb_build_object\('difference'/);
  });

  test('las columnas nuevas solo se escriben desde las RPC', () => {
    expect(sql).toMatch(/create trigger trg_caja_turno_guarda before insert or update on public\.cash_sessions/);
    expect(sql).toMatch(/create trigger trg_caja_turno_guarda before insert or update on public\.cash_movements/);
  });

  test('el núcleo de la consignación no queda expuesto a los usuarios', () => {
    expect(sql).toMatch(/revoke all on function public\.fn_consignacion_caja_banco__aplicar\([^)]*\)\s+from public, anon, authenticated/);
  });

  test('el rollback deshace todo lo nuevo', () => {
    for (const obj of ['pos_caja_cerrar_turno', 'pos_caja_abrir', 'pos_caja_base_sugerida', 'pos_caja_revisar_descuadre', 'fn_caja_turno_guarda', 'cash_session_revisiones', 'destino_cierre', 'base_dejada', 'pos.cajas.explicar_diferencias']) {
      expect(rollback).toContain(obj);
    }
  });
});
