/**
 * Marcación de RR. HH. (plan `docs/hrm/PLAN-MARCACION-DISPOSITIVOS.md`, fase M0):
 * En vivo, métodos por sede, puntos (pantalla de QR y etiqueta NFC), pantalla del QR,
 * excepciones temporales y el reclamo del empleado.
 *
 * Todo pasa por RPC `SECURITY DEFINER` con la service role y el actor de
 * `getServerOrgContext()`: la organización sale de la sesión y los permisos
 * (`hr.attendance.view` / `.manage`) los comprueba la base en cada llamada.
 * Marcación no guarda marcas propias: lee las mismas filas de `attendance_events`
 * que Asistencia (D1).
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { cuerpoMetodos, cuerpoReclamo, esMetodoSede, validarExcepcion, type ConfigSede } from '@/lib/hrm/marcacion/metodos';
import { kioscoDeCuerpo, separarCuerpo } from '@/lib/hrm/kiosco/metodosKiosco';
import { HrmError, errorDeRpc, esFechaPlana, esUuid } from './tipos';

export type ContextoGestion = Pick<ServerOrgContext, 'userId' | 'organizationId'>;

function cliente() {
  return getServiceClient();
}

async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await cliente().rpc(nombre, args);
  if (error) throw errorDeRpc(error);
  return data as T;
}

function base(ctx: ContextoGestion) {
  return { p_actor: ctx.userId, p_org: ctx.organizationId };
}

function idValido(id: unknown, codigo: string): string {
  if (!esUuid(id)) throw new HrmError(400, codigo);
  return id;
}

/** Figma 20.26: marcas de hoy, intentos rechazados e indicadores. */
export function enVivo(ctx: ContextoGestion, sede: number | null) {
  return rpc<Record<string, unknown>>('fn_hr_marcacion_en_vivo', { ...base(ctx), p_branch: sede });
}

/** Figma 20.27: métodos y reglas de la sede (sin sede: la principal). */
export function metodosSede(ctx: ContextoGestion, sede: number | null) {
  return rpc<Record<string, unknown>>('fn_hr_metodos_sede_leer', { ...base(ctx), p_branch: sede });
}

export function guardarMetodosSede(ctx: ContextoGestion, sede: number | null, metodos: unknown) {
  if (sede === null) throw new HrmError(422, 'sede_requerida');
  if (!metodos || typeof metodos !== 'object') throw new HrmError(422, 'datos_invalidos');
  // M1: el kiosco (PIN, carné y foto de evidencia) viaja junto con los métodos de M0.
  const { m0, kiosco } = separarCuerpo(metodos as Record<string, unknown>);
  const r = cuerpoMetodos(m0 as ConfigSede);
  if (!r.ok) throw new HrmError(422, r.error);
  const k = kiosco ? kioscoDeCuerpo(kiosco) : null;
  if (k && !k.ok) throw new HrmError(422, k.error);
  return rpc<Record<string, unknown>>('fn_hr_metodos_sede_guardar', { ...base(ctx), p_branch: sede, p_metodos: { ...r.metodos, ...(k?.ok ? k.valor : {}) } });
}

/** Figma 20.28 (M0: pantallas de QR y etiquetas NFC). */
export function dispositivos(ctx: ContextoGestion, sede: number | null) {
  return rpc<Record<string, unknown>>('fn_hr_dispositivos', { ...base(ctx), p_branch: sede });
}

export function crearDispositivo(ctx: ContextoGestion, datos: unknown) {
  const d = (datos ?? {}) as Record<string, unknown>;
  if (d.tipo !== 'pantalla_qr' && d.tipo !== 'etiqueta_nfc') throw new HrmError(422, 'tipo_no_disponible');
  const nombre = typeof d.nombre === 'string' ? d.nombre.trim() : '';
  if (nombre.length < 2 || nombre.length > 80) throw new HrmError(422, 'nombre_invalido');
  const sede = Number(d.sede_id);
  if (!Number.isInteger(sede) || sede <= 0) throw new HrmError(422, 'sede_invalida');
  const chip = d.chip === 'ntag424' || d.chip === 'ntag213' ? d.chip : 'ntag215';
  const descripcion = typeof d.descripcion === 'string' ? d.descripcion.trim().slice(0, 200) : null;
  return rpc<{ id: string; tipo: string; codigo: string | null }>('fn_hr_dispositivo_crear', {
    ...base(ctx),
    p_datos: { tipo: d.tipo, nombre, sede_id: sede, chip, descripcion },
  });
}

