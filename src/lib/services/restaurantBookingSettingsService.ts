/**
 * Configuración de reservas de mesa por sede (`restaurant_booking_settings`).
 *
 * Contrato que consumen la pantalla de POS › Reservas de mesa › Configuración y
 * la de Sitio web (la construye el frente del módulo Sitio web):
 *
 *   GET /api/pos/reservas-mesas/configuracion?branchId=<id>
 *     → { sede: { propia, organizacion, efectiva, origen }, recomendados, zonas }
 *   PUT /api/pos/reservas-mesas/configuracion
 *     body { branchId: number | null, ajustes: AjustesReservaDto }
 *     → { ajustes } | 400 { codigo: 'AJUSTES_INVALIDOS', errores } | 403
 *
 * Reglas (las mismas que la base, `fn_ajustes_reserva` de la migración D1):
 * - La fila de la sede gana; la de la organización (`branch_id` NULL) es el
 *   respaldo; sin ninguna, la base usa los valores por defecto
 *   (`AJUSTES_RESERVA_POR_DEFECTO`, idénticos a los DEFAULT de la tabla y a
 *   `fn_restaurant_franjas`).
 * - `is_enabled` vale `false` por DEFAULT en la tabla: «Configurar con valores
 *   recomendados» guarda `true` de forma explícita (`AJUSTES_RESERVA_RECOMENDADOS`).
 *   Guardar una fila con `false` apaga las reservas en línea de la sede: el
 *   sitio deja de ofrecerlas y la RPC las rechaza (`DESHABILITADA:`).
 * - `service_hours`: claves `mon`…`sun` (las de `to_char(fecha,'Dy')` en la
 *   base) con turnos `{ from: 'HH:MM', to: 'HH:MM' }`. Sin la clave del día, la
 *   base usa 12:00-15:00 y 18:00-22:30.
 *
 * La organización la pone siempre quien llama desde la sesión
 * (`getServerOrgContext`), nunca el body.
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const DIAS_SERVICIO = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DiaServicio = (typeof DIAS_SERVICIO)[number];

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function minutosDeHora(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

const turnoSchema = z
  .object({ from: z.string().regex(HORA, 'HORA_INVALIDA'), to: z.string().regex(HORA, 'HORA_INVALIDA') })
  .strict()
  .refine((t) => minutosDeHora(t.from) < minutosDeHora(t.to), { message: 'TURNO_INVERTIDO' });

const horarioSchema = z
  .object(Object.fromEntries(DIAS_SERVICIO.map((d) => [d, z.array(turnoSchema).max(4).optional()])) as Record<
    DiaServicio,
    z.ZodOptional<z.ZodArray<typeof turnoSchema>>
  >)
  .strict();

/**
 * Intervalos de franja admitidos: múltiplos de 15. `fn_restaurant_slot_valido`
 * (D1) valida la hora en una rejilla de gcd(intervalo, 15) minutos desde el
 * inicio del turno; con múltiplos de 15 esa rejilla es de 15 y toda franja que
 * ofrece la disponibilidad cae en ella (con 7, el sitio ofrecería 12:07 y la
 * base lo rechazaría).
 */
export const INTERVALOS_FRANJA = [15, 30, 45, 60, 90, 120] as const;

const correo = z.string().trim().toLowerCase().email('CORREO_INVALIDO').max(160);

export const ajustesReservaSchema = z
  .object({
    is_enabled: z.boolean(),
    service_hours: horarioSchema,
    slot_interval_minutes: z
      .number()
      .int()
      .refine((v) => (INTERVALOS_FRANJA as readonly number[]).includes(v), { message: 'INTERVALO_INVALIDO' }),
    turn_duration_minutes: z.number().int().min(15).max(480),
    buffer_minutes: z.number().int().min(0).max(120),
    min_party_size: z.number().int().min(1).max(100),
    max_party_size: z.number().int().min(1).max(200),
    max_covers_per_slot: z.number().int().min(1).max(5000).nullable(),
    large_party_threshold: z.number().int().min(1).max(200).nullable(),
    min_advance_minutes: z.number().int().min(0).max(60 * 24 * 7),
    max_advance_days: z.number().int().min(0).max(365),
    cancellation_hours: z.number().int().min(0).max(24 * 14),
    auto_assign_table: z.boolean(),
    allow_zone_choice: z.boolean(),
    allowed_zones: z.array(z.string().trim().min(1).max(60)).max(30).nullable(),
    require_confirmation: z.boolean(),
    require_deposit: z.boolean(),
    deposit_amount: z.number().min(0).max(100_000_000).nullable(),
    deposit_per_person: z.boolean(),
    // D7 (20261006170000): con default para quien aún envía el DTO anterior.
    deposit_refundable: z.boolean().default(true),
    deposit_refund_hours: z.number().int().min(0).max(720).nullable().default(null),
    policy_text: z.string().trim().max(2000).nullable(),
    notify_emails: z.array(correo).max(10).nullable(),
    send_customer_email: z.boolean(),
    send_customer_whatsapp: z.boolean(),
    reminder_hours_before: z.number().int().min(1).max(72).nullable(),
    require_phone: z.boolean(),
    require_email: z.boolean(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.min_party_size > a.max_party_size) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['min_party_size'], message: 'MIN_MAYOR_QUE_MAX' });
    }
    if (a.large_party_threshold != null && a.large_party_threshold < a.min_party_size) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['large_party_threshold'], message: 'GRUPO_GRANDE_BAJO' });
    }
    if (a.require_deposit && !(a.deposit_amount != null && a.deposit_amount > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['deposit_amount'], message: 'DEPOSITO_REQUERIDO' });
    }
    if (a.allow_zone_choice && !(a.allowed_zones && a.allowed_zones.length > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['allowed_zones'], message: 'ZONAS_REQUERIDAS' });
    }
  });

