/**
 * Tributario (Finanzas R4-A): lecturas y escritura del servidor para el perfil
 * tributario, el Centro tributario, el borrador del IVA y los certificados de
 * retención. Siempre con el cliente de la SESIÓN (`ctx.supabase`, RLS y
 * `auth.uid()` en las RPC) y la organización de la sesión, nunca la del cuerpo.
 *
 * Lo que depende de migraciones aún sin aplicar (20261108101000 borrador del
 * IVA, 20261108160000 catálogo RUT/FE, 20261108160500 renta e IVA separados) se
 * detecta por «tabla o función inexistente» y vuelve como `pendiente_activar`:
 * la pantalla lo dice así y nunca lo pinta como cero. Cualquier otro error se lanza.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { nextPlainDay, plainDateToInstant, todayInTz } from '@/lib/utils/dateDisplay';
import {
  bloqueosDeError,
  codigoErrorGuardarPerfil,
  contiguas,
  esObjetoInexistente,
  faltantesPerfil,
  leerVigencias,
  parametrosGuardarPerfil,
  vigenciaEn,
  type DatosEmpresa,
  type FaltaPerfil,
  type FilaPerfil,
  type SolicitudPerfil,
  type VigenciaPerfil,
} from '@/lib/finanzas/tributario/perfil';
import { advertenciasSinAceptar, evaluarCombinacion } from '@/lib/finanzas/tributario/combinaciones';
import { analizarPeriodo, type AnalisisPeriodo, type SolicitudDecision } from '@/lib/finanzas/tributario/vigenciasPeriodo';
import {
  aniosCalendario,
  calendarioIncompleto,
  obligacionesDelCorte,
  vencimientoDe,
  type FilaCalendario,
  type Obligacion,
  type Vencimiento,
} from '@/lib/finanzas/tributario/obligaciones';
import { leerMes, mesAnterior } from '@/lib/finanzas/tributario/periodos';
import { leerBorradorIva, type BorradorIva } from '@/lib/finanzas/tributario/borradorIva';
import {
  cruzarCertificados,
  leerRetencionesPorTercero,
  resumirCertificados,
  type CertificadoGuardado,
  type FilaCertificado,
  type ResumenCertificados,
} from '@/lib/finanzas/tributario/certificados';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'supabase'>;

export class ErrorTributario extends Error {
  constructor(
    public readonly codigo: string,
    public readonly status: number,
    /** Datos para la pantalla (los bloqueos o las advertencias por aceptar). Nunca datos de otra organización. */
    public readonly detalle?: Record<string, unknown>,
  ) {
    super(codigo);
  }
}

type ErrorBase = { code?: string; message?: string; details?: string | null } | null;

async function zonaYHoy(ctx: Ctx): Promise<{ tz: string; hoy: string }> {
  const tz = await getOrganizationTimezone(ctx.organizationId, ctx.supabase);
  return { tz, hoy: todayInTz(tz) };
}

/** Instantes `[desde 00:00, hasta 23:59:59.999]` del rango de días en la zona de la organización. */
function instantes(desde: string, hasta: string, tz: string): { inicio: string; fin: string } {
  const inicio = plainDateToInstant(desde, tz);
  const fin = new Date(Date.parse(plainDateToInstant(nextPlainDay(hasta), tz)) - 1).toISOString();
  return { inicio, fin };
}

// ── Perfil ─────────────────────────────────────────────────────────────────

/** Estado de validación de un código del catálogo (lo valida el Contador antes de aprobarse). */
export type EstadoValidacionCodigo = 'pendiente_validacion' | 'cotejado_fuente_oficial' | 'validado' | 'no_pertenece_tabla_fe' | 'historico' | 'sin_dato';

export interface CodigoCatalogo {
  codigo: string;
  descripcion: string;
  estado: EstadoValidacionCodigo;
  nota: string | null;
  /** De dónde sale el código (instructivo oficial de la DIAN, numeral y página). */
  fuente: string | null;
  vigente: boolean;
}

