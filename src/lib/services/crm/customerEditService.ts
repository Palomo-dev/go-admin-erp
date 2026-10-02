import { z } from 'zod';
import { splitFullName } from '@/lib/services/customers/customerPayload';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, type CrmSesion } from './crmRouteSupport';

const texto = (max: number) => z.string().trim().max(max).nullable().optional();
export const clienteEdicionSchema = z.object({
  full_name: z.string().trim().min(1).max(200).optional(),
  email: z.union([z.string().trim().email().max(320), z.literal(''), z.null()]).optional(),
  phone: texto(60),
  address: texto(500),
  notes: texto(20000),
  expected_updated_at: z.string().datetime({ offset: true }).nullable().optional(),
}).strict().refine((v) => Object.keys(v).some((k) => k !== 'expected_updated_at'), 'Nada que actualizar');

/** Edición del CRM sobre la ficha canónica, sin escribir columnas generadas. */
export async function editarClienteCrm(ctx: CrmSesion, id: string, input: z.infer<typeof clienteEdicionSchema>) {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesEditar], 'PATCH /api/crm/customers/[id]');
  const { data: actual, error: lectura } = await ctx.supabase.from('customers')
    .select('id, customer_type, updated_at').eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle();
  if (lectura) throw lectura;
  if (!actual) throw new CrmHttpError(404, 'cliente_no_encontrado', 'Cliente no encontrado');
  if (input.expected_updated_at !== undefined && input.expected_updated_at !== actual.updated_at) {
    throw new CrmHttpError(409, 'conflicto', 'El cliente cambió; vuelve a cargarlo antes de guardar');
  }
  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.full_name !== undefined) {
    if (actual.customer_type === 'company') cambios.company_name = input.full_name;
    else {
      const nombre = splitFullName(input.full_name);
      cambios.first_name = nombre.firstName;
      cambios.last_name = nombre.lastName;
    }
  }
  for (const campo of ['email', 'phone', 'address', 'notes'] as const) {
    if (input[campo] !== undefined) cambios[campo] = input[campo]?.trim() || null;
  }
  let query = ctx.supabase.from('customers').update(cambios).eq('id', id).eq('organization_id', ctx.organizationId);
  query = actual.customer_type == null ? query.is('customer_type', null) : query.eq('customer_type', actual.customer_type);
  query = actual.updated_at == null ? query.is('updated_at', null) : query.eq('updated_at', actual.updated_at);
  const { data, error } = await query.select('id, full_name, email, phone, address, notes, updated_at').maybeSingle();
  if (error) throw error;
  if (!data) throw new CrmHttpError(409, 'conflicto', 'El cliente cambió; vuelve a cargarlo antes de guardar');
  return data;
}
