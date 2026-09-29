import type { SupabaseClient } from '@supabase/supabase-js';
import { LIMITE_BUSQUEDA_CLIENTES, type PaginaClientes } from '@/lib/clientes/busqueda';

/**
 * Búsqueda única de clientes en el servidor: RPC `fn_clientes_buscar`
 * (SECURITY DEFINER con `fn_assert_acceso_org`, sin acceso anónimo).
 *
 * Toda pantalla que busca clientes (POS, selectores del kit, CRM, PMS,
 * transporte, parqueadero, membresías, chat, GO Assistant…) pasa por aquí; el
 * texto del usuario viaja como parámetro de la RPC y NUNCA se interpola en un
 * filtro `.or()` de PostgREST (una coma o un paréntesis rompían la consulta).
 * Las reglas (tildes, palabras, dígitos, relevancia y orden) están en
 * `src/lib/clientes/busqueda.ts`, que es el espejo que usa el POS sin red.
 *
 * Recibe el cliente de Supabase de quien llama: el del navegador
 * (`@/lib/supabase/config`) o el de sesión del servidor (`ctx.supabase`).
 */

/** Fila de `customers` tal cual (todas sus columnas) más su relevancia (0 = exacta … 3). */
export type ClienteEncontrado = {
  id: string;
  organization_id: number;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  trade_name: string | null;
  email: string | null;
  phone: string | null;
  identification_type: string | null;
  identification_number: string | null;
  doc_type: string | null;
  doc_number: string | null;
  customer_type: string | null;
  status: string | null;
  avatar_url: string | null;
  user_id: string | null;
  branch_id: number | null;
  address: string | null;
  city: string | null;
  relevancia: number;
} & Record<string, unknown>;

export interface OpcionesBusquedaClientes {
  organizationId: number;
  texto: string | null | undefined;
  /** 1-100 (por defecto 20). */
  limite?: number;
  desde?: number;
  /** Solo personas o solo empresas. */
  tipo?: 'person' | 'company' | null;
  /** `customers.status` exacto; sin él, todos. */
  estado?: string | null;
}

export async function buscarClientes(
  db: Pick<SupabaseClient, 'rpc'>,
  { organizationId, texto, limite = LIMITE_BUSQUEDA_CLIENTES, desde = 0, tipo = null, estado = null }: OpcionesBusquedaClientes,
): Promise<PaginaClientes<ClienteEncontrado>> {
  const { data, error } = await db.rpc('fn_clientes_buscar', {
    p_organization_id: organizationId,
    p_q: texto ?? '',
    p_limit: limite,
    p_offset: desde,
    p_tipo: tipo,
    p_estado: estado,
  });
  if (error) throw error;
  const r = (data ?? {}) as { total?: number | string; filas?: ClienteEncontrado[] };
  const total = Number(r.total ?? 0);
  return { filas: Array.isArray(r.filas) ? r.filas : [], total: Number.isFinite(total) ? total : 0 };
}
