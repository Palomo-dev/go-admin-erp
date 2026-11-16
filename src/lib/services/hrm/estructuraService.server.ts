/**
 * Recursos humanos › Estructura (fase 1, Figma 20.1): áreas, cargos, escalas
 * salariales y plazas. Migración `hrm_f1_02_estructura`.
 *
 * Todas las RPC con `p_actor` solo las ejecuta la service role: el permiso se
 * resuelve en la base con el actor de la sesión (`ctx.userId`) y la
 * organización de `getServerOrgContext()`. Las escalas son del grupo
 * `salario_pago`: cada lectura y cada escritura deja su fila en
 * `hr_access_log` con la IP de la petición original, y sin el permiso la base
 * responde 42501 y registra el intento.
 *
 * Para la ficha, el alta y «Registrar un cambio» (agente de empleados):
 * - `escalaVigente({ ctx, cargoId, sedeId }, peticion?)` → la escala que aplica
 *   al cargo en la sede (la de la sede o, si no hay, la de todas las sedes), o
 *   `null` si el cargo no tiene. Lanza `HrmError(403)` sin permiso de salario.
 * - `plazaDisponible({ ctx, cargoId, sedeId })` → aprobadas y ocupadas del área
 *   del cargo en la sede, o `null` si esa área no tiene presupuesto ahí.
 * - `posicionEnEscala(salario, escala)` en `@/lib/hrm/estructura/logica`.
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { HrmError, errorDeRpc, esFechaPlana, esUuid, type ContextoPeticion } from './tipos';
import type {
  DatosArea,
  DatosSolicitudPlaza,
  PlanPlaza,
  RespuestaAreas,
  RespuestaCargo,
  RespuestaCargos,
  RespuestaPlazas,
} from '@/lib/hrm/estructura/tipos';

export type ContextoEstructura = Pick<ServerOrgContext, 'userId' | 'organizationId'>;

const SIN_PETICION: ContextoPeticion = { ip: null, userAgent: null, ruta: null };

async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getServiceClient().rpc(nombre, args);
  if (error) throw errorDeRpc(error);
  return data as T;
}

function actor(ctx: ContextoEstructura) {
  return { p_actor: ctx.userId, p_org: ctx.organizationId };
}

function peticion(p: ContextoPeticion) {
  return { p_ip: p.ip, p_ua: p.userAgent, p_ruta: p.ruta };
}

function uuid(v: unknown, codigo: string): string {
  if (!esUuid(v)) throw new HrmError(400, codigo);
  return v;
}

function uuidOpcional(v: unknown, codigo: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  return uuid(v, codigo);
}

function entero(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

// ── Áreas ─────────────────────────────────────────────────────────────────────

export function cargarAreas(ctx: ContextoEstructura) {
  return rpc<RespuestaAreas>('fn_hr_estructura_areas', actor(ctx));
}

/** Solo los campos del formulario; lo demás del body se descarta. */
export function limpiarDatosArea(b: Record<string, unknown>): DatosArea {
  const sedes = Array.isArray(b.sedes) ? b.sedes.map(entero).filter((n): n is number => n !== null) : [];
  return {
    nombre: texto(b.nombre, 120) ?? '',
    parent_id: uuidOpcional(b.parent_id, 'area_superior_invalida'),
    responsable_id: uuidOpcional(b.responsable_id, 'responsable_invalido'),
    centro_costo_id: uuidOpcional(b.centro_costo_id, 'centro_costo_invalido'),
    descripcion: texto(b.descripcion, 500),
    sedes: Array.from(new Set(sedes)).slice(0, 200),
  };
}

export async function guardarArea(ctx: ContextoEstructura, id: string | null, b: Record<string, unknown>) {
  const datos = limpiarDatosArea(b);
  if (datos.nombre.length < 2) throw new HrmError(422, 'nombre_invalido');
  const nuevoId = await rpc<string>('fn_hr_area_guardar', {
    ...actor(ctx),
    p_id: id === null ? null : uuid(id, 'area_invalida'),
    p_datos: datos,
  });
  return { id: nuevoId };
}

export async function archivarArea(ctx: ContextoEstructura, id: string) {
  await rpc<null>('fn_hr_area_archivar', { ...actor(ctx), p_id: uuid(id, 'area_invalida') });
  return { ok: true };
}

// ── Cargos ────────────────────────────────────────────────────────────────────

