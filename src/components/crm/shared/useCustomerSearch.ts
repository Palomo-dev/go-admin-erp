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
import { ilikeAnyOf } from '@/lib/utils/postgrestFilters';

export interface CustomerHit {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
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
      // Helper único: el término va entrecomillado, así que comas, paréntesis o
      // comillas del usuario no rompen el filtro `or` de PostgREST (PGRST100).
      const filter = ilikeAnyOf(['full_name', 'email'], query);
      if (filter) req = req.or(filter);
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
