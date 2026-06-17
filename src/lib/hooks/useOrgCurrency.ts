'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';

const CACHE_KEY = 'org_base_currency';

/**
 * Hook que retorna el código de moneda base de la organización actual
 * (tabla organization_currencies, is_base = true). Por defecto 'COP'.
 * Usa caché en localStorage para evitar consultas repetidas.
 */
export function useOrgCurrency(): string {
  const { organization } = useOrganization();
  const [currency, setCurrency] = useState<string>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { orgId, code } = JSON.parse(cached);
        const localOrg = localStorage.getItem('currentOrganizationId');
        if (localOrg && Number(localOrg) === orgId) return code;
      }
    } catch (_) { /* usar default */ }
    return 'COP';
  });

  useEffect(() => {
    if (!organization?.id) return;
    let cancelado = false;

    const fetchCurrency = async () => {
      try {
        // Usar caché si corresponde a la organización actual
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { orgId, code } = JSON.parse(cached);
          if (orgId === organization.id) {
            if (!cancelado) setCurrency(code);
            return;
          }
        }

        const { data } = await supabase
          .from('organization_currencies')
          .select('currency_code')
          .eq('organization_id', organization.id)
          .eq('is_base', true)
          .maybeSingle();

        const code = data?.currency_code || 'COP';
        localStorage.setItem(CACHE_KEY, JSON.stringify({ orgId: organization.id, code }));
        if (!cancelado) setCurrency(code);
      } catch (_) {
        // Mantener default COP
      }
    };

    fetchCurrency();
    return () => {
      cancelado = true;
    };
  }, [organization?.id]);

  return currency;
}

/**
 * Formatea un valor monetario sin decimales según la moneda indicada.
 */
export function formatMonedaSinDecimales(value: number | string, currency: string = 'COP'): string {
  const numero = Math.round(Number(value) || 0);
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numero);
  } catch (_) {
    return `${currency} ${numero.toLocaleString('es-CO')}`;
  }
}
