'use client';

/**
 * Búsqueda de oportunidades para «Registrar deal» (Figma 1318:91569): la
 * función `buscar` del `SelectorEntidad` del kit. Solo lectura desde el
 * navegador (RLS) y acotada a la organización activa; registrar el deal va por
 * `POST /api/crm/partners/[id]/deals`, que vuelve a comprobar que la
 * oportunidad sea de la organización de la sesión.
 * Columnas verificadas por MCP (2026-11-15): opportunities(id, name, amount,
 * currency, status, updated_at, organization_id, customer_id) y customers(full_name).
 */

import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { likePattern } from '@/lib/utils/postgrestFilters';

export interface OportunidadElegible {
  id: string;
  name: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  customer_name: string | null;
}

interface Fila {
  id: string;
  name: string;
  amount: number | string | null;
  currency: string | null;
  status: string | null;
  customer: { full_name: string | null } | Array<{ full_name: string | null }> | null;
}

export async function buscarOportunidadesPartner(texto: string, senal: AbortSignal): Promise<OportunidadElegible[]> {
  const orgId = getOrganizationId();
  if (!orgId || orgId <= 0) throw new Error('sin-organizacion');
  let consulta = supabase
    .from('opportunities')
    .select('id, name, amount, currency, status, customer:customers(full_name)')
    .eq('organization_id', orgId)
    .order('updated_at', { ascending: false })
    .limit(20)
    .abortSignal(senal);
  const q = texto.trim();
  if (q) consulta = consulta.ilike('name', likePattern(q));
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Fila[]).map((r) => {
    const cliente = Array.isArray(r.customer) ? r.customer[0] ?? null : r.customer;
    const amount = r.amount === null ? null : Number(r.amount);
    return { id: r.id, name: r.name, amount: Number.isFinite(amount) ? amount : null, currency: r.currency?.trim() || null, status: r.status, customer_name: cliente?.full_name ?? null };
  });
}