export interface RespuestaPerfil {
  /** false = la migración del perfil aún no está aplicada. */
  activo: boolean;
  /** false = falta la migración 20261108160500 (renta e IVA separados): no se puede guardar. */
  separacionActiva: boolean;
  hoy: string;
  empresa: DatosEmpresa;
  vigencias: VigenciaPerfil[];
  vigente: VigenciaPerfil | null;
  faltan: FaltaPerfil[];
  /** Códigos del DOCUMENTO ELECTRÓNICO (`dian_fiscal_responsibilities`). */
  catalogo: CodigoCatalogo[];
  /** Casilla 53 del RUT (`rut_responsabilidades`); vacío si la migración del catálogo no está aplicada. */
  catalogoRut: CodigoCatalogo[];
}

const ESTADOS_VALIDACION = new Set(['pendiente_validacion', 'cotejado_fuente_oficial', 'validado', 'no_pertenece_tabla_fe', 'historico']);
const estadoDe = (v: unknown): EstadoValidacionCodigo => (typeof v === 'string' && ESTADOS_VALIDACION.has(v) ? (v as EstadoValidacionCodigo) : 'sin_dato');

export async function leerPerfil(ctx: Ctx): Promise<RespuestaPerfil> {
  const [{ hoy }, org, catalogo, catalogoRut, perfiles, ica] = await Promise.all([
    zonaYHoy(ctx),
    ctx.supabase.from('organizations').select('nit, dv, fiscal_responsibilities').eq('id', ctx.organizationId).maybeSingle(),
    // `*`: antes de 20261108160000 la tabla no trae estado_validacion ni nota.
    ctx.supabase.from('dian_fiscal_responsibilities').select('*').order('sort_order'),
    ctx.supabase.from('rut_responsabilidades').select('codigo, nombre, vigente, estado_validacion, nota, fuente').order('orden'),
    // `*`: antes de 20261108160500 no existen las columnas de renta e IVA separados.
    ctx.supabase.from('organization_tax_profiles').select('*').eq('organization_id', ctx.organizationId).order('vigente_desde', { ascending: false }),
    ctx.supabase
      .from('organization_tax_profile_ica')
      .select('profile_id, municipality_id, periodicidad, tarifa_por_mil, actividad')
      .eq('organization_id', ctx.organizationId),
  ]);
  if (org.error) throw org.error;
  if (catalogo.error) throw catalogo.error;
  const o = (org.data ?? {}) as { nit?: string | null; dv?: number | null; fiscal_responsibilities?: string[] | null };
  const empresa: DatosEmpresa = { nit: o.nit ?? null, dv: o.dv ?? null, responsabilidadesRut: o.fiscal_responsibilities ?? [] };
  const listaCatalogo: CodigoCatalogo[] = ((catalogo.data ?? []) as { code: string; description: string; estado_validacion?: unknown; nota?: string | null; fuente?: string | null }[]).map(
    (c) => ({
      codigo: c.code,
      descripcion: c.description,
      estado: estadoDe(c.estado_validacion),
      nota: c.nota ?? null,
      fuente: c.fuente ?? null,
      vigente: c.estado_validacion !== 'no_pertenece_tabla_fe',
    }),
  );
  if (catalogoRut.error && !esObjetoInexistente(catalogoRut.error as ErrorBase)) throw catalogoRut.error;
  const listaRut: CodigoCatalogo[] = catalogoRut.error
    ? []
    : ((catalogoRut.data ?? []) as { codigo: string; nombre: string; vigente: boolean; estado_validacion: unknown; nota: string | null; fuente: string | null }[]).map((c) => ({
        codigo: c.codigo,
        descripcion: c.nombre,
        estado: estadoDe(c.estado_validacion),
        nota: c.nota,
        fuente: c.fuente,
        vigente: c.vigente !== false,
      }));

  const inactivo = esObjetoInexistente(perfiles.error as ErrorBase) || esObjetoInexistente(ica.error as ErrorBase);
  if (inactivo) {
    return {
      activo: false,
      separacionActiva: false,
      hoy,
      empresa,
      vigencias: [],
      vigente: null,
      faltan: faltantesPerfil(empresa, null),
      catalogo: listaCatalogo,
      catalogoRut: listaRut,
    };
  }
  if (perfiles.error) throw perfiles.error;
  if (ica.error) throw ica.error;

  const filasIca = (ica.data ?? []) as { profile_id: string; municipality_id: string; periodicidad: string; tarifa_por_mil: number | null; actividad: string | null }[];
  const ids = Array.from(new Set(filasIca.map((i) => i.municipality_id)));
  const municipios = new Map<string, { nombre: string; departamento: string | null }>();
  if (ids.length > 0) {
    const { data, error } = await ctx.supabase.from('municipalities').select('id, name, state_name').in('id', ids);
    if (error) throw error;
    for (const m of (data ?? []) as { id: string; name: string; state_name: string | null }[]) municipios.set(m.id, { nombre: m.name, departamento: m.state_name });
  }
  const filas = (perfiles.data ?? []) as FilaPerfil[];
  const vigencias = leerVigencias(filas, filasIca, municipios);
  const vigente = vigenciaEn(vigencias, hoy);
  // Con filas, la columna dice si la separación renta/IVA está aplicada; sin filas, el catálogo del RUT (misma ronda).
  const separacionActiva = filas.length > 0 ? 'regimen_renta' in filas[0] : !catalogoRut.error;
  return {
    activo: true,
    separacionActiva,
    hoy,
    empresa,
    vigencias,
    vigente,
    faltan: faltantesPerfil(empresa, vigente),
    catalogo: listaCatalogo,
    catalogoRut: listaRut,
  };
}

