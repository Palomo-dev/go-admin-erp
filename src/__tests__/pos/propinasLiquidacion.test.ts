/**
 * Propinas: liquidación en 3 pasos, anulación con motivo y API del servidor
 * (migración 20261120200000, Figma `1087:712124` + paso 1 `2695:190611`).
 *
 * - Caracterización de lo que ya existía y no debe cambiar: el cobro manda
 *   'cash' o 'card' como tipo de propina, y el asiento de la propina sale al
 *   cobrarla (por eso el egreso de la liquidación no se contabiliza de nuevo).
 * - La vista previa del asistente (`liquidacionLogica.ts`) calcula lo mismo
 *   que la base, y el cuerpo que viaja no lleva importes.
 * - El servidor toma la organización de la sesión, valida la forma del cuerpo
 *   y exige motivo para anular.
 */
jest.mock('@/lib/pos/ventas/listadoServidor', () => ({
  rangoDeDias: jest.fn(async (_ctx: unknown, desde: string | null, hasta: string | null) => ({
    desde: desde ? `${desde}T00:00:00.000-05:00` : null,
    hasta: hasta ? `${hasta}T23:59:59.999-05:00` : null,
  })),
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({
  getOrganizationTimezone: jest.fn(async () => 'America/Bogota'),
}));
jest.mock('@/lib/pos/cajas/resumenServidor', () => ({
  resumenesCompactos: jest.fn(async () => ({ 12: { expected_amount: 1284000 } })),
}));
jest.mock('@/lib/utils/orgContext', () => ({
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => code !== 'pos.void'),
}));

import * as fs from 'fs';
import * as path from 'path';
import {
  armarDatosLiquidacion,
  calcularReparto,
  liquidable,
  numeroEgreso,
  participacionesIguales,
  porcentajeConPropina,
  problemasPago,
  problemasReparto,
  resumirSeleccion,
  sumaParticipaciones,
} from '@/lib/pos/propinas/liquidacionLogica';
import { CODIGOS_ERROR_PROPINA, codigoErrorPropina, estadoHttpDe } from '@/lib/pos/propinas/errores';
import {
  anularPropina,
  cajaAbiertaPropinas,
  crearLiquidacion,
  filtrosPropinas,
  pagarLiquidacion,
  validarDatosPago,
  listarPropinas,
  resolverPermisosPropinas,
  validarDatosLiquidacion,
} from '@/lib/pos/propinas/propinasServidor';
import type { FilaPropina } from '@/lib/pos/propinas/tiposPropinas';

const raiz = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), 'utf8');
const MIGRACION = leer('supabase/migrations/20261120200000_pos_propinas_liquidaciones.sql');
const ROLLBACK = leer('supabase/rollbacks/20261120200000_pos_propinas_liquidaciones_rollback.sql');

const U1 = '9e8603cc-605c-4ee1-bc55-c56da8469a74';
const U2 = '0e0dfd4e-e91e-4cab-81d9-e983e07e5bcf';
const S1 = '6b1f3c2e-1d2a-4f5b-8c9d-0e1f2a3b4c5d';

function fila(p: Partial<FilaPropina> & { id: string }): FilaPropina {
  return {
    fecha: '2026-11-20T15:00:00Z',
    monto: 1000,
    tipo: 'cash',
    estado: 'por_liquidar',
    sucursal_id: 7,
    notas: null,
    anulada_en: null,
    motivo_anulacion: null,
    liquidada_en: null,
    liquidacion: null,
    persona: { id: U1, nombre: 'Laura', cargo: 'Mesera' },
    venta: { id: 'v1', numero: 'FACT-1', tipo_numero: 'factura', origen: 'mesa', mesa: 'Mesa 4', mesa_id: 'm4', abierta: false },
    ...p,
  };
}

