/**
 * Tipos y lógica pura de duplicados y fusión de clientes, compartidos por el
 * servidor (`customerMergeService`) y la pantalla (`identidades/*`). Sin
 * dependencias de servidor.
 */

/** Campos que el principal puede tomar del secundario (lista de la RPC). */
export const CAMPOS_FUSION = ['first_name', 'last_name', 'company_name', 'trade_name', 'identification_type', 'identification_number', 'email', 'phone', 'address', 'city'] as const;
export type CampoFusion = (typeof CAMPOS_FUSION)[number];

export interface ClienteDuplicado {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  trade_name: string | null;
  identification_type: string | null;
  identification_number: string | null;
  address: string | null;
  city: string | null;
  created_at: string;
  conversations_count: number;
  opportunities_count: number;
}

export interface GrupoDuplicados {
  identity_type: 'phone' | 'email' | 'document';
  identity_value: string;
  customers: ClienteDuplicado[];
}

/** Quita los grupos de dos que alguien marcó como «no son el mismo». */
export function sinParejasExcluidas(grupos: readonly GrupoDuplicados[], excluidas: readonly { customer_a: string; customer_b: string }[]): GrupoDuplicados[] {
  const claves = new Set(excluidas.map((e) => [e.customer_a, e.customer_b].sort().join(':')));
  return grupos.filter((g) => !(g.customers.length === 2 && claves.has(g.customers.map((c) => c.id).sort().join(':'))));
}