const STATUS_GUARDAR = {
  sin_permiso: 403,
  no_encontrado: 404,
  vigencia_duplicada: 409,
  pendiente_activar: 501,
  combinacion_contradictoria: 400,
  datos_invalidos: 400,
  desconocido: 500,
} as const;

/**
 * Guardar una vigencia: primero las combinaciones (bloqueos → 400 con la lista;
 * advertencias sin aceptar → 409 con la lista), luego la RPC, que vuelve a
 * bloquear lo contradictorio en la base.
 */
export async function guardarPerfil(ctx: Ctx, datos: SolicitudPerfil): Promise<{ id: string; advertencias: string[] }> {
  const perfil = await leerPerfil(ctx);
  if (!perfil.activo || !perfil.separacionActiva) throw new ErrorTributario('pendiente_activar', 501);
  const propia = datos.id ? perfil.vigencias.find((v) => v.id === datos.id) : null;
  if (datos.id && !propia) throw new ErrorTributario('no_encontrado', 404);
  const desde = propia ? propia.vigenteDesde : datos.vigenteDesde;
  const { anterior, siguiente } = contiguas(perfil.vigencias, desde, datos.id);
  const r = evaluarCombinacion(datos, { vigenteDesde: desde, anterior, siguiente });
  if (r.bloqueos.length > 0) throw new ErrorTributario('combinacion_contradictoria', 400, { bloqueos: r.bloqueos, advertencias: r.advertencias });
  const pendientes = advertenciasSinAceptar(r.advertencias, datos.advertenciasAceptadas);
  if (pendientes.length > 0) throw new ErrorTributario('advertencias_sin_aceptar', 409, { advertencias: r.advertencias, pendientes });

  const { data, error } = await ctx.supabase.rpc('fn_perfil_tributario_guardar_v2', parametrosGuardarPerfil(ctx.organizationId, datos, r.advertencias));
  if (error) {
    const codigo = codigoErrorGuardarPerfil(error as ErrorBase);
    const status = STATUS_GUARDAR[codigo];
    if (status >= 500 && codigo !== 'pendiente_activar') {
      console.error('[tributario] fn_perfil_tributario_guardar_v2', { organizationId: ctx.organizationId, code: (error as ErrorBase)?.code });
    }
    throw new ErrorTributario(codigo, status, codigo === 'combinacion_contradictoria' ? { bloqueos: bloqueosDeError(error as ErrorBase) } : undefined);
  }
  if (typeof data !== 'string') throw new ErrorTributario('desconocido', 500);
  return { id: data, advertencias: r.advertencias };
}