export type AjustesReservaDto = z.infer<typeof ajustesReservaSchema>;

/** Valores que usa la base cuando la sede no tiene fila (DEFAULT de la tabla). */
export const AJUSTES_RESERVA_POR_DEFECTO: AjustesReservaDto = {
  is_enabled: false,
  service_hours: {},
  slot_interval_minutes: 30,
  turn_duration_minutes: 90,
  buffer_minutes: 15,
  min_party_size: 1,
  max_party_size: 12,
  max_covers_per_slot: null,
  large_party_threshold: null,
  min_advance_minutes: 60,
  max_advance_days: 60,
  cancellation_hours: 4,
  auto_assign_table: true,
  allow_zone_choice: false,
  allowed_zones: null,
  require_confirmation: false,
  require_deposit: false,
  deposit_amount: null,
  deposit_per_person: false,
  deposit_refundable: true,
  deposit_refund_hours: null,
  policy_text: null,
  notify_emails: null,
  send_customer_email: true,
  send_customer_whatsapp: false,
  reminder_hours_before: null,
  require_phone: true,
  require_email: false,
};

/** Turnos por defecto de la base (fn_restaurant_franjas / get_restaurant_availability). */
export const TURNOS_POR_DEFECTO = [
  { from: '12:00', to: '15:00' },
  { from: '18:00', to: '22:30' },
] as const;

/**
 * «Configurar con valores recomendados»: los de la base, con los turnos por
 * defecto escritos día a día, recordatorio de 24 h, grupo grande desde 9 y
 * `is_enabled = true` EXPLÍCITO.
 */
export const AJUSTES_RESERVA_RECOMENDADOS: AjustesReservaDto = {
  ...AJUSTES_RESERVA_POR_DEFECTO,
  is_enabled: true,
  service_hours: Object.fromEntries(DIAS_SERVICIO.map((d) => [d, TURNOS_POR_DEFECTO.map((t) => ({ ...t }))])),
  large_party_threshold: 8,
  reminder_hours_before: 24,
};

export const COLUMNAS_AJUSTES = Object.keys(AJUSTES_RESERVA_POR_DEFECTO).join(', ');

/**
 * Columnas de la migración D7 (`20261006170000_reservas_deposito_web`). Mientras
 * no esté aplicada, leer o escribir con ellas da 42703: se repite sin ellas y la
 * pantalla sigue funcionando como antes (el depósito no se puede activar sin
 * pasarela y sin la migración no hay pasarela que ofrecer).
 */
export const COLUMNAS_DEPOSITO_D7 = ['deposit_refundable', 'deposit_refund_hours'] as const;
const COLUMNAS_AJUSTES_SIN_D7 = Object.keys(AJUSTES_RESERVA_POR_DEFECTO)
  .filter((c) => !(COLUMNAS_DEPOSITO_D7 as readonly string[]).includes(c))
  .join(', ');

function esColumnaInexistente(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42703';
}

function sinColumnasD7<T extends Record<string, unknown>>(fila: T): T {
  const copia: Record<string, unknown> = { ...fila };
  for (const c of COLUMNAS_DEPOSITO_D7) delete copia[c];
  return copia as T;
}

export type OrigenAjustes = 'sede' | 'organizacion' | 'defecto';

export interface AjustesSede {
  propia: AjustesReservaDto | null;
  organizacion: AjustesReservaDto | null;
  efectiva: AjustesReservaDto;
  origen: OrigenAjustes;
}

