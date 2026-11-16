/**
 * Personas de RR. HH. (fase 1): lista de empleados, ficha única, documentos,
 * contactos de emergencia, banco, últimas consultas, alta con reingreso y
 * registrar un cambio. Migración `hrm_f1_01_personas_ficha`. El alta vive en
 * `invitacionPortal.server.ts` (`altaConUsuario`): cada empleado nace con su
 * usuario de la app (revisión 2026-11-15, `hrm_f1_04_empleado_siempre_usuario`).
 *
 * Las RPC con `p_actor` solo las ejecuta la service role: el permiso se
 * resuelve en la base con el actor de la sesión (`ctx.userId`) y la
 * organización de `getServerOrgContext()`, y cada lectura sensible deja su fila
 * en `hr_access_log` con la IP de la petición original. Registrar un cambio va
 * con la sesión del usuario (`fn_hr_registrar_cambios` toma `auth.uid()`).
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { HrmError, errorDeRpc, esFechaPlana, esUuid, type ContextoPeticion } from './tipos';
import { esTipoDocumento, normalizarNumeroDocumento } from '@/lib/hrm/personas/catalogo';

export type ContextoPersonas = Pick<ServerOrgContext, 'userId' | 'organizationId'>;
export type ContextoSesionPersonas = Pick<ServerOrgContext, 'supabase' | 'userId' | 'organizationId'>;

const CAMPOS_CAMBIO = [
  'salario',
  'periodo_salario',
  'cargo',
  'sede',
  'area',
  'jefe',
  'jornada_horas_semana',
  'tipo_contrato',
  'fin_contrato',
  'centro_costo',
  'eps',
  'afp',
  'arl',
  'ccf',
  'cesantias',
] as const;

async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getServiceClient().rpc(nombre, args);
  if (error) throw errorDeRpc(error);
  return data as T;
}

function base(ctx: ContextoPersonas, p: ContextoPeticion) {
  return { p_actor: ctx.userId, p_org: ctx.organizationId, p_ip: p.ip, p_ua: p.userAgent, p_ruta: p.ruta };
}

function persona(id: string): string {
  if (!esUuid(id)) throw new HrmError(400, 'persona_invalida');
  return id;
}

export function listarEmpleados(ctx: ContextoPersonas, p: ContextoPeticion) {
  return rpc<Record<string, unknown>>('fn_hr_empleados_listar', base(ctx, p));
}

export function leerFicha(ctx: ContextoPersonas, personaId: string) {
  return rpc<Record<string, unknown>>('fn_hr_ficha_leer', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_person: persona(personaId),
  });
}

export function listarDocumentos(ctx: ContextoPersonas, personaId: string, p: ContextoPeticion) {
  return rpc<Record<string, unknown>>('fn_hr_documentos_listar', { ...base(ctx, p), p_person: persona(personaId) });
}

export function leerContactos(ctx: ContextoPersonas, personaId: string, p: ContextoPeticion) {
  return rpc<Record<string, unknown>>('fn_hr_contactos_emergencia_leer', { ...base(ctx, p), p_person: persona(personaId) });
}

export function leerBanco(ctx: ContextoPersonas, personaId: string, completo: boolean, p: ContextoPeticion) {
  return rpc<Record<string, unknown>>('fn_hr_banco_leer', { ...base(ctx, p), p_person: persona(personaId), p_completo: completo });
}

const TIPOS_CUENTA = ['savings', 'checking', 'deposito_electronico'];

export function solicitarCambioCuenta(ctx: ContextoPersonas, personaId: string, datos: Record<string, unknown>, p: ContextoPeticion) {
  const limpio = {
    bank_name: String(datos.bank_name ?? '').trim().slice(0, 120),
    account_type: String(datos.account_type ?? ''),
    account_number: String(datos.account_number ?? '').trim().slice(0, 40),
    holder_name: typeof datos.holder_name === 'string' ? datos.holder_name.slice(0, 160) : null,
    motivo: typeof datos.motivo === 'string' ? datos.motivo.slice(0, 300) : null,
    nota: typeof datos.nota === 'string' ? datos.nota.slice(0, 1000) : null,
  };
  if (!limpio.bank_name || !TIPOS_CUENTA.includes(limpio.account_type) || !/^[0-9 -]{4,30}$/.test(limpio.account_number)) {
    throw new HrmError(422, 'cuenta_invalida');
  }
  return rpc<Record<string, unknown>>('fn_hr_banco_solicitar_cambio', { ...base(ctx, p), p_person: persona(personaId), p_datos: limpio });
}

export function ultimasConsultas(ctx: ContextoPersonas, personaId: string, limite = 5) {
  return rpc<unknown[]>('fn_hr_ultimas_consultas', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_person: persona(personaId),
    p_limite: Math.min(Math.max(1, Math.trunc(limite)), 50),
  });
}

export function buscarDocumento(ctx: ContextoPersonas, tipo: unknown, numero: unknown, p: ContextoPeticion) {
  if (!esTipoDocumento(tipo)) throw new HrmError(422, 'tipo_documento_invalido');
  const n = normalizarNumeroDocumento(String(numero ?? ''));
  if (n.length < 3 || n.length > 20) throw new HrmError(422, 'documento_invalido');
  return rpc<Record<string, unknown>>('fn_hr_buscar_documento', { ...base(ctx, p), p_tipo: tipo, p_numero: n });
}

/** Campos que acepta el alta; lo demás del body se descarta. */
const CAMPOS_ALTA = [
  'persona_id',
  'first_name',
  'second_name',
  'last_name',
  'second_last_name',
  'doc_type',
  'doc_number',
  'birth_date',
  'personal_phone',
  'personal_email',
  'work_email',
  'branch_id',
  'department_id',
  'position_id',
  'manager_id',
  'contract_type',
  'contract_end_date',
  'hire_date',
  'probation_end_date',
  'work_hours_per_week',
  'cost_center_id',
  'salary_period',
  'salario',
  'eps',
  'afp',
  'arl',
  'ccf',
  'cesantias',
] as const;

