'use client';

/**
 * Búsqueda de oportunidades para la prueba en seco. Solo lectura, desde el
 * cliente del navegador (RLS) y siempre acotada a la organización activa.
 * Columnas verificadas en la BD: opportunities(id, name, amount, currency,
 * status, updated_at, organization_id), stages(name), customers(full_name).
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export interface OpportunityHit {
  id: string;
  name: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  stage_name: string | null;
  customer_name: string | null;
}

interface Row {
  id: string;
  name: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  stage: { name: string } | { name: string }[] | null;
  customer: { full_name: string } | { full_name: string }[] | null;
}

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Escapa los comodines de `ilike` para que «%» o «_» del usuario no filtren de más. */
function likePattern(query: string): string {
  return `%${query.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
}

export function useOpportunitySearch(query: string, enabled: boolean) {
  const [hits, setHits] = useState<OpportunityHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const orgId = getOrganizationId();
    if (!orgId || orgId <= 0) {
      setError('No hay organización activa.');
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      let req = supabase
        .from('opportunities')
        .select('id, name, amount, currency, status, stage:stages(name), customer:customers(full_name)')
        .eq('organization_id', orgId)
        .order('updated_at', { ascending: false })
        .limit(8);
      const q = query.trim();
      if (q) req = req.ilike('name', likePattern(q));
      const { data, error: err } = await req;
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setHits([]);
      } else {
        setHits(((data ?? []) as unknown as Row[]).map((r) => ({
          id: r.id,
          name: r.name,
          amount: r.amount,
          currency: r.currency,
          status: r.status,
          stage_name: first(r.stage)?.name ?? null,
          customer_name: first(r.customer)?.full_name ?? null,
        })));
      }
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, enabled]);

  return { hits, loading, error };
}
