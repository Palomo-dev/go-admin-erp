import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmHttpError, exigirUuid } from './crmErrors';

/** Datos usados por la cabecera de la ficha única; sin metadata interna. */
export interface ClienteFicha {
  id: string;
  organization_id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string | null;
  address: string;
  city: string;
  notes: string;
  tags: string[];
  preferences: unknown;
  created_at: string;
  updated_at: string;
  avatar_url: string | null;
  customer_type: string;
  identification_type: string | null;
  identification_number: string | null;
  dv: number | null;
  lifecycle_stage: string;
  status: string;
  do_not_call: boolean;
}

const COLUMNAS = 'id,organization_id,first_name,last_name,full_name,email,phone,address,city,notes,tags,preferences,created_at,updated_at,avatar_url,customer_type,identification_type,identification_number,dv,lifecycle_stage,status,do_not_call';

/** Organización validada por la ruta; lectura con el usuario y RLS. */
export async function leerFichaCliente(supabase: SupabaseClient, organizationId: number, id: string, soloLeads = false): Promise<ClienteFicha> {
  exigirUuid(id);
  let query = supabase.from('customers').select(COLUMNAS).eq('organization_id', organizationId).eq('id', id);
  if (soloLeads) query = query.eq('lifecycle_stage', 'lead');
  const { data, error } = await query.returns<ClienteFicha[]>().maybeSingle();
  if (error) throw error;
  if (!data) throw new CrmHttpError(404, 'cliente_no_encontrado', 'Cliente no encontrado');
  // Los campos opcionales de la base no obligan a cada consumidor de la
  // cabecera a inventar su propio respaldo; las fechas vacías no se muestran.
  return { ...data, first_name: data.first_name ?? '', last_name: data.last_name ?? '',
    full_name: data.full_name ?? '', email: data.email ?? '', address: data.address ?? '',
    city: data.city ?? '', notes: data.notes ?? '', tags: data.tags ?? [],
    created_at: data.created_at ?? '', updated_at: data.updated_at ?? '' } as ClienteFicha;
}