export function regenerarDispositivo(ctx: ContextoGestion, id: string) {
  return rpc<{ id: string; tipo: string; codigo: string | null }>('fn_hr_dispositivo_regenerar', { ...base(ctx), p_reloj: idValido(id, 'reloj_invalido') });
}

export function activarDispositivo(ctx: ContextoGestion, id: string, activo: unknown) {
  if (typeof activo !== 'boolean') throw new HrmError(422, 'datos_invalidos');
  return rpc<{ id: string; activo: boolean }>('fn_hr_dispositivo_activar', { ...base(ctx), p_reloj: idValido(id, 'reloj_invalido'), p_activo: activo });
}

/** Pantalla del QR: la clave solo la recibe `hr.attendance.manage` (lo comprueba la base). */
export function pantallaQr(ctx: ContextoGestion, id: string) {
  return rpc<Record<string, unknown>>('fn_hr_pantalla_qr', { ...base(ctx), p_reloj: idValido(id, 'reloj_invalido') });
}

export function usosPantallaQr(ctx: ContextoGestion, id: string, paso: unknown) {
  const p = Number(paso);
  if (!Number.isSafeInteger(p) || p <= 0) throw new HrmError(400, 'paso_invalido');
  return rpc<{ paso: number; usado_hasta: number | null; activo: boolean; ahora: string }>('fn_hr_pantalla_qr_usos', {
    ...base(ctx),
    p_reloj: idValido(id, 'reloj_invalido'),
    p_paso: p,
  });
}

/** Figma 20.27.11: excepción temporal; nace pendiente y la aprueba RR. HH. por el motor. */
export function excepciones(ctx: ContextoGestion, vinculoId: string | null) {
  if (vinculoId !== null && !esUuid(vinculoId)) throw new HrmError(400, 'vinculo_invalido');
  return rpc<unknown[]>('fn_hr_excepciones', { ...base(ctx), p_vinculo: vinculoId });
}

export function solicitarExcepcion(ctx: ContextoGestion, datos: unknown, hoy: string) {
  const d = (datos ?? {}) as Record<string, unknown>;
  const e = {
    vinculoId: typeof d.vinculo_id === 'string' ? d.vinculo_id : null,
    metodo: typeof d.metodo === 'string' ? d.metodo : null,
    desde: typeof d.desde === 'string' ? d.desde : undefined,
    hasta: typeof d.hasta === 'string' ? d.hasta : undefined,
    motivo: typeof d.motivo === 'string' ? d.motivo : undefined,
  };
  const error = validarExcepcion(e, hoy);
  if (error) throw new HrmError(422, `excepcion_${error}`);
  if (!esUuid(e.vinculoId) || !esMetodoSede(e.metodo) || !esFechaPlana(e.desde) || !esFechaPlana(e.hasta)) throw new HrmError(422, 'datos_invalidos');
  return rpc<Record<string, unknown>>('fn_hr_excepcion_solicitar', {
    ...base(ctx),
    p_datos: { vinculo_id: e.vinculoId, metodo: e.metodo, desde: e.desde, hasta: e.hasta, motivo: e.motivo!.trim() },
  });
}

export function revocarExcepcion(ctx: ContextoGestion, id: string) {
  return rpc<Record<string, unknown>>('fn_hr_excepcion_revocar', { ...base(ctx), p_id: idValido(id, 'excepcion_invalida') });
}

/**
 * R2 (Figma 20.31.6): el empleado reclama una marca suya. Nace un ajuste pendiente
 * ligado a la marca (`origen = empleado_reclamo`); la marca no cambia y su foto
 * queda retenida mientras el caso esté abierto. Mismo motor que «Solicitar un ajuste».
 */
export function reclamarMarca(ctx: ContextoGestion, datos: unknown) {
  const d = (datos ?? {}) as Record<string, unknown>;
  const r = cuerpoReclamo({
    eventoId: typeof d.evento_id === 'string' ? d.evento_id : '',
    que: typeof d.que === 'string' ? d.que : '',
    motivo: typeof d.motivo === 'string' ? d.motivo : '',
    hora: typeof d.hora === 'string' ? d.hora : null,
  });
  if (!r.ok) throw new HrmError(422, `reclamo_${r.error}`);
  if (!esUuid(r.cuerpo.evento_id)) throw new HrmError(400, 'marca_invalida');
  return rpc<{ id: string; estado: string; fecha_trabajo: string }>('fn_hr_ajuste_solicitar', {
    ...base(ctx),
    p_datos: { ...r.cuerpo, origen: 'empleado_reclamo' },
  });
}

