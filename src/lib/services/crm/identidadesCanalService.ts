/**
 * «Identidades por canal» (pestaña de Identidades, Figma CRM 1436:19): cómo
 * se reconoce a cada cliente en cada canal (`customer_channel_identities`:
 * sesión del widget, WhatsApp, Instagram…). SOLO lectura y SOLO servidor, con
 * el cliente de la sesión y la organización de la sesión.
 *
 * Antes la pestaña inventaba identidades «virtuales» a partir del correo y el
 * teléfono del cliente y las editaba y borraba desde el navegador (con ids que
 * no existían en la tabla). Las identidades las crean los canales al recibir
 * mensajes y se mueven con la fusión (`crm_merge_customers`).
 */
import { z } from 'zod';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, type CrmSesion } from './crmRouteSupport';
import { ilikeAnyOf } from '@/lib/utils/postgrestFilters';

export interface IdentidadCanal {
  id: string;
  identity_type: string;
  identity_value: string;
  verified: boolean;
  last_seen_at: string | null;
  created_at: string;
  cliente: { id: string; nombre: string | null } | null;
  canal: { id: string; nombre: string | null; tipo: string | null } | null;
}

export const filtrosIdentidadesSchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    canal: z.string().trim().regex(/^[a-z_]{2,30}$/).optional(),
  })
  .strict();

const LIMITE = 200;

type Uno<T> = T | T[] | null;
const uno = <T>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export async function listarIdentidadesCanal(ctx: CrmSesion, filtrosCrudos: unknown): Promise<{ identidades: IdentidadCanal[]; limite: number }> {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesVer], 'identidades por canal');
  const p = filtrosIdentidadesSchema.safeParse(filtrosCrudos);
  if (!p.success) throw new CrmHttpError(400, 'filtro_invalido', 'Filtro inválido');
  const { q, canal } = p.data;

  // `!inner` solo cuando se filtra por tipo de canal: si no, también salen las identidades sin canal.
  const relCanal = canal ? 'channel:channels!inner(id, name, type)' : 'channel:channels(id, name, type)';
  let consulta = ctx.supabase
    .from('customer_channel_identities')
    .select(`id, identity_type, identity_value, verified, last_seen_at, created_at, customer:customers(id, full_name, company_name), ${relCanal}`)
    .eq('organization_id', ctx.organizationId)
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .limit(LIMITE);
  if (canal) consulta = consulta.eq('channel.type', canal);
  if (q) {
    const filtro = ilikeAnyOf(['identity_value'], q);
    if (filtro) consulta = consulta.or(filtro);
  }
  const { data, error } = await consulta;
  if (error) throw error;

  type Fila = Omit<IdentidadCanal, 'cliente' | 'canal'> & {
    customer: Uno<{ id: string; full_name: string | null; company_name: string | null }>;
    channel: Uno<{ id: string; name: string | null; type: string | null }>;
  };
  const identidades = ((data ?? []) as unknown as Fila[]).map(({ customer, channel, ...resto }) => {
    const c = uno(customer);
    const ch = uno(channel);
    return {
      ...resto,
      cliente: c ? { id: c.id, nombre: c.full_name?.trim() || c.company_name?.trim() || null } : null,
      canal: ch ? { id: ch.id, nombre: ch.name, tipo: ch.type } : null,
    };
  });
  return { identidades, limite: LIMITE };
}
