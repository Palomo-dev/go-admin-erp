/**
 * Envíos programados de reportes en el servidor (decisión 11 del plan v2).
 *
 * Quién ve y edita qué:
 * - Cada persona, los suyos, con su cliente (RLS `auth.uid() = user_id`).
 * - Un administrador (`hasOrgAdminOrPermission`), los de toda la
 *   organización: con el service role y SIEMPRE filtrando por la organización
 *   de la sesión. Es el único que aprueba correos externos.
 *
 * Al crear o editar, el reporte y la sucursal se validan contra el plan y el
 * alcance de quien programa: nadie programa lo que no puede ver. Cada
 * destinatario miembro se vuelve a validar en cada envío con SU sesión.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { hasOrgAdminOrPermission, type ServerOrgContext } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { resolveTimezoneCascade } from '@/lib/utils/branchTimezoneCascade';
import { todayInTz } from '@/lib/utils/dateCore';
import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { exigirReporteDisponible, resolverAccesoReportes, sucursalDelReporte } from '../acceso.server';
import type { CuerpoProgramado, AccionProgramado } from '../contrato';
import { registrarEventoReporte } from '../historialService';
import { getReporteById } from '../reportesCatalogo';
import { archivosParaMiembro } from './archivosMiembro.server';
import { enviarCorreoReporte, idiomaDe } from './envio.server';
import {
  esFormatoEnvio,
  esFrecuencia,
  leerDestinatarios,
  leerFiltros,
  nombreDePerfil,
  periodoDelEnvio,
  proximoEnvio,
  type Destinatario,
  type FiltrosEnvio,
  type FormatoEnvio,
  type Frecuencia,
  type Programacion,
} from './programacion';

export const COLUMNAS_PROGRAMADO =
  'id, organization_id, user_id, name, frequency, recipients, next_run_at, is_active, report_id, filtros, branch_id, formato, hora, dia, dias_semana, zona_horaria, last_run_at, last_status, last_error, created_at';

export interface FilaProgramado {
  id: string;
  organization_id: number;
  user_id: string;
  name: string;
  frequency: string;
  recipients: unknown;
  next_run_at: string | null;
  is_active: boolean | null;
  report_id: string | null;
  filtros: unknown;
  branch_id: number | null;
  formato: string;
  hora: string;
  dia: number | null;
  dias_semana: number[] | null;
  zona_horaria: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  created_at: string | null;
}

export interface ProgramadoVista {
  id: string;
  nombre: string;
  reportId: string | null;
  reporteTitulo: string | null;
  frecuencia: Frecuencia;
  hora: string;
  dia: number | null;
  diasSemana: number[] | null;
  filtros: FiltrosEnvio;
  sucursalId: number | null;
  formato: FormatoEnvio;
  destinatarios: Destinatario[];
  activo: boolean;
  proximoEnvio: string | null;
  ultimoEnvio: string | null;
  ultimoEstado: string | null;
  ultimoError: string | null;
  zona: string;
  creador: { id: string; nombre: string | null };
  propio: boolean;
}

type Ctx = Pick<ServerOrgContext, 'userId' | 'userEmail' | 'organizationId' | 'organizationName' | 'roleId' | 'isSuperAdmin' | 'memberId' | 'supabase'>;

export function programacionDe(f: Pick<FilaProgramado, 'frequency' | 'hora' | 'dia' | 'dias_semana' | 'zona_horaria'>): Programacion {
  return {
    frequency: esFrecuencia(f.frequency) ? f.frequency : 'daily',
    hora: (f.hora ?? '07:00').slice(0, 5),
    dia: f.dia,
    dias_semana: f.dias_semana,
    zona: resolveTimezoneCascade({ branchTimezone: null, organizationTimezone: f.zona_horaria }).timezone,
  };
}

function vistaDe(f: FilaProgramado, ctx: Pick<Ctx, 'userId'>, nombres: Map<string, string | null>): ProgramadoVista {
  const prog = programacionDe(f);
  return {
    id: f.id,
    nombre: f.name,
    reportId: f.report_id,
    reporteTitulo: f.report_id ? (getReporteById(f.report_id)?.titulo ?? null) : null,
    frecuencia: prog.frequency,
    hora: prog.hora,
    dia: f.dia,
    diasSemana: f.dias_semana,
    filtros: leerFiltros(f.filtros, prog.frequency),
    sucursalId: f.branch_id,
    formato: esFormatoEnvio(f.formato) ? f.formato : 'pdf',
    destinatarios: leerDestinatarios(f.recipients),
    activo: f.is_active === true,
    proximoEnvio: f.is_active ? f.next_run_at : null,
    ultimoEnvio: f.last_run_at,
    ultimoEstado: f.last_status,
    ultimoError: f.last_error,
    zona: prog.zona,
    creador: { id: f.user_id, nombre: nombres.get(f.user_id) ?? null },
    propio: f.user_id === ctx.userId,
  };
}

async function esAdmin(ctx: Ctx): Promise<boolean> {
  return hasOrgAdminOrPermission(ctx);
}

interface Perfil {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  preferred_language?: string | null;
}

async function perfiles(client: SupabaseClient, ids: string[], conIdioma = false): Promise<Map<string, Perfil>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const { data, error } = await client
    .from('profiles')
    .select(conIdioma ? 'id, email, first_name, last_name, preferred_language' : 'id, email, first_name, last_name')
    .in('id', unicos);
  if (error) throw new Error(`No se pudieron leer los perfiles: ${error.message}`);
  return new Map(((data ?? []) as unknown as Perfil[]).map((p) => [p.id, p]));
}

/** Miembros activos de la organización entre `ids` (con el cliente de la sesión). */
async function miembrosActivos(ctx: Ctx, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await ctx.supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', ctx.organizationId)
    .eq('is_active', true)
    .in('user_id', ids);
  if (error) throw new Error(`No se pudieron leer los miembros: ${error.message}`);
  return new Set(((data ?? []) as { user_id: string }[]).map((m) => m.user_id));
}