export type ErroresAjustes = Record<string, string>;

export function validarAjustesReserva(
  entrada: unknown,
): { ok: true; ajustes: AjustesReservaDto } | { ok: false; errores: ErroresAjustes } {
  const r = ajustesReservaSchema.safeParse(entrada);
  if (r.success) {
    const a = r.data;
    // Normaliza: sin elección de zona no se guardan zonas; sin depósito, sin monto.
    return {
      ok: true,
      ajustes: {
        ...a,
        allowed_zones: a.allow_zone_choice ? Array.from(new Set(a.allowed_zones ?? [])) : null,
        deposit_amount: a.require_deposit ? a.deposit_amount : null,
        // Sin reembolso no hay plazo; con reembolso y sin horas, valen las de cancelación.
        deposit_refund_hours: a.deposit_refundable ? a.deposit_refund_hours : null,
        notify_emails: a.notify_emails && a.notify_emails.length > 0 ? Array.from(new Set(a.notify_emails)) : null,
        policy_text: a.policy_text ? a.policy_text : null,
      },
    };
  }
  const errores: ErroresAjustes = {};
  for (const issue of r.error.issues) {
    const clave = issue.path.join('.') || '_';
    if (!errores[clave]) errores[clave] = issue.message;
  }
  return { ok: false, errores };
}

/** Normaliza una fila leída de la base al DTO (columnas desconocidas fuera, nulos con default). */
export function filaADto(fila: Record<string, unknown> | null | undefined): AjustesReservaDto | null {
  if (!fila) return null;
  const base: Record<string, unknown> = { ...AJUSTES_RESERVA_POR_DEFECTO };
  for (const clave of Object.keys(AJUSTES_RESERVA_POR_DEFECTO)) {
    const v = fila[clave];
    if (v !== undefined) base[clave] = v === null && typeof (AJUSTES_RESERVA_POR_DEFECTO as Record<string, unknown>)[clave] === 'boolean' ? false : v;
  }
  if (base.deposit_amount != null) base.deposit_amount = Number(base.deposit_amount);
  if (typeof base.service_hours !== 'object' || base.service_hours === null || Array.isArray(base.service_hours)) base.service_hours = {};
  return base as unknown as AjustesReservaDto;
}

/** Misma regla que `fn_ajustes_reserva`: la sede gana, la organización respalda. */
export function resolverAjustesSede(
  filas: ReadonlyArray<Record<string, unknown>>,
  branchId: number | null,
): AjustesSede {
  const propiaFila = branchId == null ? null : filas.find((f) => Number(f.branch_id) === branchId) ?? null;
  const orgFila = filas.find((f) => f.branch_id === null || f.branch_id === undefined) ?? null;
  const propia = filaADto(propiaFila);
  const organizacion = filaADto(orgFila);
  const efectiva = (branchId == null ? organizacion : propia ?? organizacion) ?? AJUSTES_RESERVA_POR_DEFECTO;
  const origen: OrigenAjustes = branchId != null && propia ? 'sede' : organizacion ? 'organizacion' : 'defecto';
  return { propia: branchId == null ? organizacion : propia, organizacion, efectiva, origen };
}

// ── Acceso a datos (servidor; el cliente lo pone la ruta con la sesión) ──────

export class AjustesReservaError extends Error {
  constructor(public readonly codigo: 'SEDE_AJENA' | 'ERROR_BD', mensaje?: string) {
    super(mensaje ?? codigo);
  }
}

async function sedeDeLaOrganizacion(supabase: SupabaseClient, orgId: number, branchId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) throw new AjustesReservaError('ERROR_BD', error.message);
  return !!data;
}

export async function getAjustesReserva(
  supabase: SupabaseClient,
  orgId: number,
  branchId: number | null,
): Promise<AjustesSede> {
  if (branchId != null && !(await sedeDeLaOrganizacion(supabase, orgId, branchId))) {
    throw new AjustesReservaError('SEDE_AJENA');
  }
  const leer = (columnas: string) => {
    const consulta = supabase
      .from('restaurant_booking_settings')
      .select(`branch_id, ${columnas}`)
      .eq('organization_id', orgId);
    return branchId == null ? consulta.is('branch_id', null) : consulta.or(`branch_id.eq.${branchId},branch_id.is.null`);
  };
  let { data, error } = await leer(COLUMNAS_AJUSTES);
  if (esColumnaInexistente(error)) {
    // D7 sin aplicar: las mismas columnas de antes.
    ({ data, error } = await leer(COLUMNAS_AJUSTES_SIN_D7));
  }
  if (error) throw new AjustesReservaError('ERROR_BD', error.message);
  return resolverAjustesSede((data ?? []) as unknown as Record<string, unknown>[], branchId);
}

