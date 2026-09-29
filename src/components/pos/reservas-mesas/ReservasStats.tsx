'use client';

import { useTranslations } from 'next-intl';
import { Clock, CheckCircle, Users, XCircle, AlertTriangle, CalendarCheck } from 'lucide-react';
import { KpiStrip, StatCard } from '@/components/kit';
import type { ReservationStats } from './reservasMesasService';

interface ReservasStatsProps {
  stats: ReservationStats | null;
  isLoading: boolean;
}

/** Cifras de reservas con `KpiStrip` + `StatCard` (el esqueleto lo pinta `StatCard cargando`). */
export function ReservasStats({ stats, isLoading }: ReservasStatsProps) {
  const t = useTranslations('posReservasMesas.cifras');
  const items = [
    { id: 'total', etiqueta: t('hoy'), valor: stats?.total ?? 0, icono: CalendarCheck },
    { id: 'pending', etiqueta: t('pendientes'), valor: stats?.pending ?? 0, icono: Clock },
    { id: 'confirmed', etiqueta: t('confirmadas'), valor: stats?.confirmed ?? 0, icono: CheckCircle },
    { id: 'seated', etiqueta: t('sentadas'), valor: stats?.seated ?? 0, icono: Users },
    { id: 'cancelled', etiqueta: t('canceladas'), valor: stats?.cancelled ?? 0, icono: XCircle },
    { id: 'no_show', etiqueta: t('noShow'), valor: stats?.no_show ?? 0, icono: AlertTriangle },
  ];

  return (
    <KpiStrip columnas={6} etiqueta={t('etiqueta')}>
      {items.map((item) => (
        <StatCard key={item.id} etiqueta={item.etiqueta} valor={item.valor} icono={item.icono} cargando={isLoading} />
      ))}
    </KpiStrip>
  );
}
