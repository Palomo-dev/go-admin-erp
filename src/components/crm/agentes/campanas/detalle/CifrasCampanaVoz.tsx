'use client';

/**
 * Progreso de la audiencia y las 6 cifras del detalle de campaña de voz
 * (Figma 1809:144962: Llamadas, Contestadas, Reuniones agendadas,
 * Devoluciones pendientes, No volver a llamar, Minutos usados).
 */

import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowUp } from 'lucide-react';
import { KpiStrip } from '@/components/kit/KpiStrip';
import { StatCard } from '@/components/kit/StatCard';
import { Tarjeta } from '@/components/kit/Tarjeta';
import { BarraProgreso } from '@/components/kit/BarraProgreso';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { CifrasCampanaVoz as Cifras, HoyCampanaVoz } from '@/lib/services/crm/voiceCampaignDetailService';
import { diasRestantes, progresoAudiencia } from './campanaVozDetalleLogica';

interface Props {
  stats: Cifras;
  hoy: HoyCampanaVoz | null;
  encolados: number;
  contactados: number;
}

export function CifrasCampanaVoz({ stats, hoy, encolados, contactados }: Props) {
  const t = useTranslations('crm.campanaVoz');
  const entero = useFormatoEntero();
  const { formatDateTime } = useFormatDate();
  const dias = hoy ? diasRestantes(contactados, encolados, hoy.cupos.tope_dia) : null;
  const pctContestadas = stats.attempts > 0 ? Math.round((100 * stats.effective) / stats.attempts) : 0;
  const bajas = hoy?.no_volver_a_llamar ?? 0;

  return (
    <>
      <Tarjeta>
        <BarraProgreso
          valor={contactados}
          max={Math.max(encolados, 1)}
          etiqueta={t('progreso.etiqueta')}
          textoValor={
            hoy
              ? `${t('progreso.valor', { n: entero(contactados), total: entero(encolados), pct: progresoAudiencia(contactados, encolados) })}${dias ? ` · ${t('progreso.faltan', { n: dias })}` : ''}`
              : t('progreso.sinDato')
          }
        />
      </Tarjeta>

      <KpiStrip etiqueta={t('kpi.aria')} columnas={6}>
        <StatCard etiqueta={t('kpi.llamadas')} valor={entero(stats.attempts)} detalle={t('kpi.hoy', { n: entero(stats.today) })} />
        <StatCard
          etiqueta={t('kpi.contestadas')}
          valor={entero(stats.effective)}
          detalle={t('kpi.pctLlamadas', { pct: pctContestadas })}
          tono={stats.effective > 0 ? 'exito' : 'neutro'}
          iconoDetalle={stats.effective > 0 ? ArrowUp : undefined}
        />
        <StatCard
          etiqueta={t('kpi.reuniones')}
          valor={entero(stats.meetings)}
          detalle={t('kpi.enCalendario')}
          tono={stats.meetings > 0 ? 'exito' : 'neutro'}
          iconoDetalle={stats.meetings > 0 ? ArrowUp : undefined}
        />
        <StatCard
          etiqueta={t('kpi.devoluciones')}
          valor={hoy ? entero(hoy.devoluciones.pendientes) : '—'}
          detalle={hoy?.devoluciones.proxima ? t('kpi.proxima', { cuando: formatDateTime(hoy.devoluciones.proxima) }) : hoy ? t('kpi.sinProxima') : t('kpi.sinDato')}
        />
        <StatCard
          etiqueta={t('kpi.noVolver')}
          valor={hoy ? entero(bajas) : '—'}
          detalle={hoy ? t('kpi.bajaRegistrada') : t('kpi.sinDato')}
          tono={bajas > 0 ? 'advertencia' : 'neutro'}
          iconoDetalle={bajas > 0 ? AlertTriangle : undefined}
        />
        <StatCard
          etiqueta={t('kpi.minutos')}
          valor={entero(Math.round(stats.conversation_minutes))}
          detalle={stats.remaining_minutes === null ? t('kpi.ilimitado') : t('kpi.quedan', { n: entero(stats.remaining_minutes) })}
        />
      </KpiStrip>
    </>
  );
}
