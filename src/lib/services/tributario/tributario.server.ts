/**
 * Tributario (Finanzas R4-A): lecturas y escritura del servidor para el perfil
 * tributario, el Centro tributario, el borrador del IVA y los certificados de
 * retención. Siempre con el cliente de la SESIÓN (`ctx.supabase`, RLS y
 * `auth.uid()` en las RPC) y la organización de la sesión, nunca la del cuerpo.
 *
 * Lo que depende de migraciones aún sin aplicar (20261108100000 perfil,
 * 20261108100500 calendario, 20261108101000 borrador del IVA) se detecta por
 * «tabla o función inexistente» y vuelve como `pendiente_activar`: la pantalla
 * lo dice así y nunca lo pinta como cero. Cualquier otro error se lanza.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { nextPlainDay, plainDateToInstant, todayInTz } from '@/lib/utils/dateDisplay';
import {
  codigoErrorGuardarPerfil,
  esObjetoInexistente,
  faltantesPerfil,
  leerVigencias,
  parametrosGuardarPerfil,
  vigenciaEn,
  type DatosEmpresa,
  type FaltaPerfil,
  type SolicitudPerfil,
  type VigenciaPerfil,
} from '@/lib/finanzas/tributario/perfil';
import {
  aniosCalendario,
  derivarObligaciones,
  vencimientoDe,
  type FilaCalendario,
  type Obligacion,
  type Vencimiento,
} from '@/lib/finanzas/tributario/obligaciones';
import { leerMes, mesAnterior, ultimoDiaDelMes } from '@/lib/finanzas/tributario/periodos';
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
  ) {
    super(codigo);
  }
}

type ErrorBase = { code?: string; message?: string } | null;

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

export interface RespuestaPerfil {
  /** false = la migración del perfil aún no está aplicada. */
  activo: boolean;
  hoy: string;
  empresa: DatosEmpresa;
  vigencias: VigenciaPerfil[];
  vigente: VigenciaPerfil | null;
  faltan: FaltaPerfil[];
  catalogo: { codigo: string; descripcion: string }[];
}