describe('Caracterización: lo que ya hacía el sistema', () => {
  it('el cobro guarda la propina como cash si el primer pago es efectivo y como card en cualquier otro caso', () => {
    const cobro = leer('supabase/migrations/20260922120000_pos_checkout_v1_tip_type_no_efectivo.sql');
    expect(cobro).toMatch(/when coalesce\(v_tip_method, 'cash'\) = 'cash' then 'cash' else 'card'/);
  });

  it('el asiento de la propina sale al cobrarla (origen tip): por eso el egreso de la liquidación se omite', () => {
    expect(MIGRACION).toMatch(/if v_clave in \('cambioEfectivo', 'consignacionBanco', 'liquidacionPropinas'\) then\s+accion := 'omitir'/);
    expect(ROLLBACK).toMatch(/if v_clave in \('cambioEfectivo', 'consignacionBanco'\) then/);
  });

  it('la vieja fn_propinas_liquidar queda documentada como heredada (marca sin caja ni documento)', () => {
    expect(MIGRACION).toMatch(/comment on function public\.fn_propinas_liquidar\(integer, uuid\[\]\) is\s+'Heredada/);
  });
});

describe('Paso 1: qué se liquida', () => {
  const filas = [
    fila({ id: 'a', monto: 14220, tipo: 'cash' }),
    fila({ id: 'b', monto: 18000, tipo: 'card' }),
    fila({ id: 'c', monto: 6980, tipo: 'online', persona: { id: U2, nombre: 'Andrés', cargo: null } }),
    fila({ id: 'd', monto: 5000, venta: { id: 'v9', numero: 'FACT-9', tipo_numero: 'factura', origen: 'mesa', mesa: 'Mesa 2', mesa_id: null, abierta: true } }),
  ];

  it('separa el efectivo (sale de la caja) de lo que entró al banco y bloquea la venta abierta', () => {
    const r = resumirSeleccion(filas, new Set(['a', 'b', 'c', 'd']));
    expect(r).toMatchObject({ cantidad: 3, total: 39200, efectivo: 14220, banco: 24980, personas: 2 });
    expect(r.bloqueadas.map((x) => x.id)).toEqual(['d']);
    expect(liquidable(filas[3])).toBe(false);
  });
});

describe('Paso 2: cómo se reparte (mismas reglas que la base)', () => {
  const filas = [fila({ id: 'a', monto: 10000 }), fila({ id: 'b', monto: 5000, tipo: 'card', persona: { id: U2, nombre: 'Andrés', cargo: null } })];

  it('«a quien atendió»: cada quien su base y su participación', () => {
    const l = calcularReparto(filas, 'atendio');
    expect(l.map((x) => [x.persona.id, x.base, x.calculado, Math.round(x.pct)])).toEqual([
      [U1, 10000, 10000, 67],
      [U2, 5000, 5000, 33],
    ]);
  });

  it('«pozo por porcentaje»: el redondeo va a la mayor participación y el total cuadra', () => {
    const l = calcularReparto(filas, 'porcentaje', { [U1]: 33.33, [U2]: 66.67 });
    // Lo mismo que devolvió fn_propinas_liquidacion_crear en la prueba en seco.
    expect(l.find((x) => x.persona.id === U2)?.calculado).toBe(10000.5);
    expect(l.find((x) => x.persona.id === U1)?.calculado).toBe(4999.5);
    expect(l.reduce((a, x) => a + x.calculado, 0)).toBe(15000);
  });

  it('participaciones iguales suman exactamente 100', () => {
    const p = participacionesIguales(['a', 'b', 'c']);
    expect(sumaParticipaciones(p)).toBe(100);
  });

  it('ajustes: deben sumar cero, llevar motivo y no dejar a nadie en negativo', () => {
    const conAjuste = calcularReparto(filas, 'atendio', {}, [], { [U1]: -580, [U2]: 580 });
    expect(conAjuste.map((x) => x.monto)).toEqual([9420, 5580]);
    expect(problemasReparto(conAjuste, 'atendio', {}, '')).toEqual(['motivoAjuste']);
    expect(problemasReparto(conAjuste, 'atendio', {}, 'Dejó el cambio')).toEqual([]);
    const descuadre = calcularReparto(filas, 'atendio', {}, [], { [U1]: -500 });
    expect(problemasReparto(descuadre, 'atendio', {}, 'x motivo')).toContain('ajustesNoSumanCero');
    const negativo = calcularReparto(filas, 'atendio', {}, [], { [U1]: 6000, [U2]: -6000 });
    expect(problemasReparto(negativo, 'atendio', {}, 'motivo')).toContain('ajusteNegativo');
  });
});

describe('Paso 3: cómo se paga', () => {
  const lineas = calcularReparto([fila({ id: 'a', monto: 1000 })], 'atendio');

  it('efectivo exige caja abierta; transferencia, referencia por persona; nómina no está disponible', () => {
    expect(problemasPago('efectivo', lineas, { cajaAbierta: false, referencias: {}, motivo: '' })).toEqual(['sinCaja']);
    expect(problemasPago('efectivo', lineas, { cajaAbierta: true, referencias: {}, motivo: '' })).toEqual([]);
    expect(problemasPago('transferencia', lineas, { cajaAbierta: false, referencias: {}, motivo: '' })).toEqual(['referencias']);
    expect(problemasPago('transferencia', lineas, { cajaAbierta: false, referencias: { [U1]: 'R-1' }, motivo: '' })).toEqual([]);
    expect(problemasPago('nomina', lineas, { cajaAbierta: true, referencias: {}, motivo: '' })).toEqual(['medioNoDisponible']);
  });

  it('el cuerpo solo lleva ids, porcentajes, ajustes y textos: ningún importe a pagar', () => {
    const datos = armarDatosLiquidacion({
      solicitud: S1,
      sucursalId: 7,
      propinas: ['a'],
      reparto: 'atendio',
      participaciones: {},
      lineas,
      motivoAjuste: '',
      medio: 'efectivo',
      referencias: {},
      motivo: '',
      desde: '2026-11-20',
      hasta: '2026-11-20',
    });
    expect(datos).toEqual({
      solicitud: S1,
      sucursal_id: 7,
      propinas: ['a'],
      reparto: 'atendio',
      participaciones: undefined,
      ajustes: undefined,
      motivo_ajuste: null,
      medio: 'efectivo',
      referencias: undefined,
      motivo: null,
      desde: '2026-11-20',
      hasta: '2026-11-20',
    });
    expect(JSON.stringify(datos)).not.toMatch(/total|monto"/);
  });

  it('números visibles', () => {
    expect(numeroEgreso(318)).toBe('EGR-000318');
    expect(numeroEgreso(null)).toBeNull();
    expect(porcentajeConPropina({ total: 50, con_propina: 17 })).toBe(34);
    expect(porcentajeConPropina({ total: 0, con_propina: 0 })).toBeNull();
  });
});

describe('Errores', () => {
  it('los códigos de la base llegan a la pantalla y tienen su estado HTTP', () => {
    expect(codigoErrorPropina({ code: '22023', message: 'VENTA_ABIERTA: 1 propinas son de ventas sin cobrar' })).toBe('VENTA_ABIERTA');
    expect(codigoErrorPropina({ code: '55000', message: 'CAJA_CERRADA: abra la caja' })).toBe('CAJA_CERRADA');
    expect(codigoErrorPropina({ code: '42501', message: 'SESION_REQUERIDA' })).toBe('SIN_PERMISO');
    expect(codigoErrorPropina({ codigo: 'AJUSTES_NO_SUMAN_CERO' })).toBe('AJUSTES_NO_SUMAN_CERO');
    expect(estadoHttpDe('SIN_PERMISO')).toBe(403);
    expect(estadoHttpDe('CAJA_CERRADA')).toBe(409);
    expect(estadoHttpDe('MOTIVO_REQUERIDO')).toBe(400);
  });

  it('cada código que levanta la migración está en la lista de la pantalla', () => {
    const levantados = new Set([...MIGRACION.matchAll(/raise exception '([A-Z_]+)[:']/g)].map((m) => m[1]));
    levantados.delete('SESION_REQUERIDA');
    levantados.delete('SUCURSAL_INVALIDA');
    levantados.delete('FILTROS_INVALIDOS');
    // Guardas de la tabla que solo ve quien programa (un camino que se salta las funciones).
    for (const g of ['PROPINA_ESTADO_INICIAL', 'PROPINA_ORGANIZACION_INMUTABLE', 'PROPINA_DISTRIBUIR_POR_FUNCION', 'PROPINA_ANULAR_POR_FUNCION'])
      levantados.delete(g);
    for (const c of levantados) expect(CODIGOS_ERROR_PROPINA).toContain(c);
  });
});

describe('Servidor: organización de la sesión, forma del cuerpo y motivo', () => {
  function ctx(respuesta: { data: unknown; error: unknown } = { data: { total: 0, filas: [] }, error: null }) {
    const rpc = jest.fn(async () => respuesta);
    const maybeSingle = jest.fn(async () => ({ data: { id: 12, opened_at: '2026-11-20T13:00:00Z', opened_by: U1 }, error: null }));
    const consulta: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) consulta[m] = () => consulta;
    consulta.maybeSingle = maybeSingle;
    return {
      organizationId: 120,
      userId: U1,
      roleId: 3,
      isSuperAdmin: false,
      supabase: { rpc, from: jest.fn(() => consulta) } as never,
      rpc,
    };
  }

  it('los filtros pasan por lista blanca', () => {
    expect(filtrosPropinas({ vista: 'borrar', tipo: 'bitcoin', persona: 'x', desde: '20-11-2026', tamano: '9999', pagina: '-3' })).toMatchObject({
      vista: 'por_liquidar',
      tipo: null,
      persona: null,
      desde: null,
      tamano: 500,
      pagina: 1,
    });
  });

  it('el listado manda la organización de la sesión y el día de la organización', async () => {
    const c = ctx();
    await listarPropinas(c, { vista: 'anuladas', desde: '2026-11-20', hasta: '2026-11-20', sucursal: '7', organization_id: '999' });
    expect(c.rpc).toHaveBeenCalledWith(
      'fn_propinas_listado',
      expect.objectContaining({
        p_organization_id: 120,
        p_branch_id: 7,
        p_vista: 'anuladas',
        p_desde: '2026-11-20T00:00:00.000-05:00',
        p_hasta: '2026-11-20T23:59:59.999-05:00',
      }),
    );
  });

  it('crear: la organización es la de la sesión aunque el cuerpo diga otra; el cuerpo viaja sin la sucursal', async () => {
    const c = ctx({ data: { id: S1, codigo: 'LIQ-000001', total: 1000, ya_registrada: false }, error: null });
    const datos = validarDatosLiquidacion({ solicitud: S1, sucursal_id: 7, propinas: [U2], reparto: 'atendio', medio: 'efectivo', organization_id: 999 });
    await crearLiquidacion(c, datos);
    const [nombre, args] = c.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(nombre).toBe('fn_propinas_liquidacion_crear');
    expect(args.p_organization_id).toBe(120);
    expect(args.p_branch_id).toBe(7);
    expect(JSON.stringify(args.p_datos)).not.toMatch(/organization_id|sucursal_id/);
  });

  it('crear: rechaza un cuerpo mal formado antes de llamar a la base', () => {
    expect(() => validarDatosLiquidacion({ sucursal_id: 7, propinas: [U2], reparto: 'atendio', medio: 'efectivo' })).toThrow('SOLICITUD_REQUERIDA');
    expect(() => validarDatosLiquidacion({ solicitud: S1, sucursal_id: 7, propinas: ['no-uuid'], reparto: 'atendio', medio: 'efectivo' })).toThrow('SIN_PROPINAS');
    expect(() => validarDatosLiquidacion({ solicitud: S1, sucursal_id: 7, propinas: [U2], reparto: 'dados', medio: 'efectivo' })).toThrow('REPARTO_INVALIDO');
    expect(() => validarDatosLiquidacion({ solicitud: S1, sucursal_id: 7, propinas: [U2], reparto: 'atendio', medio: 'cripto' })).toThrow('MEDIO_INVALIDO');
  });

  it('anular una propina exige motivo antes de llegar a la base', async () => {
    const c = ctx({ data: { asientos_revertidos: 1 }, error: null });
    await expect(anularPropina(c, S1, ' ')).rejects.toMatchObject({ codigo: 'MOTIVO_REQUERIDO' });
    expect(c.rpc).not.toHaveBeenCalled();
    await expect(anularPropina(c, S1, 'Se registró dos veces')).resolves.toEqual({ asientosRevertidos: 1, yaAnulada: false });
    expect(c.rpc).toHaveBeenCalledWith('fn_propina_anular', { p_tip_id: S1, p_motivo: 'Se registró dos veces' });
  });

  it('los permisos salen de los códigos (no del rol)', async () => {
    await expect(resolverPermisosPropinas(ctx())).resolves.toEqual({ ver: true, registrar: true, anular: false, liquidar: true, anularLiquidacion: false });
  });

  it('la caja abierta usa la regla del cobro con el usuario de la sesión', async () => {
    const c = ctx();
    c.rpc.mockImplementation((async (nombre: string) =>
      nombre === 'fn_caja_abierta_para' ? { data: 12, error: null } : { data: { nombre: 'Laura' }, error: null }) as never);
    await expect(cajaAbiertaPropinas(c, 7)).resolves.toEqual({ id: 12, abierta_en: '2026-11-20T13:00:00Z', abierta_por: 'Laura', esperado: 1284000 });
    expect(c.rpc).toHaveBeenCalledWith('fn_caja_abierta_para', { p_org: 120, p_branch: 7, p_user: U1 });
  });
});

