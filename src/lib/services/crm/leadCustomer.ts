import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * F1 (cierre) — ficha de cliente del alta de leads. Extraído de
 * `leadCreateService.ts` (que superaba las 300 líneas al integrar la
 * asignación automática) SIN cambiar comportamiento: un lead SIEMPRE nace con
 * ficha (`customers`): existente y de la organización, o nueva con
 * `lifecycle_stage='lead'` y al menos correo o teléfono.
 */

export interface NewCustomerInput {
  /** Conveniencia: se parte en first_name / last_name si no vienen sueltos. */
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
  customer_type?: string;
}

/** Contexto mínimo que necesita este módulo (subconjunto de `LeadCreateContext`). */
export interface LeadCustomerContext {
  organizationId: number;
  supabase: SupabaseClient;
}

/** Fallo de validación (400) o de unicidad (409) del alta. */
export interface LeadCreateFailure {
  status: 400 | 409;
  error: string;
  extra?: Record<string, unknown>;
}

export type LeadCustomerResolution =
  | { ok: true; customerId: string; createdCustomerId: string | null }
  | { ok: false; result: LeadCreateFailure };

/**
 * Violación de unicidad de Postgres. La base tiene dos índices que este alta
 * puede tocar: `unique_customer_email_per_org` sobre `(organization_id, email)`
 * y `unique_customer_id_per_org` sobre `(organization_id, identification_number)`.
 * Dar de alta a alguien que ya está en la ficha es un caso NORMAL de uso, no un
 * fallo del servidor.
 */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';
}

function violatesEmailIndex(error: unknown): boolean {
  const message = typeof error === 'object' && error !== null ? String((error as { message?: unknown }).message ?? '') : '';
  return message.includes('unique_customer_email_per_org');
}

export function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * `customers.full_name` es una columna GENERADA (verificado en `pg_attribute`
 * el 2026-09-09): se calcula desde `first_name`/`last_name` para personas y
 * desde `company_name`/`trade_name` para empresas. Escribirla directamente
 * hace fallar el INSERT, así que el nombre se parte aquí.
 */
export function splitPersonName(input: NewCustomerInput): { first: string | null; last: string | null } {
  const first = clean(input.first_name);
  const last = clean(input.last_name);
  if (first || last) return { first, last };

  const full = clean(input.full_name);
  if (!full) return { first: null, last: null };

  const parts = full.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

const bad = (error: string): LeadCreateFailure => ({ status: 400, error });
const conflict = (error: string, extra: Record<string, unknown> = {}): LeadCreateFailure => ({ status: 409, error, extra });
const fail = (result: LeadCreateFailure): LeadCustomerResolution => ({ ok: false, result });

/**
 * Resuelve la ficha del lead: `customer_id` existente (validado contra la
 * organización) o `new_customer` (se crea). Errores de BD inesperados se lanzan.
 */
export async function resolveLeadCustomer(
  ctx: LeadCustomerContext,
  body: { customer_id?: string; new_customer?: NewCustomerInput },
  branchId: number | null,
): Promise<LeadCustomerResolution> {
  const { supabase, organizationId } = ctx;
  let customerId = clean(body.customer_id);
  let createdCustomerId: string | null = null;

  if (customerId) {
    const { data: customer, error } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!customer) return fail(bad('El cliente no pertenece a la organización'));
  } else if (body.new_customer) {
    const email = clean(body.new_customer.email);
    const phone = clean(body.new_customer.phone);
    const companyName = clean(body.new_customer.company_name);
    const customerType = clean(body.new_customer.customer_type) || 'person';
    const { first, last } = splitPersonName(body.new_customer);

    if (customerType === 'company') {
      if (!companyName) return fail(bad('Un cliente de tipo empresa necesita razón social'));
    } else if (!first) {
      return fail(bad('El nombre del cliente nuevo es obligatorio'));
    }
    // Un lead sin forma de contacto es exactamente el registro inútil que este
    // alta viene a evitar.
    if (!email && !phone) return fail(bad('El cliente nuevo necesita al menos correo o teléfono'));

    // `full_name` NO se envía: es columna generada (ver splitPersonName).
    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        organization_id: organizationId,
        branch_id: branchId,
        first_name: first,
        last_name: last,
        email,
        phone,
        company_name: companyName,
        customer_type: customerType,
        lifecycle_stage: 'lead',
      })
      .select('id, full_name')
      .single();
    if (error) {
      // Correo ya usado en esta organización: se devuelve el cliente que ya
      // existe para que la interfaz pueda ofrecer «usar el existente».
      if (isUniqueViolation(error) && violatesEmailIndex(error) && email) {
        const { data: existente } = await supabase
          .from('customers')
          .select('id, full_name')
          .eq('organization_id', organizationId)
          .eq('email', email)
          .maybeSingle();
        return fail(conflict(
          `Ya existe un cliente con el correo ${email} en esta organización. ` +
            'Usa ese cliente para crear el lead en vez de crear una ficha repetida.',
          { existing_customer: existente ?? null },
        ));
      }
      if (isUniqueViolation(error)) {
        return fail(conflict('Ya existe un cliente con esos datos en esta organización. Busca la ficha existente en vez de crear una repetida.'));
      }
      throw error;
    }

    customerId = customer.id as string;
    createdCustomerId = customerId;
  } else {
    return fail(bad('Un lead necesita ficha de cliente: envía customer_id o new_customer'));
  }

  return { ok: true, customerId, createdCustomerId };
}

/** Borra una ficha recién creada cuya alta de lead no cuajó (mejor esfuerzo, se registra si falla). */
export async function rollbackCustomer(ctx: LeadCustomerContext, customerId: string): Promise<void> {
  const { error } = await ctx.supabase.from('customers').delete().eq('id', customerId).eq('organization_id', ctx.organizationId);
  if (error) {
    console.error('[leadCustomer] no se pudo revertir el cliente %s tras fallar el alta del lead: %s', customerId, error.message);
  }
}
