'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/kit';
import { supabase } from '@/lib/supabase/config';
import { mensajeErrorMoneda } from './erroresMonedas';

export interface DialogoMonedaBaseProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizationId: number;
  /** Moneda base actual. */
  actual: string;
  /** La que pasa a ser base. */
  nueva: string | null;
  onCambiada: () => void;
}

/**
 * «Usar como moneda base» (pestaña Monedas). Antes era la pestaña
 * «Preferencias», que repetía la moneda base; el diseño de Finanzas R2 la
 * quita y deja la acción en la fila de cada moneda.
 *
 * GO-sec (2026-09-28): la moneda base y la preferencia que lee
 * resolveOrgCurrency (`settings.finance.default_currency`) se escriben en UNA
 * transacción con la RPC `set_organization_base_currency`, que además exige
 * el permiso en la base. `organization_currencies` no tiene política UPDATE:
 * escribirla directamente afectaba 0 filas sin error.
 *
 * La preferencia «Sincronización automática de tasas»
 * (`settings.auto_sync_exchange_rates`) no la leía nadie y se dejó de mostrar:
 * el catálogo lo mantiene el cron diario de la plataforma.
 */
export default function DialogoMonedaBase({ abierto, onAbiertoChange, organizationId, actual, nueva, onCambiada }: DialogoMonedaBaseProps) {
  const t = useTranslations('finanzasMonedasR2.base');
  const tSeg = useTranslations('monedasSeguridad');
  const [guardando, setGuardando] = useState(false);

  async function confirmar() {
    if (!nueva) return;
    setGuardando(true);
    try {
      const { error: baseError } = await supabase.rpc('set_organization_base_currency', {
        p_organization_id: organizationId,
        p_currency_code: nueva,
      });
      if (baseError) throw baseError;
      toast.success(t('cambiada', { moneda: nueva }));
      onCambiada();
      onAbiertoChange(false);
    } catch (error) {
      toast.error(t('error', { detalle: mensajeErrorMoneda(error, tSeg) }));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ConfirmDialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { moneda: nueva ?? '' })}
      descripcion={t('descripcion', { actual, nueva: nueva ?? '' })}
      textoConfirmar={t('confirmar')}
      tono="advertencia"
      cargando={guardando}
      onConfirmar={confirmar}
    />
  );
}
