'use client';

/**
 * Búsqueda de clientes para pickers (F12: referidor de un referido). Solo
 * lectura, desde el cliente del navegador (RLS) y siempre acotada a la
 * organización activa. Misma forma que `useOpportunitySearch` (Automatizaciones).
 * Columnas verificadas en la BD: customers(id, full_name, email, phone,
 * organization_id); `full_name` es columna generada.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export interface CustomerHit {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

/** Escapa los comodines de `ilike` para que «%» o «_» del usuario no filtren de más. */
export function likePattern(query: string): string {
  return `%${query.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
}

export function useCustomerSearch(query: string, enabled: boolean) {
  const [hits, setHits] = useState<CustomerHit[]>([]);
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
        .from('customers')
        .select('id, full_name, email, phone')
        .eq('organization_id', orgId)
        .order('updated_at', { ascending: false })
        .limit(8);
      // Coma y paréntesis son sintaxis del filtro `or` de PostgREST: se neutralizan.
      const q = query.replace(/[,()]/g, ' ').trim();
      if (q) req = req.or(`full_name.ilike.${likePattern(q)},email.ilike.${likePattern(q)}`);
      const { data, error: err } = await req;
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setHits([]);
      } else {
        setHits((data ?? []) as CustomerHit[]);
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
