/**
 * Plantillas y rotaciones de turno (Figma 20.8, pestañas «Plantillas» y
 * «Rotaciones»).
 *
 * Se leen y se escriben con el cliente de la SESIÓN: la RLS de
 * `shift_templates` y `shift_rotations` ya exige `hr.attendance.manage` para
 * escribir y pertenencia para leer (ADR-002 §2). La rotación la valida además el
 * trigger `fn_hr_rotacion_validar` (plantillas de la misma organización).
 *
 * La plantilla guarda horas, no recargos: las nocturnas se calculan con el
 * parámetro vigente (`nocturno_hora_inicio` / `_fin`, `fn_hr_parametro`).
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { zonaHorariaEnServidor } from '@/lib/utils/zonaHorariaServidor';
import { addPlainDays, todayInTz } from '@/lib/utils/dateCore';
import { HrmError, errorDeRpc, esUuid } from './tipos';

export type ContextoPlantillas = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'supabase'>;

export type { PlantillaTurno, RotacionTurno } from '@/lib/hrm/turnos/programacion';
import type { PlantillaTurno, RotacionTurno } from '@/lib/hrm/turnos/programacion';

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function hhmm(t: string | null | undefined): string {
  return (t ?? '').slice(0, 5);
}

function diasValidos(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return Array.from(new Set(v.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7))).sort((a, b) => a - b);
}

/** Parámetros vigentes hoy de la franja nocturna (horas enteras, p. ej. 19 y 6). */
async function franjaNocturna(ctx: ContextoPlantillas, hoy: string): Promise<{ inicio: number | null; fin: number | null }> {
  const sc = getServiceClient();
  const [a, b] = await Promise.all([
    sc.rpc('fn_hr_parametro', { p_org: ctx.organizationId, p_code: 'nocturno_hora_inicio', p_fecha: hoy }),
    sc.rpc('fn_hr_parametro', { p_org: ctx.organizationId, p_code: 'nocturno_hora_fin', p_fecha: hoy }),
  ]);
  const num = (r: { data: unknown; error: unknown }) => (r.error || r.data === null || r.data === undefined ? null : Number(r.data));
  return { inicio: num(a), fin: num(b) };
}

async function puedeGestionar(ctx: ContextoPlantillas): Promise<boolean> {
  const { data, error } = await getServiceClient().rpc('fn_hr_puede_actor', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_code: 'hr.attendance.manage',
  });
  return !error && data === true;
}

export async function listarPlantillas(
  ctx: ContextoPlantillas
): Promise<{ plantillas: PlantillaTurno[]; nocturno: { inicio: number | null; fin: number | null }; puede_gestionar: boolean }> {
  const zona = await zonaHorariaEnServidor(ctx, null);
  const hoy = todayInTz(zona);
  const [t, uso, noc, puede] = await Promise.all([
    ctx.supabase
      .from('shift_templates')
      .select('id, name, start_time, end_time, break_minutes, paid_break, is_active, metadata')
      .eq('organization_id', ctx.organizationId)
      .order('start_time'),
    // «En uso»: personas con la plantilla en las últimas 4 semanas o en adelante.
    ctx.supabase
      .from('shift_assignments')
      .select('shift_template_id, employment_id')
      .eq('organization_id', ctx.organizationId)
      .not('shift_template_id', 'is', null)
      .gte('work_date', addPlainDays(hoy, -28))
      .limit(5000),
    franjaNocturna(ctx, hoy),
    puedeGestionar(ctx),
  ]);
  if (t.error) throw errorDeRpc(t.error);
  const personas = new Map<string, Set<string>>();
  for (const f of (uso.data ?? []) as Array<{ shift_template_id: string; employment_id: string }>) {
    if (!personas.has(f.shift_template_id)) personas.set(f.shift_template_id, new Set());
    personas.get(f.shift_template_id)!.add(f.employment_id);
  }
  const plantillas = (
    (t.data ?? []) as Array<{
      id: string;
      name: string;
      start_time: string;
      end_time: string;
      break_minutes: number | null;
      paid_break: boolean | null;
      is_active: boolean | null;
      metadata: { dias?: unknown } | null;
    }>
  ).map((p) => ({
    id: p.id,
    nombre: p.name,
    hora_inicio: hhmm(p.start_time),
    hora_fin: hhmm(p.end_time),
    descanso_min: p.break_minutes ?? 0,
    descanso_pagado: p.paid_break === true,
    activa: p.is_active !== false,
    dias: diasValidos(p.metadata?.dias),
    en_uso: personas.get(p.id)?.size ?? 0,
  }));
  return { plantillas, nocturno: noc, puede_gestionar: puede };
}

function datosPlantilla(body: unknown) {
  if (!body || typeof body !== 'object') throw new HrmError(400, 'datos_invalidos');
  const b = body as Record<string, unknown>;
  const nombre = typeof b.nombre === 'string' ? b.nombre.trim().slice(0, 80) : '';
  if (!nombre) throw new HrmError(422, 'nombre_requerido');
  if (typeof b.hora_inicio !== 'string' || !HORA_RE.test(b.hora_inicio) || typeof b.hora_fin !== 'string' || !HORA_RE.test(b.hora_fin)) {
    throw new HrmError(422, 'hora_invalida');
  }
  if (b.hora_inicio === b.hora_fin) throw new HrmError(422, 'hora_invalida');
  const descanso = typeof b.descanso_min === 'number' && Number.isInteger(b.descanso_min) ? b.descanso_min : 0;
  if (descanso < 0 || descanso > 720) throw new HrmError(422, 'descanso_invalido');
  return {
    name: nombre,
    start_time: b.hora_inicio,
    end_time: b.hora_fin,
    break_minutes: descanso,
    paid_break: b.descanso_pagado === true,
    is_night_shift: b.hora_fin <= b.hora_inicio,
    metadata: { dias: diasValidos(b.dias) },
  };
}

