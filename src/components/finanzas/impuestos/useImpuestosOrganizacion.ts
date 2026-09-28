"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { sinRetenciones, soloRetenciones, type ClaseImpuesto } from '@/lib/services/taxResolverCore';

/** Fila de `list_organization_taxes` (SETOF organization_taxes). */
export interface OrganizationTax {
  id: string;
  organization_id: number;
  template_id: number | null;
  name: string;
  rate: number;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  tax_included?: boolean;
  /** 'tax' (impuesto de venta y compra) o 'withholding' (retención). */
  kind?: ClaseImpuesto | null;
  created_at: string;
  updated_at: string;
}

/**
 * Impuestos de la organización para Finanzas › Impuestos, ya separados por
 * clase: los de venta y compra y las retenciones. Una sola lectura (la RPC
 * `list_organization_taxes`) y un solo filtro (`sinRetenciones`), el mismo que
 * usan producto, POS y facturas.
 */
export function useImpuestosOrganizacion() {
  const { toast } = useToast();
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [taxes, setTaxes] = useState<OrganizationTax[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    try {
      const orgId = getOrganizationId();
      if (orgId) {
        setOrganizationId(orgId);
      } else {
        setLoading(false);
        toast({ title: 'Advertencia', description: 'No se encontró una organización activa.', variant: 'destructive' });
      }
    } catch (err) {
      console.error('Error al obtener la organización activa:', err);
      setLoading(false);
      toast({ title: 'Error', description: 'No se pudo obtener la información de la organización.', variant: 'destructive' });
    }
    // Solo al montar: la organización activa no cambia sin recargar la página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recargar = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(false);
    try {
      const { data, error: rpcError } = await supabase.rpc('list_organization_taxes', {
        p_organization_id: organizationId,
      });
      if (rpcError) throw rpcError;
      setTaxes((data ?? []) as OrganizationTax[]);
    } catch (err) {
      console.error('Error al cargar los impuestos:', err);
      setError(true);
      toast({ title: 'Error', description: 'No se pudieron cargar los impuestos. Intente de nuevo.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    if (organizationId) void recargar();
  }, [organizationId, recargar]);

  const impuestos = useMemo(() => sinRetenciones(taxes), [taxes]);
  const retenciones = useMemo(() => soloRetenciones(taxes), [taxes]);

  return { organizationId, impuestos, retenciones, loading, error, recargar };
}