export async function leerPerfil(ctx: Ctx): Promise<RespuestaPerfil> {
  const [{ hoy }, org, catalogo, perfiles, ica] = await Promise.all([
    zonaYHoy(ctx),
    ctx.supabase.from('organizations').select('nit, dv, fiscal_responsibilities').eq('id', ctx.organizationId).maybeSingle(),
    ctx.supabase.from('dian_fiscal_responsibilities').select('code, description').order('sort_order'),
    ctx.supabase
      .from('organization_tax_profiles')
      .select('id, vigente_desde, vigente_hasta, regimen, responsabilidades, agente_retencion, responsable_inc, periodicidad_iva, notas')
      .eq('organization_id', ctx.organizationId)
      .order('vigente_desde', { ascending: false }),
    ctx.supabase
      .from('organization_tax_profile_ica')
      .select('profile_id, municipality_id, periodicidad, tarifa_por_mil, actividad')
      .eq('organization_id', ctx.organizationId),
  ]);
  if (org.error) throw org.error;
  if (catalogo.error) throw catalogo.error;
  const o = (org.data ?? {}) as { nit?: string | null; dv?: number | null; fiscal_responsibilities?: string[] | null };
  const empresa: DatosEmpresa = { nit: o.nit ?? null, dv: o.dv ?? null, responsabilidadesRut: o.fiscal_responsibilities ?? [] };
  const listaCatalogo = ((catalogo.data ?? []) as { code: string; description: string }[]).map((c) => ({ codigo: c.code, descripcion: c.description }));

  const inactivo = esObjetoInexistente(perfiles.error as ErrorBase) || esObjetoInexistente(ica.error as ErrorBase);
  if (inactivo) {
    return { activo: false, hoy, empresa, vigencias: [], vigente: null, faltan: faltantesPerfil(empresa, null), catalogo: listaCatalogo };
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
  const vigencias = leerVigencias((perfiles.data ?? []) as Parameters<typeof leerVigencias>[0], filasIca, municipios);
  const vigente = vigenciaEn(vigencias, hoy);
  return { activo: true, hoy, empresa, vigencias, vigente, faltan: faltantesPerfil(empresa, vigente), catalogo: listaCatalogo };
}

export async function guardarPerfil(ctx: Ctx, datos: SolicitudPerfil): Promise<{ id: string }> {
  const { data, error } = await ctx.supabase.rpc('fn_perfil_tributario_guardar', parametrosGuardarPerfil(ctx.organizationId, datos));
  if (error) {
    const codigo = codigoErrorGuardarPerfil(error as ErrorBase);
    const status = { sin_permiso: 403, no_encontrado: 404, vigencia_duplicada: 409, pendiente_activar: 501, datos_invalidos: 400, desconocido: 500 }[codigo];
    if (status >= 500 && codigo !== 'pendiente_activar') console.error('[tributario] fn_perfil_tributario_guardar', { organizationId: ctx.organizationId, code: (error as ErrorBase)?.code });
    throw new ErrorTributario(codigo, status);
  }
  if (typeof data !== 'string') throw new ErrorTributario('desconocido', 500);
  return { id: data };
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
  | { estado: 'pendiente_activar' }
  | { estado: 'no_calculable' }
  | { estado: 'error' };

export interface FilaCentro {
  obligacion: Obligacion;
  vencimiento: Vencimiento;
  valor: ValorObligacion;
}

export interface RespuestaCentro {
  corte: string;
  hoy: string;
  perfil: 'activo' | 'pendiente_activar' | 'sin_perfil';
  faltan: FaltaPerfil[];
  calendario: 'activo' | 'pendiente_activar';
  filas: FilaCentro[];
}

export async function leerCentro(ctx: Ctx, corteSolicitado: string | null): Promise<RespuestaCentro> {
  const perfil = await leerPerfil(ctx);
  const { tz } = await zonaYHoy(ctx);
  const corte = corteSolicitado && leerMes(corteSolicitado) && corteSolicitado < perfil.hoy.slice(0, 7) ? corteSolicitado : mesAnterior(perfil.hoy);
  const base = { corte, hoy: perfil.hoy, faltan: perfil.faltan };
  if (!perfil.activo) return { ...base, perfil: 'pendiente_activar', calendario: 'pendiente_activar', filas: [] };

  const [anio, mes] = leerMes(corte)!;
  const vigente = vigenciaEn(perfil.vigencias, ultimoDiaDelMes(anio, mes));
  if (!vigente) return { ...base, perfil: 'sin_perfil', calendario: 'pendiente_activar', filas: [] };

  const obligaciones = derivarObligaciones(vigente, corte);
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

  const filas = await Promise.all(
    obligaciones.map(async (o): Promise<FilaCentro> => {
      const vencimiento = vencimientoDe(o, perfil.empresa.nit, calendario);
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
      return { obligacion: o, vencimiento, valor };
    }),
  );

  return { ...base, perfil: 'activo', calendario: calendario === null ? 'pendiente_activar' : 'activo', filas };
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
    return Response.json({ error: err.codigo, codigo: err.codigo }, { status: err.status, headers: SIN_CACHE });
  }
  const e = err as { statusCode?: unknown; code?: unknown; message?: unknown } | null;
  if (e && typeof e.statusCode === 'number') {
    return Response.json({ error: String(e.message ?? 'error'), codigo: String(e.code ?? 'error') }, { status: e.statusCode, headers: SIN_CACHE });
  }
  console.error(`[${ruta}]`, err instanceof Error ? err.message : (e?.code ?? 'error'));
  return Response.json({ error: 'desconocido', codigo: 'desconocido' }, { status: 500, headers: SIN_CACHE });
}