/**
 * Guarda la fila de la sede (o de la organización con `branchId` NULL).
 * Con sede, `upsert` sobre el UNIQUE (organization_id, branch_id) —verificado
 * por MCP—. Sin sede, el UNIQUE no deduplica NULL: se busca y se actualiza o
 * se inserta.
 */
export async function guardarAjustesReserva(
  supabase: SupabaseClient,
  orgId: number,
  branchId: number | null,
  ajustes: AjustesReservaDto,
): Promise<AjustesReservaDto> {
  if (branchId != null && !(await sedeDeLaOrganizacion(supabase, orgId, branchId))) {
    throw new AjustesReservaError('SEDE_AJENA');
  }
  const fila = { ...ajustes, organization_id: orgId, branch_id: branchId };
  const r = await escribirAjustes(supabase, orgId, branchId, fila, COLUMNAS_AJUSTES);
  if (esColumnaInexistente(r.error)) {
    // D7 sin aplicar: se guarda lo de siempre (las columnas nuevas no existen).
    const r2 = await escribirAjustes(supabase, orgId, branchId, sinColumnasD7(fila), COLUMNAS_AJUSTES_SIN_D7);
    if (r2.error) throw new AjustesReservaError('ERROR_BD', r2.error.message);
    return filaADto(r2.data as unknown as Record<string, unknown>) as AjustesReservaDto;
  }
  if (r.error) throw new AjustesReservaError('ERROR_BD', r.error.message);
  return filaADto(r.data as unknown as Record<string, unknown>) as AjustesReservaDto;
}

async function escribirAjustes(
  supabase: SupabaseClient,
  orgId: number,
  branchId: number | null,
  fila: Record<string, unknown>,
  columnas: string,
): Promise<{ data: unknown; error: { code?: string; message: string } | null }> {
  if (branchId != null) {
    return supabase
      .from('restaurant_booking_settings')
      .upsert(fila, { onConflict: 'organization_id,branch_id' })
      .select(`branch_id, ${columnas}`)
      .single();
  }
  const { data: existente, error: errLectura } = await supabase
    .from('restaurant_booking_settings')
    .select('id')
    .eq('organization_id', orgId)
    .is('branch_id', null)
    .maybeSingle();
  if (errLectura) throw new AjustesReservaError('ERROR_BD', errLectura.message);
  const escritura = existente
    ? supabase.from('restaurant_booking_settings').update(fila).eq('id', (existente as { id: string }).id)
    : supabase.from('restaurant_booking_settings').insert(fila);
  return escritura.select(`branch_id, ${columnas}`).single();
}

// ── Pasarela para cobrar el depósito en el sitio (D7) ───────────────────────

/**
 * Código de la pasarela integrada activa con la que el sitio cobra el depósito
 * (`fn_reserva_mesa_pasarela`: método de pago con `integration_connection_id`
 * y conexión activa; hoy solo Wompi), o `null`. Sin la migración D7 la RPC no
 * existe y se responde `null`: el interruptor sigue deshabilitado como antes.
 */
export async function pasarelaParaDeposito(supabase: SupabaseClient, orgId: number): Promise<string | null> {
  const { data, error } = await supabase.rpc('fn_reserva_mesa_pasarela', { p_organization_id: orgId });
  if (error) {
    if (error.code !== 'PGRST202') console.error('[reservas] pasarela del depósito', { orgId, code: error.code });
    return null;
  }
  return typeof data === 'string' && data ? data : null;
}

// ── Turnos de un día (Agenda del POS) ───────────────────────────────────────

const DIA_DE_SEMANA: readonly DiaServicio[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Turnos de reserva de una fecha `YYYY-MM-DD` (día calendario de la sede, sin
 * zona: es un `date`). Misma regla que `fn_restaurant_franjas` (D1): si el día
 * tiene clave en `service_hours`, sus turnos (lista vacía = sin reservas); si no,
 * los turnos por defecto.
 */
export function turnosDeFecha(
  serviceHours: AjustesReservaDto['service_hours'] | null | undefined,
  fecha: string,
): ReadonlyArray<{ from: string; to: string }> {
  const [a, m, d] = fecha.split('-').map(Number);
  const dia = DIA_DE_SEMANA[new Date(Date.UTC(a, (m || 1) - 1, d || 1)).getUTCDay()];
  const propios = serviceHours?.[dia];
  return propios ?? TURNOS_POR_DEFECTO;
}