export async function crearPlantilla(ctx: ContextoPlantillas, body: unknown): Promise<{ id: string }> {
  const d = datosPlantilla(body);
  const { data, error } = await ctx.supabase
    .from('shift_templates')
    .insert({ ...d, organization_id: ctx.organizationId, is_active: true })
    .select('id')
    .single();
  if (error) throw errorDeRpc(error);
  return data as { id: string };
}

/** Cambia la plantilla, o solo la activa o desactiva con `{ activa }`. */
export async function actualizarPlantilla(ctx: ContextoPlantillas, id: string, body: unknown): Promise<{ id: string }> {
  if (!esUuid(id)) throw new HrmError(400, 'plantilla_invalida');
  const b = (body ?? {}) as Record<string, unknown>;
  const cambios = Object.keys(b).length === 1 && typeof b.activa === 'boolean' ? { is_active: b.activa } : datosPlantilla(body);
  const { data, error } = await ctx.supabase
    .from('shift_templates')
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .select('id')
    .maybeSingle();
  if (error) throw errorDeRpc(error);
  if (!data) throw new HrmError(404, 'no_existe');
  return data as { id: string };
}

export async function listarRotaciones(
  ctx: ContextoPlantillas
): Promise<{ rotaciones: RotacionTurno[]; plantillas: Array<{ id: string; nombre: string }>; puede_gestionar: boolean }> {
  const [r, t, uso, puede] = await Promise.all([
    ctx.supabase
      .from('shift_rotations')
      .select('id, name, description, cycle_days, pattern, is_active')
      .eq('organization_id', ctx.organizationId)
      .order('name'),
    ctx.supabase.from('shift_templates').select('id, name').eq('organization_id', ctx.organizationId),
    ctx.supabase
      .from('shift_assignments')
      .select('shift_rotation_id, employment_id, work_date')
      .eq('organization_id', ctx.organizationId)
      .not('shift_rotation_id', 'is', null)
      .limit(5000),
    puedeGestionar(ctx),
  ]);
  if (r.error) throw errorDeRpc(r.error);
  const resumen = new Map<string, { personas: Set<string>; min: string | null; max: string | null }>();
  for (const f of (uso.data ?? []) as Array<{ shift_rotation_id: string; employment_id: string; work_date: string }>) {
    const x = resumen.get(f.shift_rotation_id) ?? { personas: new Set<string>(), min: null, max: null };
    x.personas.add(f.employment_id);
    if (!x.min || f.work_date < x.min) x.min = f.work_date;
    if (!x.max || f.work_date > x.max) x.max = f.work_date;
    resumen.set(f.shift_rotation_id, x);
  }
  const rotaciones = (
    (r.data ?? []) as Array<{ id: string; name: string; description: string | null; cycle_days: number; pattern: unknown; is_active: boolean | null }>
  ).map((x) => {
    const u = resumen.get(x.id);
    return {
      id: x.id,
      nombre: x.name,
      descripcion: x.description,
      ciclo_dias: x.cycle_days,
      patron: Array.isArray(x.pattern) ? (x.pattern as unknown[]).map((p) => (typeof p === 'string' ? p : null)) : [],
      activa: x.is_active !== false,
      personas: u?.personas.size ?? 0,
      empezo: u?.min ?? null,
      ultima_generada: u?.max ?? null,
    };
  });
  return {
    rotaciones,
    plantillas: ((t.data ?? []) as Array<{ id: string; name: string }>).map((p) => ({ id: p.id, nombre: p.name })),
    puede_gestionar: puede,
  };
}

function datosRotacion(body: unknown) {
  if (!body || typeof body !== 'object') throw new HrmError(400, 'datos_invalidos');
  const b = body as Record<string, unknown>;
  const nombre = typeof b.nombre === 'string' ? b.nombre.trim().slice(0, 80) : '';
  if (!nombre) throw new HrmError(422, 'nombre_requerido');
  if (!Array.isArray(b.patron) || b.patron.length < 1 || b.patron.length > 56) throw new HrmError(422, 'patron_invalido');
  const patron = b.patron.map((p) => (p === null || p === '' ? null : p));
  if (!patron.every((p) => p === null || esUuid(p))) throw new HrmError(422, 'patron_invalido');
  return {
    name: nombre,
    description: typeof b.descripcion === 'string' ? b.descripcion.trim().slice(0, 300) || null : null,
    cycle_days: patron.length,
    pattern: patron,
  };
}

export async function crearRotacion(ctx: ContextoPlantillas, body: unknown): Promise<{ id: string }> {
  const d = datosRotacion(body);
  const { data, error } = await ctx.supabase
    .from('shift_rotations')
    .insert({ ...d, organization_id: ctx.organizationId, is_active: true })
    .select('id')
    .single();
  if (error) throw errorDeRpc(error);
  return data as { id: string };
}

/** Cambia la rotación, o solo la pausa o reanuda con `{ activa }`. */
export async function actualizarRotacion(ctx: ContextoPlantillas, id: string, body: unknown): Promise<{ id: string }> {
  if (!esUuid(id)) throw new HrmError(400, 'rotacion_invalida');
  const b = (body ?? {}) as Record<string, unknown>;
  const cambios = Object.keys(b).length === 1 && typeof b.activa === 'boolean' ? { is_active: b.activa } : datosRotacion(body);
  const { data, error } = await ctx.supabase
    .from('shift_rotations')
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .select('id')
    .maybeSingle();
  if (error) throw errorDeRpc(error);
  if (!data) throw new HrmError(404, 'no_existe');
  return data as { id: string };
}