export function cargarCargos(ctx: ContextoEstructura, sede: number | null, p: ContextoPeticion) {
  return rpc<RespuestaCargos>('fn_hr_estructura_cargos', { ...actor(ctx), p_sede: sede, ...peticion(p) });
}

/** Detalle del cargo (con `id`) o solo las opciones del formulario nuevo (`id` null). */
export function detalleCargo(ctx: ContextoEstructura, id: string | null, p: ContextoPeticion) {
  return rpc<RespuestaCargo>('fn_hr_cargo_detalle', {
    ...actor(ctx),
    p_id: id === null ? null : uuid(id, 'cargo_invalido'),
    ...peticion(p),
  });
}

function numeroOpcional(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza el body del formulario del cargo. */
export function limpiarDatosCargo(b: Record<string, unknown>): Record<string, unknown> {
  const lista = (v: unknown, max: number) =>
    Array.isArray(v) ? v.map((x) => texto(x, 300)).filter((x): x is string => x !== null).slice(0, max) : undefined;
  const p: Record<string, unknown> = {
    nombre: texto(b.nombre, 120) ?? '',
    area_id: uuidOpcional(b.area_id, 'area_invalida'),
    nivel: entero(b.nivel),
    reporta_a_id: uuidOpcional(b.reporta_a_id, 'reporta_a_invalido'),
    proposito: texto(b.proposito, 1000),
    educacion: texto(b.educacion, 300),
    experiencia: texto(b.experiencia, 300),
  };
  const funciones = lista(b.funciones, 20);
  if (funciones) p.funciones = funciones;
  if (Array.isArray(b.competencias)) {
    p.competencias = b.competencias.slice(0, 30).map((c) => {
      const x = (c ?? {}) as Record<string, unknown>;
      return { nombre: texto(x.nombre, 120) ?? '', tipo: x.tipo === 'comportamental' ? 'comportamental' : 'tecnica', nivel: entero(x.nivel) };
    });
  }
  if (Array.isArray(b.documentos)) {
    p.documentos = b.documentos.filter((d): d is string => typeof d === 'string' && /^[a-z][a-z0-9_]{2,40}$/.test(d)).slice(0, 30);
  }
  if ('clase_arl' in b) p.clase_arl = entero(b.clase_arl);
  if (b.escala && typeof b.escala === 'object') {
    const e = b.escala as Record<string, unknown>;
    if (!esFechaPlana(e.desde)) throw new HrmError(422, 'escala_sin_fecha');
    p.escala = {
      desde: e.desde,
      motivo: texto(e.motivo, 200) ?? '',
      filas: (Array.isArray(e.filas) ? e.filas : []).slice(0, 200).map((f) => {
        const x = (f ?? {}) as Record<string, unknown>;
        return { sede_id: entero(x.sede_id), minimo: numeroOpcional(x.minimo), medio: numeroOpcional(x.medio), maximo: numeroOpcional(x.maximo) };
      }),
    };
  }
  return p;
}

export async function guardarCargo(ctx: ContextoEstructura, id: string | null, b: Record<string, unknown>, p: ContextoPeticion) {
  const nuevoId = await rpc<string>('fn_hr_cargo_guardar', {
    ...actor(ctx),
    p_id: id === null ? null : uuid(id, 'cargo_invalido'),
    p_datos: limpiarDatosCargo(b),
    ...peticion(p),
  });
  return { id: nuevoId };
}

/** «Eliminar cargo»: lo deja inactivo; la base lo impide con personas activas o plazas aprobadas. */
export async function eliminarCargo(ctx: ContextoEstructura, id: string) {
  await rpc<null>('fn_hr_cargo_eliminar', { ...actor(ctx), p_id: uuid(id, 'cargo_invalido') });
  return { ok: true };
}

/** Cuántas personas del cargo quedarían fuera de la escala propuesta, por sede (lee salarios: queda registro). */
export function impactoEscala(ctx: ContextoEstructura, id: string, filas: unknown, p: ContextoPeticion) {
  const limpias = (Array.isArray(filas) ? filas : []).slice(0, 200).map((f) => {
    const x = (f ?? {}) as Record<string, unknown>;
    return { sede_id: entero(x.sede_id), minimo: numeroOpcional(x.minimo), maximo: numeroOpcional(x.maximo) };
  });
  return rpc<{ sede_id: number | null; debajo: number; encima: number }[]>('fn_hr_escala_impacto', {
    ...actor(ctx),
    p_id: uuid(id, 'cargo_invalido'),
    p_filas: limpias,
    ...peticion(p),
  });
}

// ── Plazas ────────────────────────────────────────────────────────────────────

export function cargarPlazas(ctx: ContextoEstructura) {
  return rpc<RespuestaPlazas>('fn_hr_estructura_plazas', actor(ctx));
}

export function limpiarSolicitudPlaza(b: Record<string, unknown>): DatosSolicitudPlaza {
  const tipo = b.tipo === 'temporal' ? 'temporal' : 'permanente';
  if (!esFechaPlana(b.desde)) throw new HrmError(422, 'fecha_invalida');
  if (tipo === 'temporal' && !esFechaPlana(b.hasta)) throw new HrmError(422, 'fecha_fin_invalida');
  return {
    area_id: uuid(b.area_id, 'area_invalida'),
    sede_id: entero(b.sede_id) ?? 0,
    cargo_id: uuid(b.cargo_id, 'cargo_invalido'),
    cantidad: entero(b.cantidad) ?? 0,
    tipo,
    desde: b.desde as string,
    hasta: tipo === 'temporal' ? (b.hasta as string) : null,
    justificacion: texto(b.justificacion, 500) ?? '',
  };
}

export function planPlaza(ctx: ContextoEstructura, b: Record<string, unknown>, p: ContextoPeticion) {
  return rpc<PlanPlaza>('fn_hr_plaza_plan', {
    ...actor(ctx),
    p_datos: {
      area_id: uuid(b.area_id, 'area_invalida'),
      sede_id: entero(b.sede_id),
      cargo_id: uuid(b.cargo_id, 'cargo_invalido'),
      cantidad: entero(b.cantidad),
    },
    ...peticion(p),
  });
}

export function solicitarPlaza(ctx: ContextoEstructura, b: Record<string, unknown>) {
  return rpc<{ id: string; instancia: string }>('fn_hr_plaza_solicitar', { ...actor(ctx), p_datos: limpiarSolicitudPlaza(b) });
}

// ── Para el agente de empleados ───────────────────────────────────────────────

export interface EscalaSalarial {
  minimo: number;
  medio: number;
  maximo: number;
  /** Nombre del cargo y de la sede de la escala (null = todas las sedes). */
  cargo: string | null;
  sede: string | null;
  desde: string;
  hasta: string | null;
}

export interface ConsultaEscala {
  ctx: ContextoEstructura;
  cargoId: string | null;
  sedeId: number | null;
  /** Día de la consulta (`YYYY-MM-DD`); por defecto, hoy en la zona de la organización. */
  dia?: string | null;
}

/**
 * Escala que aplica al cargo en la sede. Sin cargo, `null`. Sin permiso de
 * salario, `HrmError(403, 'sin_permiso')` (la base ya registró el intento).
 */
export async function escalaVigente(consulta: ConsultaEscala, p: ContextoPeticion = SIN_PETICION): Promise<EscalaSalarial | null> {
  if (!consulta.cargoId) return null;
  const r = await rpc<Record<string, unknown> | null>('fn_hr_escala_vigente', {
    ...actor(consulta.ctx),
    p_position: uuid(consulta.cargoId, 'cargo_invalido'),
    p_branch: consulta.sedeId,
    p_dia: consulta.dia && esFechaPlana(consulta.dia) ? consulta.dia : null,
    ...peticion(p),
  });
  if (!r) return null;
  return {
    minimo: Number(r.minimo),
    medio: Number(r.medio),
    maximo: Number(r.maximo),
    cargo: (r.cargo as string | null) ?? null,
    sede: (r.sede as string | null) ?? null,
    desde: String(r.desde),
    hasta: (r.hasta as string | null) ?? null,
  };
}

/** Plazas del área del cargo en la sede, o `null` si esa área no tiene presupuesto ahí. */
export async function plazaDisponible(consulta: ConsultaEscala): Promise<{ ocupadas: number; aprobadas: number } | null> {
  if (!consulta.cargoId || !consulta.sedeId) return null;
  const r = await rpc<{ ocupadas: number; aprobadas: number } | null>('fn_hr_plaza_disponible', {
    ...actor(consulta.ctx),
    p_position: uuid(consulta.cargoId, 'cargo_invalido'),
    p_branch: consulta.sedeId,
  });
  return r ? { ocupadas: Number(r.ocupadas), aprobadas: Number(r.aprobadas) } : null;
}