/** Vigencias que tocan un periodo (aviso del borrador del IVA, P8). */
export async function leerVigenciasDelPeriodo(ctx: Ctx, desde: string, hasta: string): Promise<{ activo: boolean; analisis: AnalisisPeriodo | null }> {
  const perfil = await leerPerfil(ctx);
  if (!perfil.activo) return { activo: false, analisis: null };
  return { activo: true, analisis: analizarPeriodo(perfil.vigencias, desde, hasta) };
}

/** Municipios para el ICA (DIVIPOLA, dato público de referencia): hasta 20 por nombre. */
export async function buscarMunicipios(ctx: Ctx, q: string): Promise<{ id: string; nombre: string; departamento: string | null; codigo: string }[]> {
  const termino = q.trim().replace(/[%_,()]/g, ' ').slice(0, 60);
  if (termino.length < 2) return [];
  const { data, error } = await ctx.supabase
    .from('municipalities')
    .select('id, code, name, state_name')
    .eq('country_code', 'CO')
    .ilike('name', `%${termino}%`)
    .order('name')
    .limit(20);
  if (error) throw error;
  return ((data ?? []) as { id: string; code: string; name: string; state_name: string | null }[]).map((m) => ({
    id: m.id,
    nombre: m.name,
    departamento: m.state_name,
    codigo: m.code,
  }));
}

// ── Borrador del IVA ───────────────────────────────────────────────────────

export type LecturaBorrador = { estado: 'listo'; borrador: BorradorIva } | { estado: 'pendiente_activar' };

