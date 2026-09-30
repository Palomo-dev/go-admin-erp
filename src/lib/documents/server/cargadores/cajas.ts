/**
 * Reportes de caja: cierre (`cash_sessions`) y arqueo (`cash_counts`).
 *
 * - El esperado NO se calcula aquí: sale de `pos_caja_esperado` (la misma
 *   función que usa el cierre en el servidor), con el cliente de la sesión.
 * - Quién puede verlo: quien abrió la caja (o contó el arqueo), un
 *   administrador (`admin.full_access` por rol o cargo), quien tenga
 *   `pos.cajas.ver_esperado` o quien tenga
 *   `finance.view`. Resuelto en el servidor; nunca por el nombre del rol.
 * - Cierre ciego (`pos_blind_cash_count`): si la organización lo usa y quien
 *   pide el reporte no tiene `pos.cajas.ver_esperado` (ni administración), el esperado y la diferencia salen
 *   como «***» — igual que en la pantalla (`useBlindCloseMode`).
 */

import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { organizacionUsaCierreCiego, resolverPermisosCaja } from '@/lib/pos/cajas/permisosCaja';
import { OrgContextError } from '@/lib/utils/orgContextError';
import type { Traductor } from '../../textos';
import type { CeldaTabla, Campo, DocumentoPayload, FilaTotal, SeccionTabla } from '../../tipos';
import {
  cargarBase,
  cargarNombresMetodos,
  exigirEntero,
  fallaLectura,
  nombreArchivoBase,
  nombresDePerfiles,
  noEncontrado,
  num,
  numONull,
  rotuloMetodo,
  textoLegal,
  texto,
  type OpcionesCarga,
  type SesionDocumento,
} from '../base';

interface FilaSesionCaja {
  id: number;
  organization_id: number;
  branch_id: number | null;
  opened_by: string;
  opened_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  initial_amount: number | string | null;
  final_amount: number | string | null;
  difference: number | string | null;
  status: string;
  notes: string | null;
}

interface Esperado {
  efectivo_esperado?: number | string;
  por_metodo?: Record<string, number | string>;
  detalle?: Record<string, number | string>;
}

export interface AccesoCaja {
  permitido: boolean;
  verEsperado: boolean;
}

/**
 * ¿Puede ver el reporte? ¿Puede ver el esperado aunque haya cierre ciego?
 *
 * Mismas reglas que las pantallas y las rutas de cajas (`src/lib/pos/cajas/
 * permisosCaja.ts`, sin duplicarlas): el esperado y la diferencia con cierre
 * ciego los ve quien tenga `pos.cajas.ver_esperado` (o administración), y si
 * no se puede leer si la organización usa cierre ciego, se oculta (fail-closed).
 */
export async function accesoACaja(sesion: SesionDocumento, responsables: Array<string | null>): Promise<AccesoCaja> {
  const [admin, permisos, ciego] = await Promise.all([
    hasOrgAdminOrPermission(sesion),
    resolverPermisosCaja(sesion),
    organizacionUsaCierreCiego(sesion),
  ]);
  const propio = responsables.some((r) => r && r === sesion.userId);
  const supervisa = admin || permisos.verEsperadoEnCierreCiego;
  const finanzas = supervisa || propio ? false : await hasOrgAdminOrPermission(sesion, 'finance.view');
  return { permitido: supervisa || propio || finanzas, verEsperado: permisos.verEsperadoEnCierreCiego || !ciego };
}

function sinPermiso(): OrgContextError {
  return new OrgContextError('Sin permiso para ver este reporte de caja', 403, 'PERMISSION_REQUIRED');
}

const nombres = nombresDePerfiles;

async function leerSesion(sesion: SesionDocumento, id: number): Promise<FilaSesionCaja> {
  const { data, error } = await sesion.supabase
    .from('cash_sessions')
    .select('id, organization_id, branch_id, opened_by, opened_at, closed_at, closed_by, initial_amount, final_amount, difference, status, notes')
    .eq('id', id)
    .eq('organization_id', sesion.organizationId)
    .maybeSingle();
  if (error) fallaLectura('cash_sessions', error);
  const s = data as FilaSesionCaja | null;
  if (!s || s.organization_id !== sesion.organizationId) throw noEncontrado();
  return s;
}

