'use client';

/**
 * Aviso para la EMPRESA que factura (decisión 3 del dueño, 2026-11-25): si su RUT la marca 49 (no
 * responsable de IVA) y la factura lleva IVA (p. ej. comisiones por recaudo), debe actualizar el RUT
 * a 48. Solo avisa: nunca bloquea. La regla vive en `rutNoResponsableConIva`; la cola de Factus
 * deja el mismo aviso en el envío.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { rutNoResponsableConIva } from '@/lib/clientes/facturacionElectronica';

export interface AvisoRutNoResponsableProps {
  organizationId: number;
  lineas: ReadonlyArray<{ tax_rate?: number | string | null; tax_code?: string | null }>;
}

export function AvisoRutNoResponsable({ organizationId, lineas }: AvisoRutNoResponsableProps) {
  const t = useTranslations('clientesFacturacion');
  const [responsabilidades, setResponsabilidades] = useState<string[] | null>(null);

  useEffect(() => {
    let vivo = true;
    void supabase
      .from('organizations')
      .select('fiscal_responsibilities')
      .eq('id', organizationId)
      .maybeSingle()
      .then(({ data }) => {
        if (vivo) setResponsabilidades(((data as { fiscal_responsibilities?: string[] | null } | null)?.fiscal_responsibilities ?? null));
      });
    return () => {
      vivo = false;
    };
  }, [organizationId]);

  if (!rutNoResponsableConIva(responsabilidades, lineas)) return null;
  return <AvisoTonal tono="advertencia" titulo={t('rut.titulo')} descripcion={t('rut.texto')} accion={{ etiqueta: t('rut.accion'), href: '/app/finanzas/tributario/perfil' }} />;
}
