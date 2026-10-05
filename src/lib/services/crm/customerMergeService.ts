import { z } from 'zod';
import type { CrmSesion } from './crmRouteSupport';
import { CrmHttpError } from './crmRouteSupport';

import { CAMPOS_FUSION } from './customerDuplicatesLogica';

const esquemaFusion = z
  .object({
    primary_customer_id: z.string().uuid(),
    secondary_customer_ids: z.array(z.string().uuid()).length(1),
    choices: z.record(z.enum(CAMPOS_FUSION), z.string().uuid()).default({}),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.secondary_customer_ids.includes(value.primary_customer_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['secondary_customer_ids'],
        message: 'Los clientes deben ser diferentes',
      });
    }
    const ids = [value.primary_customer_id, ...value.secondary_customer_ids];
    if (Object.values(value.choices).some((id) => !ids.includes(id))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['choices'],
        message: 'La elección debe pertenecer a los clientes comparados',
      });
    }
  });

export function validarFusion(body: unknown) {
  const parsed = esquemaFusion.safeParse(body);
  if (!parsed.success)
    throw new CrmHttpError(
      400,
      'seleccion_invalida',
      'Revisa los clientes y los campos seleccionados',
    );
  return parsed.data;
}

export async function fusionarClientes(ctx: CrmSesion, body: unknown) {
  const value = validarFusion(body);
  const { data, error } = await ctx.supabase.rpc('crm_merge_customers', {
    p_org: ctx.organizationId,
    p_primary: value.primary_customer_id,
    p_secondaries: value.secondary_customer_ids,
    p_choices: value.choices,
  });
  if (error) throw error;
  return data;
}

export async function deshacerFusion(ctx: CrmSesion, id: string) {
  const { data, error } = await ctx.supabase.rpc('crm_unmerge_customer', {
    p_org: ctx.organizationId,
    p_merge: id,
  });
  if (error) throw error;
  return data;
}