async function esperadoDe(sesion: SesionDocumento, id: number): Promise<Esperado> {
  const { data, error } = await sesion.supabase.rpc('pos_caja_esperado', { p_session_id: id });
  if (error) fallaLectura('pos_caja_esperado', error);
  return (data ?? {}) as Esperado;
}

const oculto = { oculto: true } as const;

export async function cargarCierreCaja(
  sesion: SesionDocumento,
  idCrudo: string,
  opciones: OpcionesCarga,
  t: Traductor,
): Promise<DocumentoPayload> {
  const id = exigirEntero(idCrudo);
  const caja = await leerSesion(sesion, id);
  const acceso = await accesoACaja(sesion, [caja.opened_by, caja.closed_by]);
  if (!acceso.permitido) throw sinPermiso();

  const [base, moneda, esperado, movimientosRes, arqueosRes, gente] = await Promise.all([
    cargarBase(sesion, caja.branch_id),
    resolverContextoMoneda(sesion.supabase, sesion.organizationId),
    esperadoDe(sesion, id),
    sesion.supabase.from('cash_movements').select('type, concept, amount, notes, created_at').eq('organization_id', sesion.organizationId).eq('cash_session_id', id).order('created_at', { ascending: true }),
    sesion.supabase.from('cash_counts').select('count_type, counted_amount, expected_amount, difference, created_at').eq('organization_id', sesion.organizationId).eq('cash_session_id', id).order('created_at', { ascending: true }),
    nombres(sesion, [caja.opened_by, caja.closed_by]),
  ]);
  if (movimientosRes.error) fallaLectura('cash_movements', movimientosRes.error);

  const d = esperado.detalle ?? {};
  const ver = acceso.verEsperado;
  const esperadoEfectivo = num(esperado.efectivo_esperado);
  const cerrada = caja.status === 'closed';

  const resumen: Campo[] = [
    { clave: 'montoInicial', valor: { tipo: 'dinero', v: num(caja.initial_amount) } },
    { clave: 'efectivoEsperado', valor: ver ? { tipo: 'dinero', v: esperadoEfectivo } : { tipo: 'oculto' } },
  ];
  if (cerrada) {
    resumen.push({ clave: 'efectivoContado', valor: { tipo: 'dinero', v: numONull(caja.final_amount) } });
    resumen.push({ clave: 'diferencia', valor: ver ? { tipo: 'dinero', v: numONull(caja.difference) } : { tipo: 'oculto' } });
  }

  const conceptos: Array<[string, unknown, boolean]> = [
    ['inicial', d.inicial, false],
    ['ventasEfectivo', d.ventas_efectivo, false],
    ['abonosEfectivo', d.abonos_efectivo, false],
    ['entradas', d.entradas, false],
    ['salidas', d.salidas, true],
    ['comprasEfectivo', d.compras_efectivo, true],
    ['devoluciones', d.devoluciones, true],
  ];
  const totales: FilaTotal[] = conceptos
    .filter(([clave, valor]) => clave === 'inicial' || num(valor) !== 0)
    .map(([clave, valor, resta]) => ({ clave: `caja.${clave}`, valor: num(valor), resta, oculto: !ver && clave !== 'inicial' }));
  totales.push({ clave: 'caja.esperado', valor: esperadoEfectivo, estilo: 'total', oculto: !ver });
  if (cerrada) {
    totales.push({ clave: 'caja.contado', valor: num(caja.final_amount) });
    totales.push({ clave: 'caja.diferencia', valor: num(caja.difference), estilo: num(caja.difference) < 0 ? 'saldo' : 'pagado', oculto: !ver });
  }

  const nombresMetodos = await cargarNombresMetodos(sesion, Object.keys(esperado.por_metodo ?? {}));
  const porMetodo = Object.entries(esperado.por_metodo ?? {}).map(([metodo, valor]) => [rotuloMetodo(metodo, t, nombresMetodos), ver ? num(valor) : oculto] as CeldaTabla[]);
  const movimientos = ((movimientosRes.data ?? []) as Array<{ type: string; concept: string; amount: number; notes: string | null; created_at: string }>).map(
    (m) => [m.created_at, m.type === 'out' ? 'caja.tipoSalida' : 'caja.tipoEntrada', texto(m.concept), texto(m.notes), m.type === 'out' ? -num(m.amount) : num(m.amount)] as CeldaTabla[],
  );
  const arqueos = ((arqueosRes.data ?? []) as Array<{ count_type: string; counted_amount: number; expected_amount: number | null; difference: number | null; created_at: string }>).map(
    (a) => [a.created_at, `caja.arqueo.${a.count_type}`, num(a.counted_amount), ver ? numONull(a.expected_amount) : oculto, ver ? numONull(a.difference) : oculto] as CeldaTabla[],
  );

  const secciones: SeccionTabla[] = [
    { titulo: 'porMetodo', columnas: [{ clave: 'metodo', tipo: 'texto' }, { clave: 'esperado', tipo: 'dinero' }], filas: porMetodo },
    {
      titulo: 'movimientosCaja',
      columnas: [
        { clave: 'fecha', tipo: 'instanteHora' },
        { clave: 'tipo', tipo: 'clave' },
        { clave: 'concepto', tipo: 'texto' },
        { clave: 'notas', tipo: 'texto' },
        { clave: 'valor', tipo: 'dinero' },
      ],
      filas: movimientos,
    },
    {
      titulo: 'arqueos',
      columnas: [
        { clave: 'fecha', tipo: 'instanteHora' },
        { clave: 'tipo', tipo: 'clave' },
        { clave: 'contado', tipo: 'dinero' },
        { clave: 'esperado', tipo: 'dinero' },
        { clave: 'diferencia', tipo: 'dinero' },
      ],
      filas: arqueos,
    },
  ];

  const numero = `#${caja.id}`;
  return {
    tipo: 'cierre-caja',
    tituloClave: cerrada ? 'cierre-caja' : 'reporte-caja-abierta',
    idioma: opciones.idioma,
    numero,
    estado: { codigo: cerrada ? 'caja.cerrada' : 'caja.abierta', tono: cerrada ? 'neutro' : 'aviso' },
    marcaAgua: null,
    bandas: ver ? [] : [{ clave: 'cierreCiego', tono: 'info' }],
    emisor: base.emisor,
    sucursal: base.sucursal,
    contraparte: null,
    referencia: [],
    metadatos: [
      { clave: 'cajero', valor: { tipo: 'texto', v: gente.get(caja.opened_by) ?? null } },
      { clave: 'apertura', valor: { tipo: 'instanteHora', v: caja.opened_at } },
      { clave: 'cierre', valor: { tipo: 'instanteHora', v: caja.closed_at } },
      { clave: 'cerradaPor', valor: { tipo: 'texto', v: caja.closed_by ? gente.get(caja.closed_by) ?? null : null } },
      { clave: 'moneda', valor: { tipo: 'texto', v: moneda.code } },
    ],
    resumen,
    lineas: null,
    secciones,
    totales,
    notas: texto(caja.notes),
    terminos: null,
    firma: 'cajeroSupervisor',
    pieLegal: { textos: textoLegal(base, 'cierre-caja', t), resolucion: null, codigoUnico: null, qr: null },
    sobrio: false,
    moneda,
    zonaHoraria: base.zonaHoraria,
    generadoEn: (opciones.ahora ?? new Date()).toISOString(),
    nombreArchivo: nombreArchivoBase(t, 'cierre-caja', String(caja.id)),
  };
}

