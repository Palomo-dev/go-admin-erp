import { z } from 'zod';
import { CrmHttpError } from './crmErrors';
export const segmentoBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).nullable().optional(),
    filter_json: z.union([z.record(z.unknown()), z.array(z.unknown())]),
    is_dynamic: z.boolean(),
    expected_updated_at: z.string().datetime({ offset: true }).optional(),
    refresh_members: z.boolean().optional(),
    member_ids: z.array(z.string().uuid()).min(1).max(5000).optional(),
  })
  .strict();
export const segmentoPreviewBody = z.object({ filter_json: z.union([z.record(z.unknown()), z.array(z.unknown())]) }).strict();
export const segmentoMembersQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export function validarSegmento<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new CrmHttpError(400, 'datos_invalidos', 'Revisa los datos del segmento');
  return result.data;
}