export function limpiarAlta(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of CAMPOS_ALTA) {
    const v = body[k];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'string') out[k] = v.trim().slice(0, 200);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  if (!esTipoDocumento(out.doc_type)) throw new HrmError(422, 'tipo_documento_invalido');
  if (typeof out.doc_number !== 'string' || normalizarNumeroDocumento(out.doc_number).length < 3) throw new HrmError(422, 'documento_invalido');
  if (!esFechaPlana(out.hire_date)) throw new HrmError(422, 'fecha_ingreso_obligatoria');
  for (const f of ['birth_date', 'contract_end_date', 'probation_end_date'] as const) {
    if (out[f] !== undefined && !esFechaPlana(out[f])) throw new HrmError(422, 'fecha_invalida');
  }
  for (const f of ['persona_id', 'department_id', 'position_id', 'manager_id', 'cost_center_id', 'eps', 'afp', 'arl', 'ccf', 'cesantias'] as const) {
    if (out[f] !== undefined && !esUuid(out[f])) throw new HrmError(422, `${f}_invalido`);
  }
  if (out.personal_email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(out.personal_email))) throw new HrmError(422, 'correo_invalido');
  return out;
}

export interface ResultadoAlta {
  persona_id: string;
  vinculo_id: string;
  reingreso: boolean;
  por_ingresar: boolean;
  tareas: number;
  salario: boolean;
}

export function periodoCerrado(ctx: ContextoPersonas, fecha: string) {
  if (!esFechaPlana(fecha)) throw new HrmError(422, 'fecha_invalida');
  return rpc<{ cerrado: boolean; primera_fecha_libre?: string; nombre?: string }>('fn_hr_periodo_cerrado', {
    p_org: ctx.organizationId,
    p_fecha: fecha,
  });
}

export interface CambioPedido {
  campo: (typeof CAMPOS_CAMBIO)[number];
  valor: unknown;
}

/** Registra uno o varios cambios con la misma fecha de efecto (una sola solicitud). */
export async function registrarCambios(
  ctx: ContextoSesionPersonas,
  args: { vinculoId: string; efectivoDesde: string; cambios: unknown; motivo: string; nota?: string | null; soporteDocumentoId?: string | null },
  p: ContextoPeticion
) {
  if (!esUuid(args.vinculoId)) throw new HrmError(400, 'vinculo_invalido');
  if (!esFechaPlana(args.efectivoDesde)) throw new HrmError(422, 'fecha_invalida');
  if (typeof args.motivo !== 'string' || args.motivo.trim().length < 3) throw new HrmError(422, 'motivo_obligatorio');
  if (!Array.isArray(args.cambios) || args.cambios.length === 0 || args.cambios.length > 8) throw new HrmError(422, 'cambios_invalidos');
  const cambios: CambioPedido[] = args.cambios.map((c) => {
    const campo = (c as { campo?: unknown })?.campo;
    if (typeof campo !== 'string' || !(CAMPOS_CAMBIO as readonly string[]).includes(campo)) throw new HrmError(400, 'campo_invalido');
    return { campo: campo as CambioPedido['campo'], valor: (c as { valor?: unknown }).valor ?? null };
  });
  if (args.soporteDocumentoId != null && !esUuid(args.soporteDocumentoId)) throw new HrmError(400, 'documento_invalido');
  const { data, error } = await ctx.supabase.rpc('fn_hr_registrar_cambios', {
    p_employment: args.vinculoId,
    p_efectivo: args.efectivoDesde,
    p_cambios: cambios,
    p_motivo: args.motivo.trim().slice(0, 300),
    p_nota: typeof args.nota === 'string' ? args.nota.slice(0, 1000) : null,
    p_contexto: { ip: p.ip, user_agent: p.userAgent, ruta: p.ruta, soporte_documento_id: args.soporteDocumentoId ?? null },
  });
  if (error) throw errorDeRpc(error);
  return data as { ids: string[]; status: 'pendiente' | 'aprobado'; approval_instance_id: string | null };
}

/**
 * Deja en el registro de accesos la confirmación de campos propuestos por IA
 * («propuesto por IA, confirmado por …»). Solo nombres de campos, nunca valores.
 */
export async function registrarConfirmacionIa(
  ctx: ContextoPersonas,
  personaId: string,
  campos: string[],
  documentoId: string | null,
  p: ContextoPeticion
): Promise<void> {
  await rpc<void>('fn_hr_registrar_acceso_interno', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_person: persona(personaId),
    p_employment: null,
    p_grupo: 'identificacion',
    p_accion: 'editar',
    p_ip: p.ip,
    p_ua: p.userAgent,
    p_ruta: p.ruta,
    p_detalle: { origen: 'propuesto_por_ia', confirmado_por_actor: true, campos, documento: documentoId },
  });
}
