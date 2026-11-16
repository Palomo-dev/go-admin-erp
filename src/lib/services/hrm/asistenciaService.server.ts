/**
 * Asistencia, horas extra y recargos y novedades de RR. HH. (Figma 20.10–20.12,
 * ADR-002 §2–§4).
 *
 * Lecturas: RPC `fn_hr_asistencia_*` con la service role y el actor de
 * `getServerOrgContext()`; el alcance (toda la organización, su equipo o nada)
 * lo resuelve la base. Escrituras:
 * - el ajuste de una marca nace pendiente de aprobación (`fn_hr_ajuste_solicitar`);
 * - aprobar o rechazar va por `fn_hr_aprobacion_decidir` con la sesión del usuario
 *   (aprobador o delegado; nunca lo propio);
 * - un ajuste aprobado se aplica sin sesión (`fn_hr_ajustes_aplicar`) para que la
 *   marca quede con la hora pedida, y el día se vuelve a clasificar con el motor;
 * - «lista para nómina» va por `fn_hr_jornada_lista_nomina` (solo `hr.attendance.manage`).
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { decidir, type Decision } from './aprobacionesService.server';
import { marcarListaParaNomina, recalcularDia, type ResultadoListaNomina } from './jornadaService.server';
import { HrmError, errorDeRpc, esFechaPlana, esUuid } from './tipos';

export type ContextoAsistencia = Pick<ServerOrgContext, 'userId' | 'organizationId'>;
export type ContextoAsistenciaSesion = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'supabase'>;

const TIPOS_MARCA = new Set(['check_in', 'check_out', 'break_start', 'break_end']);
const MAX_DECISIONES = 100;
const MAX_RECLASIFICAR = 200;

function cliente() {
  return getServiceClient();
}

/** Sede del selector del header: entero positivo o nada (la RPC comprueba que sea de la organización). */
export function sedeDeQuery(v: string | null): number | null {
  if (v === null || v === '' || v === 'todas') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HrmError(400, 'sede_invalida');
  return n;
}

function rango(desde: string, hasta: string): void {
  if (!esFechaPlana(desde) || !esFechaPlana(hasta) || hasta < desde) throw new HrmError(400, 'fecha_invalida');
}

async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await cliente().rpc(nombre, args);
  if (error) throw errorDeRpc(error);
  return data as T;
}

export function hoy(ctx: ContextoAsistencia, sede: number | null) {
  return rpc<Record<string, unknown>>('fn_hr_asistencia_hoy', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_branch: sede,
  });
}

export function hojas(ctx: ContextoAsistencia, desde: string, hasta: string, sede: number | null) {
  rango(desde, hasta);
  return rpc<Record<string, unknown>>('fn_hr_asistencia_hojas', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_desde: desde,
    p_hasta: hasta,
    p_branch: sede,
  });
}

export function hoja(ctx: ContextoAsistencia, vinculoId: string, desde: string, hasta: string) {
  if (!esUuid(vinculoId)) throw new HrmError(400, 'vinculo_invalido');
  rango(desde, hasta);
  return rpc<Record<string, unknown>>('fn_hr_asistencia_hoja', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_employment: vinculoId,
    p_desde: desde,
    p_hasta: hasta,
  });
}

export function topes(ctx: ContextoAsistencia, desde: string, hasta: string, sede: number | null) {
  rango(desde, hasta);
  return rpc<Record<string, unknown>>('fn_hr_asistencia_topes', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_desde: desde,
    p_hasta: hasta,
    p_branch: sede,
  });
}

export function novedades(ctx: ContextoAsistencia, desde: string, hasta: string, sede: number | null) {
  rango(desde, hasta);
  return rpc<Record<string, unknown>>('fn_hr_asistencia_novedades', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_desde: desde,
    p_hasta: hasta,
    p_branch: sede,
  });
}

export function aprobadorDeAjuste(ctx: ContextoAsistencia, vinculoId: string) {
  if (!esUuid(vinculoId)) throw new HrmError(400, 'vinculo_invalido');
  return rpc<{ tipo: string | null; nombres: string[]; pasos?: number }>('fn_hr_ajuste_aprobador', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_employment: vinculoId,
  });
}

