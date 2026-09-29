/**
 * Membresías › clases y reservas en el servidor (docs/design/MEMBRESIAS-FASE-1-2.md §13):
 * check-in desde una reserva e importación CSV de clases y reservas.
 *
 * Solo desde `src/app/api/membresias/**` con el contexto de `withOrg`: la organización sale de la
 * sesión y el cliente es el de la sesión (RLS por pertenencia; `class_reservations` además filtra
 * por sede con `app_branch_access`). Los permisos se exigen aquí (`exigir`, resuelto en el servidor)
 * y otra vez dentro de cada RPC (`fn_membresias_int_exigir`). Nada de lógica de negocio: las reglas
 * de la entrada y la validación de la importación viven en la base.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { ErrorMembresiasServidor, exigir } from './membresias.server';
import { estadoErrorRpc, mapearResultadoCheckin } from './checkinReserva';
import type { ResultadoCheckin, ResultadoImportacion } from './tipos';
import type { MetodoEntrada } from './operacion';

function errorRpc(err: { message?: string; code?: string } | null): ErrorMembresiasServidor {
  const { codigo, estado } = estadoErrorRpc(err);
  if (codigo === 'error_interno') {
    console.error('[membresias] RPC falló', { code: err?.code, message: (err?.message ?? '').slice(0, 200) });
  }
  return new ErrorMembresiasServidor(codigo, estado);
}

// ─── Check-in desde una reserva ─────────────────────────────────────────────

/**
 * Registra la entrada del miembro de la reserva en la sede de la clase. La reserva se busca con la
 * organización de la sesión (otra organización o una sede sin acceso: 404, sin revelar que existe);
 * la RPC vuelve a validar organización, miembro y sede, aplica las reglas de la entrada, marca la
 * asistencia y es idempotente.
 */
export async function registrarEntradaDesdeReserva(
  ctx: ServerOrgContext,
  reservaId: number,
  metodo: MetodoEntrada = 'manual',
): Promise<ResultadoCheckin> {
  await exigir(ctx, 'checkin');
  const { data: reserva, error: errLectura } = await ctx.supabase
    .from('class_reservations')
    .select('id, customer_id, gym_classes!inner(branch_id, organization_id)')
    .eq('organization_id', ctx.organizationId)
    .eq('gym_classes.organization_id', ctx.organizationId)
    .eq('id', reservaId)
    .maybeSingle();
  if (errLectura) throw new ErrorMembresiasServidor('error_interno', 500, errLectura.message);
  if (!reserva) throw new ErrorMembresiasServidor('reserva_no_encontrada', 404);
  const r = reserva as unknown as { customer_id: string; gym_classes: { branch_id: number } | Array<{ branch_id: number }> };
  const clase = Array.isArray(r.gym_classes) ? r.gym_classes[0] : r.gym_classes;
  if (!clase) throw new ErrorMembresiasServidor('reserva_no_encontrada', 404);

  const { data, error } = await ctx.supabase.rpc('fn_membresia_registrar_checkin', {
    p_organization_id: ctx.organizationId,
    p_customer_id: r.customer_id,
    p_branch_id: clase.branch_id,
    p_method: metodo,
    p_membership_id: null,
    p_class_reservation_id: reservaId,
  });
  if (error) throw errorRpc(error);
  return mapearResultadoCheckin(data);
}

// ─── Importación CSV ────────────────────────────────────────────────────────

type FilaImportacion = Record<string, string | number | null | undefined> & { fila: number };

function mapearImportacion(data: unknown): ResultadoImportacion {
  const r = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const filas = Array.isArray(r.filas) ? (r.filas as Array<Record<string, unknown>>) : [];
  const texto = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
  return {
    ok: r.ok === true,
    importadas: Number(r.importadas) || 0,
    validas: Number(r.validas) || 0,
    conError: Number(r.con_error) || 0,
    soloValidar: r.solo_validar === true,
    filas: filas.map((f) => ({
      fila: Number(f.fila) || 0,
      errores: Array.isArray(f.errores) ? (f.errores as unknown[]).map(String) : [],
      inicio: texto(f.inicio),
      miembro: texto(f.miembro),
      clase: texto(f.clase),
    })),
  };
}

async function importar(
  ctx: ServerOrgContext,
  rpc: 'fn_membresias_importar_clases' | 'fn_membresias_importar_reservas',
  filas: FilaImportacion[],
  soloValidar: boolean,
): Promise<ResultadoImportacion> {
  await exigir(ctx, 'clases');
  const { data, error } = await ctx.supabase.rpc(rpc, {
    p_organization_id: ctx.organizationId,
    p_filas: filas,
    p_solo_validar: soloValidar,
  });
  if (error) throw errorRpc(error);
  return mapearImportacion(data);
}

/** Clases: todo o nada (si una fila falla, no se guarda ninguna). Requiere memberships.classes.manage. */
export function importarClases(ctx: ServerOrgContext, filas: FilaImportacion[], soloValidar: boolean): Promise<ResultadoImportacion> {
  return importar(ctx, 'fn_membresias_importar_clases', filas, soloValidar);
}

/** Reservas: todo o nada. Requiere memberships.classes.manage. */
export function importarReservas(ctx: ServerOrgContext, filas: FilaImportacion[], soloValidar: boolean): Promise<ResultadoImportacion> {
  return importar(ctx, 'fn_membresias_importar_reservas', filas, soloValidar);
}