interface FilaArqueo {
  id: number;
  organization_id: number;
  cash_session_id: number;
  count_type: string;
  counted_amount: number | string;
  expected_amount: number | string | null;
  difference: number | string | null;
  denominations: { bills?: Record<string, number>; coins?: Record<string, number> } | null;
  counted_by: string;
  notes: string | null;
  created_at: string;
  method_breakdown: Record<string, { esperado?: number; contado?: number | null; diferencia?: number | null }> | null;
}

export async function cargarArqueoCaja(
  sesion: SesionDocumento,
  idCrudo: string,
  opciones: OpcionesCarga,
  t: Traductor,
): Promise<DocumentoPayload> {
  const id = exigirEntero(idCrudo);
  const { data, error } = await sesion.supabase
    .from('cash_counts')
    .select('id, organization_id, cash_session_id, count_type, counted_amount, expected_amount, difference, denominations, counted_by, notes, created_at, method_breakdown')
    .eq('id', id)
    .eq('organization_id', sesion.organizationId)
    .maybeSingle();
  if (error) fallaLectura('cash_counts', error);
  const arqueo = data as FilaArqueo | null;
  if (!arqueo || arqueo.organization_id !== sesion.organizationId) throw noEncontrado();
  const caja = await leerSesion(sesion, arqueo.cash_session_id);
  const acceso = await accesoACaja(sesion, [arqueo.counted_by, caja.opened_by]);
  if (!acceso.permitido) throw sinPermiso();

  const [base, moneda, gente] = await Promise.all([
    cargarBase(sesion, caja.branch_id),
    resolverContextoMoneda(sesion.supabase, sesion.organizationId),
    nombres(sesion, [arqueo.counted_by, caja.opened_by]),
  ]);
  const ver = acceso.verEsperado;

  const denominaciones: CeldaTabla[][] = [];
  for (const grupo of ['bills', 'coins'] as const) {
    for (const [valor, cantidad] of Object.entries(arqueo.denominations?.[grupo] ?? {})) {
      const n = num(cantidad);
      if (n <= 0) continue;
      denominaciones.push([`caja.${grupo === 'bills' ? 'billete' : 'moneda'}`, num(valor), n, num(valor) * n]);
    }
  }
  const nombresMetodos = await cargarNombresMetodos(sesion, Object.keys(arqueo.method_breakdown ?? {}));
  const metodos = Object.entries(arqueo.method_breakdown ?? {}).map(([metodo, linea]) => [
    rotuloMetodo(metodo, t, nombresMetodos),
    ver ? numONull(linea?.esperado) : oculto,
    numONull(linea?.contado),
    ver ? numONull(linea?.diferencia) : oculto,
  ] as CeldaTabla[]);

  const totales: FilaTotal[] = [
    { clave: 'caja.contado', valor: num(arqueo.counted_amount), estilo: 'total' },
    { clave: 'caja.esperado', valor: numONull(arqueo.expected_amount), oculto: !ver },
    { clave: 'caja.diferencia', valor: numONull(arqueo.difference), estilo: num(arqueo.difference) < 0 ? 'saldo' : 'pagado', oculto: !ver },
  ];

  const numero = `#${arqueo.id}`;
  return {
    tipo: 'arqueo-caja',
    tituloClave: 'arqueo-caja',
    idioma: opciones.idioma,
    numero,
    estado: { codigo: `caja.arqueo.${arqueo.count_type}`, tono: 'marca' },
    marcaAgua: null,
    bandas: ver ? [] : [{ clave: 'cierreCiego', tono: 'info' }],
    emisor: base.emisor,
    sucursal: base.sucursal,
    contraparte: null,
    referencia: [
      { clave: 'caja', valor: { tipo: 'texto', v: `#${caja.id}` } },
      { clave: 'aperturaCaja', valor: { tipo: 'instanteHora', v: caja.opened_at } },
      { clave: 'cajero', valor: { tipo: 'texto', v: gente.get(caja.opened_by) ?? null } },
    ],
    metadatos: [
      { clave: 'fechaArqueo', valor: { tipo: 'instanteHora', v: arqueo.created_at } },
      { clave: 'contadoPor', valor: { tipo: 'texto', v: gente.get(arqueo.counted_by) ?? null } },
      { clave: 'moneda', valor: { tipo: 'texto', v: moneda.code } },
    ],
    resumen: [],
    lineas: null,
    secciones: [
      {
        titulo: 'denominaciones',
        columnas: [{ clave: 'tipo', tipo: 'clave' }, { clave: 'denominacion', tipo: 'dinero' }, { clave: 'cantidad', tipo: 'numero' }, { clave: 'subtotal', tipo: 'dinero' }],
        filas: denominaciones,
      },
      {
        titulo: 'porMetodo',
        columnas: [{ clave: 'metodo', tipo: 'texto' }, { clave: 'esperado', tipo: 'dinero' }, { clave: 'contado', tipo: 'dinero' }, { clave: 'diferencia', tipo: 'dinero' }],
        filas: metodos,
      },
    ],
    totales,
    notas: texto(arqueo.notes),
    terminos: null,
    firma: 'cajeroSupervisor',
    pieLegal: { textos: textoLegal(base, 'arqueo-caja', t), resolucion: null, codigoUnico: null, qr: null },
    sobrio: false,
    moneda,
    zonaHoraria: base.zonaHoraria,
    generadoEn: (opciones.ahora ?? new Date()).toISOString(),
    nombreArchivo: nombreArchivoBase(t, 'arqueo-caja', String(arqueo.id)),
  };
}