async function destinatariosDe(ctx: Ctx, datos: CuerpoProgramado, previos: Destinatario[], admin: boolean): Promise<Destinatario[]> {
  const ids = [...new Set(datos.miembros)];
  const [activos, porId] = await Promise.all([miembrosActivos(ctx, ids), perfiles(ctx.supabase, ids)]);
  const ajenos = ids.filter((id) => !activos.has(id) || !porId.get(id)?.email);
  if (ajenos.length > 0) throw new OrgContextError('Algún destinatario no es miembro activo de la organización o no tiene correo', 400, 'destinatario_invalido');

  const miembros: Destinatario[] = ids.map((id) => {
    const p = porId.get(id) as Perfil;
    return { tipo: 'miembro', user_id: id, email: p.email as string, nombre: nombreDePerfil(p), estado: 'activo', motivo: null };
  });
  const externos: Destinatario[] = [...new Set(datos.externos)].map((email) => {
    const previo = previos.find((d) => d.tipo === 'externo' && d.email === email);
    if (previo && previo.tipo === 'externo' && previo.estado !== 'pendiente') return previo;
    return admin
      ? { tipo: 'externo', email, estado: 'activo', aprobado_por: ctx.userId, motivo: null }
      : { tipo: 'externo', email, estado: 'pendiente', aprobado_por: null, motivo: null };
  });
  return [...miembros, ...externos];
}

async function zonaDeOrganizacion(ctx: Ctx): Promise<string> {
  const { data } = await ctx.supabase.from('organizations').select('timezone').eq('id', ctx.organizationId).maybeSingle();
  return resolveTimezoneCascade({ branchTimezone: null, organizationTimezone: (data as { timezone?: string | null } | null)?.timezone ?? null }).timezone;
}