export async function leerBorrador(ctx: Ctx, desde: string, hasta: string): Promise<LecturaBorrador> {
  const { data, error } = await ctx.supabase.rpc('fn_tributario_borrador_iva', {
    p_organization_id: ctx.organizationId,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    if (esObjetoInexistente(error as ErrorBase)) return { estado: 'pendiente_activar' };
    if ((error as ErrorBase)?.code === '42501') throw new ErrorTributario('sin_permiso', 403);
    if ((error as ErrorBase)?.code === '22023') throw new ErrorTributario('periodo_invalido', 400);
    throw error;
  }
  return { estado: 'listo', borrador: leerBorradorIva(data) };
}

// ── Retenciones (reporte existente) ────────────────────────────────────────

async function retencionesPracticadas(ctx: Ctx, desde: string, hasta: string, tz: string): Promise<unknown> {
  const { inicio, fin } = instantes(desde, hasta, tz);
  const { data, error } = await ctx.supabase.rpc('fn_reporte_retenciones_practicadas', {
    p_organization_id: ctx.organizationId,
    p_from: inicio,
    p_to: fin,
    p_branch_id: null,
  });
  if (error) {
    if ((error as ErrorBase)?.code === '42501') throw new ErrorTributario('sin_permiso', 403);
    throw error;
  }
  return data;
}

// ── Centro tributario ──────────────────────────────────────────────────────

export type ValorObligacion =
  | { estado: 'calculado'; valor: number; revisar: boolean }
  /** Más de una vigencia dentro del periodo: no se decide sola cuál aplica (P8). */
  | { estado: 'revisar_procedencia' }
  | { estado: 'pendiente_activar' }
  | { estado: 'no_calculable' }
  | { estado: 'error' };

/** Decisión sustentada sobre un período con varias vigencias (P8, ronda 2). */
export interface DecisionPeriodo {
  id: string;
  decision: string;
  fundamento: string;
  alcance: string;
  vigenciaAplicadaId: string | null;
  decididoPor: string;
  /** Nombre visible de quien decidió (perfil), o null si no se encuentra. */
  decididoPorNombre: string | null;
  decididoEn: string;
  /** false = cambiaron las vigencias del período después de decidir: la alerta se reabrió. */
  aplica: boolean;
}

export interface FilaCentro {
  obligacion: Obligacion;
  vencimiento: Vencimiento;
  valor: ValorObligacion;
  /** Historia de decisiones del período (la más nueva primero); vacía si no hay o no aplica. */
  decisiones?: DecisionPeriodo[];
  /** Vigencias que tocan el período (para decidir), solo cuando hay cambio de vigencia. */
  vigenciasPeriodo?: AnalisisPeriodo['vigencias'];
}

interface FilaDecision {
  id: string;
  obligacion: string;
  periodo_desde: string;
  periodo_hasta: string;
  decision: string;
  fundamento: string;
  alcance: string;
  vigencia_aplicada_id: string | null;
  huella: string;
  decidido_por: string;
  decidido_en: string;
}

/** Decisiones registradas de la organización (vacío si la migración 20261108161000 no está aplicada). */
async function leerDecisiones(ctx: Ctx): Promise<FilaDecision[]> {
  const { data, error } = await ctx.supabase
    .from('tax_period_decisions')
    .select('id, obligacion, periodo_desde, periodo_hasta, decision, fundamento, alcance, vigencia_aplicada_id, huella, decidido_por, decidido_en')
    .eq('organization_id', ctx.organizationId)
    .order('decidido_en', { ascending: false })
    .limit(500);
  if (error) {
    if (esObjetoInexistente(error as ErrorBase)) return [];
    throw error;
  }
  return (data ?? []) as FilaDecision[];
}


/**
 * Registrar la decisión que cierra la alerta de un período con varias
 * vigencias. La huella la calcula el servidor con las vigencias de la base
 * (nunca la del cliente); si el período no tiene cambio de vigencia, no hay
 * nada que decidir.
 */
export async function registrarDecisionPeriodo(ctx: Ctx, s: SolicitudDecision): Promise<{ id: string }> {
  const perfil = await leerPerfil(ctx);
  if (!perfil.activo) throw new ErrorTributario('pendiente_activar', 501);
  const analisis = analizarPeriodo(perfil.vigencias, s.desde, s.hasta);
  if (!analisis.cambioDeVigencia) throw new ErrorTributario('sin_cambio_de_vigencia', 400);
  if (s.vigenciaAplicadaId && !analisis.vigencias.some((v) => v.id === s.vigenciaAplicadaId)) throw new ErrorTributario('datos_invalidos', 400);
  const { data, error } = await ctx.supabase.rpc('fn_tributario_decision_periodo_registrar', {
    p_organization_id: ctx.organizationId,
    p_obligacion: s.obligacion,
    p_desde: s.desde,
    p_hasta: s.hasta,
    p_decision: s.decision,
    p_fundamento: s.fundamento,
    p_alcance: s.alcance,
    p_vigencia_aplicada_id: s.vigenciaAplicadaId,
    p_huella: analisis.huella,
  });
  if (error) {
    if (esObjetoInexistente(error as ErrorBase)) throw new ErrorTributario('pendiente_activar', 501);
    if ((error as ErrorBase)?.code === '42501') throw new ErrorTributario('sin_permiso', 403);
    if ((error as ErrorBase)?.code === '22023') throw new ErrorTributario('datos_invalidos', 400);
    throw error;
  }
  if (typeof data !== 'string') throw new ErrorTributario('desconocido', 500);
  return { id: data };
}

export interface RespuestaCentro {
  corte: string;
  hoy: string;
  perfil: 'activo' | 'pendiente_activar' | 'sin_perfil';
  faltan: FaltaPerfil[];
  calendario: 'activo' | 'pendiente_activar';
  /** Años con el calendario incompleto (sin fechas o sin la de alguna obligación): nunca «sin obligaciones». */
  calendarioIncompleto: number[];
  filas: FilaCentro[];
}

export async function leerCentro(ctx: Ctx, corteSolicitado: string | null): Promise<RespuestaCentro> {
  const perfil = await leerPerfil(ctx);
  const { tz } = await zonaYHoy(ctx);
  const corte = corteSolicitado && leerMes(corteSolicitado) && corteSolicitado < perfil.hoy.slice(0, 7) ? corteSolicitado : mesAnterior(perfil.hoy);
  const base = { corte, hoy: perfil.hoy, faltan: perfil.faltan, calendarioIncompleto: [] as number[] };
  if (!perfil.activo) return { ...base, perfil: 'pendiente_activar', calendario: 'pendiente_activar', filas: [] };

  // P8: todas las vigencias que tocan los periodos, no solo la del último día del corte.
  const obligaciones = obligacionesDelCorte(perfil.vigencias, corte);
  if (obligaciones.length === 0 && perfil.vigencias.every((v) => v.vigenteDesde > `${corte}-31`)) {
    return { ...base, perfil: 'sin_perfil', calendario: 'pendiente_activar', filas: [] };
  }
  const anios = aniosCalendario(obligaciones);
  let calendario: FilaCalendario[] | null = [];
  if (anios.length > 0) {
    const { data, error } = await ctx.supabase
      .from('tax_calendar_dates')
      .select('anio, obligacion, periodo, cuota, cantidad_digitos, digitos_desde, digitos_hasta, fecha_vencimiento, norma')
      .eq('country_code', 'CO')
      .in('anio', anios);
    if (error) {
      if (!esObjetoInexistente(error as ErrorBase)) throw error;
      calendario = null;
    } else {
      calendario = (data ?? []) as FilaCalendario[];
    }
  }

  const decisiones = obligaciones.some((o) => o.notas.includes('cambio_vigencia_en_periodo')) ? await leerDecisiones(ctx) : [];
  const nombres = new Map<string, string>();
  const ids = Array.from(new Set(decisiones.map((d) => d.decidido_por)));
  if (ids.length > 0) {
    const { data } = await ctx.supabase.from('profiles').select('id, first_name, last_name, email').in('id', ids);
    for (const p of (data ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null }[]) {
      nombres.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.email || '');
    }
  }

  const filas = await Promise.all(
    obligaciones.map(async (o): Promise<FilaCentro> => {
      const vencimiento = vencimientoDe(o, perfil.empresa.nit, calendario);
      let extra: Pick<FilaCentro, 'decisiones' | 'vigenciasPeriodo'> = {};
      if (o.notas.includes('cambio_vigencia_en_periodo')) {
        // P8 ronda 2: la alerta se cierra con una decisión sustentada cuya huella coincide con las vigencias de hoy;
        // si cambió algo relevante, la decisión queda en la historia y la alerta se reabre.
        const analisis = analizarPeriodo(perfil.vigencias, o.periodo.desde, o.periodo.hasta);
        const historia: DecisionPeriodo[] = decisiones
          .filter((d) => d.obligacion === o.id && d.periodo_desde === o.periodo.desde && d.periodo_hasta === o.periodo.hasta)
          .map((d) => ({
            id: d.id,
            decision: d.decision,
            fundamento: d.fundamento,
            alcance: d.alcance,
            vigenciaAplicadaId: d.vigencia_aplicada_id,
            decididoPor: d.decidido_por,
            decididoPorNombre: nombres.get(d.decidido_por) || null,
            decididoEn: d.decidido_en,
            aplica: d.huella === analisis.huella,
          }));
        extra = { decisiones: historia, vigenciasPeriodo: analisis.vigencias };
        const vigente = historia[0];
        o.notas.push(vigente ? (vigente.aplica ? 'decision_registrada' : 'decision_reabierta') : 'cambio_vigencia_en_periodo');
        o.notas = Array.from(new Set(o.notas));
        if (!vigente?.aplica) return { obligacion: o, vencimiento, valor: { estado: 'revisar_procedencia' }, ...extra };
      }
      if (o.notas.includes('cambio_periodicidad_pendiente')) return { obligacion: o, vencimiento, valor: { estado: 'revisar_procedencia' }, ...extra };
      let valor: ValorObligacion = { estado: 'no_calculable' };
      try {
        if (o.fuente === 'borrador_iva') {
          const b = await leerBorrador(ctx, o.periodo.desde, o.periodo.hasta);
          valor = b.estado === 'pendiente_activar' ? { estado: 'pendiente_activar' } : { estado: 'calculado', valor: b.borrador.saldo, revisar: b.borrador.porRevisar > 0 };
        } else if (o.fuente === 'reporte_retenciones') {
          const datos = (await retencionesPracticadas(ctx, o.periodo.desde, o.periodo.hasta, tz)) as { totales?: { total?: unknown } } | null;
          const total = Number(datos?.totales?.total ?? 0);
          valor = { estado: 'calculado', valor: Number.isFinite(total) ? total : 0, revisar: o.notas.includes('sin_autorretencion') };
        }
      } catch (err) {
        if (err instanceof ErrorTributario && err.status === 403) throw err;
        console.error('[tributario] valor de la obligación', { organizationId: ctx.organizationId, obligacion: o.clave });
        valor = { estado: 'error' };
      }
      return { obligacion: o, vencimiento, valor, ...extra };
    }),
  );

  const incompletos = Array.from(new Set(filas.map((f) => f.vencimiento).filter(calendarioIncompleto).map((v) => v.anio))).sort();
  return { ...base, calendarioIncompleto: incompletos, perfil: 'activo', calendario: calendario === null ? 'pendiente_activar' : 'activo', filas };
}

