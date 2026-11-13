'use client';

/**
 * Id de `organization_members` de la persona en la organización activa. Lo
 * piden las escrituras de `knowledgeService` (autoría y auditoría). Antes cada
 * página de Conocimiento repetía esta consulta.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';

export function useMiembroActual(organizationId: number | undefined): number | null {
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!organizationId) return;
      const { data: sesion } = await supabase.auth.getUser();
      if (!sesion.user) return;
      const { data } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', sesion.user.id)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (vivo && data) setId(data.id as number);
    })();
    return () => {
      vivo = false;
    };
  }, [organizationId]);
  return id;
}