/** Columnas de la fila a partir del cuerpo, validando reporte, sucursal y destinatarios. */
async function columnasDe(ctx: Ctx, datos: CuerpoProgramado, previos: Destinatario[], ahora: Date) {
  const acceso = await resolverAccesoReportes({ ...ctx, memberId: ctx.memberId ?? undefined });
  const { def } = exigirReporteDisponible(acceso, datos.reportId);
  const branchId = sucursalDelReporte(acceso, def, datos.sucursalId);
  const [admin, zona] = await Promise.all([esAdmin(ctx), zonaDeOrganizacion(ctx)]);
  const recipients = await destinatariosDe(ctx, datos, previos, admin);
  const filtros: FiltrosEnvio = {
    periodo: datos.periodo,
    horaInicio: def.filtros.includes('franja') ? (datos.horaInicio ?? null) : null,
    horaFin: def.filtros.includes('franja') ? (datos.horaFin ?? null) : null,
    comparar: def.filtros.includes('comparativo') ? (datos.comparar ?? null) : null,
    vista: datos.vista ?? null,
  };
  const prog: Programacion = { frequency: datos.frecuencia, hora: datos.hora, dia: datos.dia ?? null, dias_semana: datos.diasSemana ?? null, zona };
  const siguiente = proximoEnvio(prog, ahora);
  return {
    def,
    columnas: {
      name: datos.nombre,
      report_id: def.id,
      frequency: datos.frecuencia,
      hora: datos.hora,
      dia: ['weekly', 'monthly', 'quarterly'].includes(datos.frecuencia) ? (datos.dia ?? null) : null,
      dias_semana: datos.frecuencia === 'custom' ? [...new Set(datos.diasSemana ?? [])].sort((a, b) => a - b) : null,
      filtros,
      branch_id: branchId,
      formato: datos.formato,
      recipients,
      zona_horaria: zona,
      next_run_at: siguiente ? siguiente.toISOString() : null,
    },
  };
}

export async function listarProgramados(ctx: Ctx): Promise<ProgramadoVista[]> {
  const admin = await esAdmin(ctx);
  const client = admin ? getServiceClient() : ctx.supabase;
  let q = client.from('scheduled_reports').select(COLUMNAS_PROGRAMADO).eq('organization_id', ctx.organizationId);
  if (!admin) q = q.eq('user_id', ctx.userId);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error(`No se pudieron leer los envíos programados: ${error.message}`);
  const filas = (data ?? []) as unknown as FilaProgramado[];
  const nombres = await perfiles(ctx.supabase, filas.map((f) => f.user_id));
  const porNombre = new Map([...nombres].map(([id, p]) => [id, nombreDePerfil(p)]));
  return filas.map((f) => vistaDe(f, ctx, porNombre));
}

/** La fila con el cliente con el que se puede escribir: la propia con RLS, la ajena (admin) con service role. */
async function cargarProgramado(ctx: Ctx, id: string): Promise<{ fila: FilaProgramado; client: SupabaseClient; admin: boolean }> {
  const admin = await esAdmin(ctx);
  const client = admin ? getServiceClient() : ctx.supabase;
  let q = client.from('scheduled_reports').select(COLUMNAS_PROGRAMADO).eq('id', id).eq('organization_id', ctx.organizationId);
  if (!admin) q = q.eq('user_id', ctx.userId);
  const { data, error } = await q.maybeSingle();
  if (error || !data) throw new OrgContextError('No encontrado', 404, 'no_encontrado');
  return { fila: data as unknown as FilaProgramado, client, admin };
}

async function nombresDe(ctx: Ctx, ids: string[]): Promise<Map<string, string | null>> {
  const p = await perfiles(ctx.supabase, ids);
  return new Map([...p].map(([id, perfil]) => [id, nombreDePerfil(perfil)]));
}

export async function crearProgramado(ctx: Ctx, datos: CuerpoProgramado, ahora: Date = new Date()): Promise<ProgramadoVista> {
  const { def, columnas } = await columnasDe(ctx, datos, [], ahora);
  const { data, error } = await ctx.supabase
    .from('scheduled_reports')
    .insert({ ...columnas, organization_id: ctx.organizationId, user_id: ctx.userId, is_active: columnas.next_run_at !== null })
    .select(COLUMNAS_PROGRAMADO)
    .single();
  if (error || !data) throw new Error(`No se pudo guardar el envío programado: ${error?.message ?? 'sin fila'}`);
  await registrarEventoReporte(ctx.supabase, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    reportId: def.id,
    modulo: def.modulo,
    accion: 'programar',
    filtros: { frecuencia: datos.frecuencia, formato: datos.formato, periodo: datos.periodo },
    branchId: columnas.branch_id,
  });
  return vistaDe(data as unknown as FilaProgramado, ctx, await nombresDe(ctx, [ctx.userId]));
}