// ── Certificados de retención ──────────────────────────────────────────────

export interface RespuestaCertificados {
  desde: string;
  hasta: string;
  filas: FilaCertificado[];
  resumen: ResumenCertificados;
}

export async function leerCertificados(ctx: Ctx, desde: string, hastaSolicitado: string): Promise<RespuestaCertificados> {
  const { tz, hoy } = await zonaYHoy(ctx);
  if (desde > hoy) throw new ErrorTributario('periodo_invalido', 400);
  // Igual que la RPC que expide: el periodo nunca pasa de hoy.
  const hasta = hastaSolicitado > hoy ? hoy : hastaSolicitado;
  const [datos, certs] = await Promise.all([
    retencionesPracticadas(ctx, desde, hasta, tz),
    ctx.supabase
      .from('withholding_certificates')
      .select('id, supplier_id, number, period_from, period_to, total_withheld, issued_at')
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'issued')
      .eq('period_from', desde)
      .eq('period_to', hasta),
  ]);
  if (certs.error) throw certs.error;
  const guardados: CertificadoGuardado[] = ((certs.data ?? []) as {
    id: string;
    supplier_id: number;
    number: string;
    period_from: string;
    period_to: string;
    total_withheld: number | string;
    issued_at: string | null;
  }[]).map((c) => ({
    id: c.id,
    proveedorId: c.supplier_id,
    numero: c.number,
    desde: c.period_from,
    hasta: c.period_to,
    totalRetenido: Number(c.total_withheld ?? 0),
    expedidoEn: c.issued_at,
  }));
  const filas = cruzarCertificados(leerRetencionesPorTercero(datos), guardados, { desde, hasta });
  return { desde, hasta, filas, resumen: resumirCertificados(filas) };
}

// ── Respuestas HTTP ────────────────────────────────────────────────────────

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

/** Error → respuesta JSON `{ error, codigo }`. Lo desconocido es 500 y queda en el log sin datos del cliente. */
export function respuestaErrorTributario(ruta: string, err: unknown): Response {
  if (err instanceof ErrorTributario) {
    return Response.json({ error: err.codigo, codigo: err.codigo, ...(err.detalle ?? {}) }, { status: err.status, headers: SIN_CACHE });
  }
  const e = err as { statusCode?: unknown; code?: unknown; message?: unknown } | null;
  if (e && typeof e.statusCode === 'number') {
    return Response.json({ error: String(e.message ?? 'error'), codigo: String(e.code ?? 'error') }, { status: e.statusCode, headers: SIN_CACHE });
  }
  console.error(`[${ruta}]`, err instanceof Error ? err.message : (e?.code ?? 'error'));
  return Response.json({ error: 'desconocido', codigo: 'desconocido' }, { status: 500, headers: SIN_CACHE });
}
