'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import type { PreviewBusiness } from './sampleData';

interface PreviewBusinessState {
  business?: PreviewBusiness;
  isLoading: boolean;
  /** True cuando la cabecera que se ve es la del negocio y no el respaldo. */
  isReal: boolean;
}

/**
 * Trae la cabecera real del negocio para la previsualizacion.
 *
 * La vista previa existe para comprobar como saldra el ticket de ESTE negocio,
 * asi que la cabecera no puede ser de ejemplo: si el logo no se lee en termico
 * o el NIT esta mal, hay que verlo aqui y no en el primer ticket que se
 * entregue a un cliente.
 *
 * Se lee la sucursal activa (no la principal) porque es la que imprimira, y
 * sus datos de contacto son los que deben salir en el pie.
 */
export function usePreviewBusiness(): PreviewBusinessState {
  const { organization, branch_id } = useOrganization();
  const organizationId = organization?.id;

  const [state, setState] = useState<PreviewBusinessState>({
    isLoading: true,
    isReal: false,
  });

  useEffect(() => {
    if (!organizationId) return;

    let cancelled = false;

    const load = async () => {
      try {
        const { data: org } = await supabase
          .from('organizations')
          .select('name, legal_name, nit, tax_id, phone, email, address, city, logo_url, fiscal_responsibilities')
          .eq('id', organizationId)
          .maybeSingle();

        // Sin sucursal activa se cae a la principal, para no dejar el pie vacio.
        const branchQuery = supabase
          .from('branches')
          .select('name, address, city, phone')
          .eq('organization_id', organizationId);

        const { data: branch } = branch_id
          ? await branchQuery.eq('id', branch_id).maybeSingle()
          : await branchQuery.eq('is_main', true).maybeSingle();

        if (cancelled) return;

        setState({
          isLoading: false,
          isReal: !!org,
          business: org
            ? {
                // Mismo criterio que `PrintService.getBusinessAndBranch` y
                // `toSalePayload`: si aqui se resolviera distinto, la vista
                // previa dejaria de servir para validar el ticket real.
                businessName: org.name || undefined,
                businessNit: org.nit || org.tax_id || undefined,
                businessPhone: org.phone || undefined,
                businessAddress: org.address || undefined,
                businessCity: org.city || undefined,
                businessEmail: org.email || undefined,
                businessFiscalResponsibilities: org.fiscal_responsibilities || undefined,
                businessLogoUrl: org.logo_url || undefined,
                branchName: branch?.name || undefined,
                branchAddress: branch?.address || undefined,
                branchPhone: branch?.phone || undefined,
              }
            : undefined,
        });
      } catch (e) {
        if (cancelled) return;
        // Un fallo aqui no debe dejar la pagina en blanco: la vista previa
        // sigue siendo util con la cabecera de respaldo.
        console.warn('No se pudo cargar la cabecera del negocio para la vista previa:', e);
        setState({ isLoading: false, isReal: false });
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [organizationId, branch_id]);

  return state;
}