export async function actualizarProgramado(ctx: Ctx, id: string, accion: AccionProgramado, ahora: Date = new Date()): Promise<ProgramadoVista> {
  const { fila, client, admin } = await cargarProgramado(ctx, id);
  const previos = leerDestinatarios(fila.recipients);
  let cambios: Record<string, unknown>;
  switch (accion.accion) {
    case 'pausar':
      cambios = { is_active: false };
      break;
    case 'reanudar': {
      const siguiente = proximoEnvio(programacionDe(fila), ahora);
      cambios = {
        is_active: siguiente !== null,
        next_run_at: siguiente?.toISOString() ?? null,
        recipients: previos.map((d) => (d.tipo === 'miembro' && d.estado === 'pausado' ? { ...d, estado: 'activo', motivo: null } : d)),
      };
      break;
    }
    case 'aprobar': {
      if (!admin) throw new OrgContextError('Solo un administrador aprueba correos externos', 403, 'ADMIN_REQUIRED');
      const correos = new Set(accion.correos);
      cambios = {
        recipients: previos.map((d) =>
          d.tipo === 'externo' && correos.has(d.email) && d.estado !== 'activo' ? { ...d, estado: 'activo', aprobado_por: ctx.userId, motivo: null } : d,
        ),
      };
      break;
    }
    case 'editar': {
      const { columnas } = await columnasDe(ctx, accion.datos, previos, ahora);
      cambios = { ...columnas, is_active: columnas.next_run_at !== null };
      break;
    }
  }
  const { data, error } = await client
    .from('scheduled_reports')
    .update({ ...cambios, updated_at: ahora.toISOString() })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .select(COLUMNAS_PROGRAMADO)
    .single();
  if (error || !data) throw new Error(`No se pudo actualizar el envío programado: ${error?.message ?? 'sin fila'}`);
  return vistaDe(data as unknown as FilaProgramado, ctx, await nombresDe(ctx, [fila.user_id]));
}

export async function eliminarProgramado(ctx: Ctx, id: string): Promise<void> {
  const { client } = await cargarProgramado(ctx, id);
  const { error } = await client.from('scheduled_reports').delete().eq('id', id).eq('organization_id', ctx.organizationId);
  if (error) throw new Error(`No se pudo eliminar el envío programado: ${error.message}`);
}

/**
 * Envío de prueba SOLO a quien lo pide, con SU sesión: ve lo que su alcance
 * le deja ver, aunque el envío sea de otra persona (admin).
 */
export async function enviarPrueba(ctx: Ctx, id: string, ahora: Date = new Date()): Promise<{ para: string }> {
  const { fila } = await cargarProgramado(ctx, id);
  if (!ctx.userEmail) throw new OrgContextError('Tu usuario no tiene correo', 400, 'sin_correo');
  if (!fila.report_id) throw new OrgContextError('El envío no tiene reporte', 400, 'sin_reporte');
  const prog = programacionDe(fila);
  const filtros = leerFiltros(fila.filtros, prog.frequency);
  const periodo = periodoDelEnvio(filtros, todayInTz(prog.zona));
  const [perfil, moneda] = await Promise.all([perfiles(ctx.supabase, [ctx.userId], true), resolverContextoMoneda(ctx.supabase, ctx.organizationId)]);
  const yo = perfil.get(ctx.userId);
  const idioma = idiomaDe(yo?.preferred_language);
  const archivos = await archivosParaMiembro(
    { ...ctx, memberId: ctx.memberId ?? undefined },
    { reportId: fila.report_id, branchId: fila.branch_id, formato: esFormatoEnvio(fila.formato) ? fila.formato : 'pdf', filtros, periodo, zona: prog.zona },
    idioma,
  );
  await enviarCorreoReporte(
    {
      organizationId: ctx.organizationId,
      organizationName: ctx.organizationName,
      creador: { userId: ctx.userId, email: ctx.userEmail, nombre: nombreDePerfil(yo) },
      para: ctx.userEmail,
      nombreDestinatario: nombreDePerfil(yo),
      externo: false,
      nombreEnvio: fila.name,
      programadoId: fila.id,
      archivos,
      periodo,
      idioma,
      zona: prog.zona,
      moneda,
      clave: `reporte-prueba:${fila.id}:${ctx.userId}:${ahora.getTime()}`,
      prueba: true,
    },
    getServiceClient(),
  );
  return { para: ctx.userEmail };
}