function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** Valida el cuerpo del ajuste; la hora llega como instante ISO con zona (la arma el navegador con la zona de la sede). */
export function datosDeAjuste(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') throw new HrmError(400, 'datos_invalidos');
  const b = body as Record<string, unknown>;
  if (!esUuid(b.vinculo_id)) throw new HrmError(400, 'vinculo_invalido');
  if (!esFechaPlana(b.fecha)) throw new HrmError(400, 'fecha_invalida');
  if (typeof b.tipo !== 'string' || !TIPOS_MARCA.has(b.tipo)) throw new HrmError(400, 'tipo_invalido');
  if (typeof b.hora !== 'string' || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(b.hora) || Number.isNaN(Date.parse(b.hora))) {
    throw new HrmError(400, 'hora_invalida');
  }
  const motivo = texto(b.motivo, 500);
  if (!motivo || motivo.length < 5) throw new HrmError(422, 'motivo_requerido');
  return {
    employment_id: b.vinculo_id,
    fecha: b.fecha,
    tipo: b.tipo,
    hora: new Date(b.hora).toISOString(),
    motivo,
    nota: texto(b.nota, 500),
  };
}

export async function solicitarAjuste(ctx: ContextoAsistencia, body: unknown) {
  return rpc<{ id: string; estado: string; instancia_id: string | null }>('fn_hr_ajuste_solicitar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_datos: datosDeAjuste(body),
  });
}

/** Aplica los ajustes aprobados y reclasifica sus días. Un día que no se pueda reclasificar queda «sin clasificar». */
export async function aplicarAjustes(ctx: ContextoAsistencia): Promise<number> {
  const aplicados = await rpc<Array<{ employment_id: string; fecha: string }>>('fn_hr_ajustes_aplicar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
  });
  const dias = Array.isArray(aplicados) ? aplicados : [];
  for (const d of dias.slice(0, MAX_RECLASIFICAR)) {
    try {
      await recalcularDia(ctx, d.employment_id, d.fecha);
    } catch {
      // Sin `hr.attendance.manage` el motor no se puede correr con este actor: lo hace «lista para nómina».
    }
  }
  return dias.length;
}

export interface ResultadoDecisiones {
  decididas: number;
  fallidas: Array<{ instancia_id: string; codigo: string }>;
}

/** Aprueba o rechaza varias novedades (o ajustes) con la sesión del usuario. */
export async function decidirNovedades(ctx: ContextoAsistenciaSesion, body: unknown): Promise<ResultadoDecisiones> {
  const b = (body ?? {}) as {
    instancias?: unknown;
    decision?: unknown;
    comentario?: unknown;
  };
  if (b.decision !== 'aprobar' && b.decision !== 'rechazar') throw new HrmError(422, 'decision_invalida');
  const ids = Array.isArray(b.instancias) ? b.instancias : [];
  if (ids.length === 0 || ids.length > MAX_DECISIONES || !ids.every(esUuid)) throw new HrmError(400, 'instancias_invalidas');
  const comentario = texto(b.comentario, 2000);
  if (b.decision === 'rechazar' && (!comentario || comentario.length < 3)) throw new HrmError(422, 'motivo_requerido');
  const out: ResultadoDecisiones = { decididas: 0, fallidas: [] };
  for (const id of Array.from(new Set(ids as string[]))) {
    try {
      await decidir(ctx, id, b.decision as Decision, comentario);
      out.decididas++;
    } catch (e) {
      out.fallidas.push({
        instancia_id: id,
        codigo: e instanceof HrmError ? e.code : 'error_hrm',
      });
    }
  }
  if (b.decision === 'aprobar' && out.decididas > 0) {
    try {
      await aplicarAjustes(ctx);
    } catch {
      // El job `hrm-aplicar-ajustes` lo reintenta cada 5 minutos.
    }
  }
  return out;
}

/**
 * «Lista para nómina» del período: aplica los ajustes aprobados, reclasifica los
 * días que quedaron sin clasificar y marca el resto. Lo que no pudo, con su motivo.
 */
export async function marcarPeriodoListo(
  ctx: ContextoAsistencia,
  desde: string,
  hasta: string,
  vinculos?: string[] | null
): Promise<ResultadoListaNomina> {
  rango(desde, hasta);
  await aplicarAjustes(ctx);
  let r = await marcarListaParaNomina(ctx, desde, hasta, vinculos);
  const sinClasificar = r.pendientes.filter((p) => p.motivo === 'sin_clasificar').slice(0, MAX_RECLASIFICAR);
  if (sinClasificar.length === 0) return r;
  for (const p of sinClasificar) {
    try {
      await recalcularDia(ctx, p.employment_id, p.fecha);
    } catch (e) {
      if (e instanceof HrmError && e.code === 'parametro_no_configurado') throw e;
    }
  }
  const segunda = await marcarListaParaNomina(ctx, desde, hasta, vinculos);
  r = { listas: r.listas + segunda.listas, pendientes: segunda.pendientes };
  return r;
}
