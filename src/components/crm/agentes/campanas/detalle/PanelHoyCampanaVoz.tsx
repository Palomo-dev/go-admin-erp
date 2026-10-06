'use client';

/**
 * Panel «Hoy» del detalle de campaña de voz (Figma 1809:144962): tope diario,
 * esta hora, simultáneas, fallos seguidos, reintentos en cola y reprogramadas
 * por la Ley 2300. Cifras de `crm_voice_campaign_hoy`, contadas como la
 * compuerta real de reclamo. Sin la migración, lo dice.
 */

import { useTranslations } from 'next-intl';
import { Tarjeta } from '@/components/kit/Tarjeta';
import { FilaDato, ListaDatos } from '@/components/kit/FilaDato';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { HoyCampanaVoz } from '@/lib/services/crm/voiceCampaignDetailService';

export function PanelHoyCampanaVoz({ hoy }: { hoy: HoyCampanaVoz | null }) {
  const t = useTranslations('crm.campanaVoz');
  const entero = useFormatoEntero();
  const { formatDateTime } = useFormatDate();
  const de = (n: number, tope: number) => t('hoy.deTope', { n: entero(n), tope: entero(tope) });

  return (
    <Tarjeta titulo={t('hoy.titulo')}>
      {hoy ? (
        <ListaDatos etiqueta={t('hoy.titulo')}>
          <FilaDato etiqueta={t('hoy.topeDiario')} valor={de(hoy.cupos.dia, hoy.cupos.tope_dia)} tono={hoy.cupos.dia >= hoy.cupos.tope_dia ? 'advertencia' : undefined} />
          <FilaDato etiqueta={t('hoy.estaHora')} valor={de(hoy.cupos.hora, hoy.cupos.tope_hora)} tono={hoy.cupos.hora >= hoy.cupos.tope_hora ? 'advertencia' : undefined} />
          <FilaDato etiqueta={t('hoy.simultaneas')} valor={de(hoy.cupos.simultaneas, hoy.cupos.tope_simultaneas)} />
          <FilaDato etiqueta={t('hoy.fallos')} valor={de(hoy.cupos.fallos_seguidos, hoy.cupos.tope_fallos)} tono={hoy.cupos.fallos_seguidos > 0 ? 'peligro' : undefined} />
          <FilaDato etiqueta={t('hoy.reintentos')} valor={entero(hoy.reintentos_en_cola)} />
          <FilaDato
            etiqueta={t('hoy.ley2300')}
            valor={entero(hoy.ley2300.reprogramadas)}
            descripcion={hoy.ley2300.proxima ? t('hoy.desde', { cuando: formatDateTime(hoy.ley2300.proxima) }) : undefined}
          />
        </ListaDatos>
      ) : (
        <p className="text-[13px] text-fg-secondary">{t('sinHoy.panel')}</p>
      )}
    </Tarjeta>
  );
}