describe('Contrato de la migración', () => {
  it('la liquidación usa el mecanismo de Cajas, exige permiso y bloquea las propinas', () => {
    expect(MIGRACION).toMatch(/fn_tiene_permiso\(p_organization_id, 'pos\.propinas\.liquidar'\)/);
    expect(MIGRACION).toMatch(/v_mov := public\.pos_caja_registrar_movimiento\(/);
    expect(MIGRACION).toMatch(/p_concept_code := 'liquidacionPropinas'/);
    expect(MIGRACION).toMatch(/for update;/);
    expect(MIGRACION).toMatch(/VENTA_ABIERTA/);
    expect(MIGRACION).toMatch(/unique \(organization_id, request_id\)/);
  });

  it('anular (propina o liquidación) exige motivo; la liquidación además pos.void', () => {
    expect(MIGRACION).toMatch(/MOTIVO_REQUERIDO: anular una propina exige un motivo/);
    expect(MIGRACION).toMatch(/MOTIVO_REQUERIDO: anular una liquidación exige un motivo/);
    expect(MIGRACION).toMatch(/fn_tiene_permiso\(v_s\.organization_id, 'pos\.void'\)/);
  });

  it('las tablas solo se leen por pertenencia y nadie las escribe desde el cliente', () => {
    expect(MIGRACION).toMatch(/revoke insert, update, delete, truncate on public\.tip_settlements from authenticated/);
    expect(MIGRACION).toMatch(/revoke insert, update, delete, truncate on public\.tip_settlement_lines from authenticated/);
    expect(MIGRACION).not.toMatch(/grant [^;]* to anon/);
  });

  it('toda función nueva con elevación lleva su revoke a anon', () => {
    const nuevas = [...MIGRACION.matchAll(/create or replace function public\.(fn_propinas_[a-z_]+)\(/g)].map((m) => m[1]);
    expect(nuevas.length).toBeGreaterThanOrEqual(8);
    for (const f of nuevas) expect(MIGRACION).toMatch(new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from anon, public`));
  });

  it('el rollback deshace tablas y funciones', () => {
    expect(ROLLBACK).toMatch(/drop table if exists public\.tip_settlements;/);
    expect(ROLLBACK).toMatch(/drop function if exists public\.fn_propinas_liquidacion_crear/);
  });
});

describe('Rutas', () => {
  const rutas = [
    'src/app/api/pos/propinas/route.ts',
    'src/app/api/pos/propinas/cifras/route.ts',
    'src/app/api/pos/propinas/permisos/route.ts',
    'src/app/api/pos/propinas/caja/route.ts',
    'src/app/api/pos/propinas/[id]/anular/route.ts',
    'src/app/api/pos/propinas/liquidaciones/route.ts',
    'src/app/api/pos/propinas/liquidaciones/[id]/route.ts',
    'src/app/api/pos/propinas/liquidaciones/[id]/anular/route.ts',
  ];

  it('todas pasan por withOrg y las de escritura leen el cuerpo con readOrgBody', () => {
    for (const r of rutas) {
      const fuente = leer(r);
      expect(fuente).toMatch(/withOrg\(/);
      if (/export const POST/.test(fuente)) expect(fuente).toMatch(/readOrgBody/);
    }
  });

  it('la pantalla no escribe tips ni liquidaciones con el cliente del navegador', () => {
    for (const f of ['PropinasContent.tsx', 'LiquidarDialog.tsx', 'LiquidacionDetalle.tsx']) {
      const fuente = leer(`src/components/pos/propinas/${f}`);
      expect(fuente).not.toMatch(/from\('tips'\)|tip_settlements|supabase\.rpc/);
      expect(fuente).not.toMatch(/\balert\(|\bconfirm\(|\bprompt\(/);
      expect(fuente).not.toMatch(/toISOString\(\)\.split/);
    }
  });
});

describe('Textos en 4 idiomas', () => {
  const claves = (o: unknown, pre = ''): string[] =>
    o && typeof o === 'object' ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => claves(v, pre ? `${pre}.${k}` : k)) : [pre];

  it('posPropinas tiene las mismas claves en es, en, fr y pt', () => {
    const es = claves(JSON.parse(leer('messages/es.json')).posPropinas).sort();
    for (const l of ['en', 'fr', 'pt']) {
      expect(claves(JSON.parse(leer(`messages/${l}.json`)).posPropinas).sort()).toEqual(es);
    }
  });

  it('cada clave fija que usa la pantalla existe en español', () => {
    const es = new Set(claves(JSON.parse(leer('messages/es.json')).posPropinas));
    const fuentes = ['PropinasContent.tsx', 'LiquidarDialog.tsx', 'LiquidacionDetalle.tsx', 'PropinaFormDialog.tsx'].map((f) => leer(`src/components/pos/propinas/${f}`));
    const usadas = new Set(fuentes.flatMap((s) => [...s.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)].map((m) => m[1])));
    const faltan = [...usadas].filter((k) => !es.has(k));
    expect(faltan).toEqual([]);
  });
});

describe('Por pagar: 28150501 → 28150502 → caja o bancos (Contador, 2026-11-20)', () => {
  const POR_PAGAR = leer('supabase/migrations/20261121030426_pos_propinas_por_pagar_28150502.sql');
  const POR_PAGAR_ROLLBACK = leer('supabase/rollbacks/20261121030426_pos_propinas_por_pagar_28150502_rollback.sql');

  it('liquidar acredita 28150502 y pagar la debita, un asiento por trabajador', () => {
    expect(POR_PAGAR).toMatch(/array\['28150501'\]\);\s+v_contra := public\.fn_primera_cuenta_detalle\(p_organization_id, array\['28150502'\]\)/);
    expect(POR_PAGAR).toMatch(/'tip_settlement:' \|\| v_id::text \|\| ':' \|\| v_rec\.person_id::text/);
    expect(POR_PAGAR).toMatch(/'tip_settlement_pago:' \|\| v_s\.id::text \|\| ':' \|\| v_rec\.person_id::text/);
  });

  it('«pagar después» deja la liquidación por pagar; anular no toca una pagada por nómina', () => {
    expect(POR_PAGAR).toMatch(/update public\.tip_settlements set status = 'por_pagar' where id = v_id/);
    expect(POR_PAGAR).toMatch(/PAGADA_POR_NOMINA/);
    expect(POR_PAGAR_ROLLBACK).toMatch(/Hay liquidaciones por pagar o movimientos en 28150502/);
  });

  it('los códigos nuevos tienen traducción en los 4 idiomas', () => {
    for (const idioma of ['es', 'en', 'fr', 'pt']) {
      const m = JSON.parse(leer(`messages/${idioma}.json`)) as { posPropinas: { errores: Record<string, string>; liquidaciones: { estados: Record<string, string> } } };
      for (const c of ['LIQUIDACION_ANULADA', 'PAGADA_POR_NOMINA', 'SIN_CUENTA']) expect(m.posPropinas.errores[c]).toBeTruthy();
      expect(m.posPropinas.liquidaciones.estados.por_pagar).toBeTruthy();
    }
  });

  it('pagar valida el cuerpo y manda solo la liquidación y los datos del pago', async () => {
    expect(() => validarDatosPago({ medio: 'efectivo' })).toThrow('SOLICITUD_REQUERIDA');
    expect(() => validarDatosPago({ solicitud: S1, medio: 'nomina' })).toThrow('MEDIO_INVALIDO');
    expect(() => validarDatosPago({ solicitud: S1, medio: 'efectivo', personas: ['x'] })).toThrow('PERSONA_INVALIDA');
    const rpc = jest.fn(async () => ({ data: { id: S1, codigo: 'LIQ-000001', ya_pagada: false, estado: 'pagada' }, error: null }));
    const c = { organizationId: 120, userId: U1, roleId: 3, isSuperAdmin: false, supabase: { rpc } as never };
    const datos = validarDatosPago({ solicitud: S1, medio: 'transferencia', referencias: [{ persona: U2, referencia: 'REF-1' }], organization_id: 999 });
    await expect(pagarLiquidacion(c, S1, datos)).resolves.toMatchObject({ estado: 'pagada' });
    expect(rpc).toHaveBeenCalledWith('fn_propinas_liquidacion_pagar', {
      p_settlement_id: S1,
      p_datos: { solicitud: S1, medio: 'transferencia', personas: undefined, referencias: [{ persona: U2, referencia: 'REF-1' }] },
    });
  });
});
