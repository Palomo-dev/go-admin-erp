'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Users, Clock, ChefHat, Receipt, UserCircle } from 'lucide-react';
import { KpiStrip, StatCard } from '@/components/kit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';

interface MesaStatsCardsProps {
  customers: number;
  tiempoSesion: string;
  itemsCount: number;
  total: number;
  serverName?: string;
  onEditarComensales: () => void;
  onEditarMesero?: () => void;
}

/** Cifras de la mesa con `KpiStrip` + `StatCard` del kit. «Comensales» y «Mesero» se editan al pulsarlas. */
export function MesaStatsCards({
  customers,
  tiempoSesion,
  itemsCount,
  total,
  serverName,
  onEditarComensales,
  onEditarMesero,
}: MesaStatsCardsProps) {
  const t = useTranslations('posMesas.cifras');
  const { formatear } = useMonedaOrganizacion();
  return (
    <KpiStrip columnas={5} etiqueta={t('etiqueta')}>
      <StatCard etiqueta={t('comensales')} valor={customers} icono={Users} onClick={onEditarComensales} />
      <StatCard etiqueta={t('tiempo')} valor={tiempoSesion || '—'} icono={Clock} />
      <StatCard etiqueta={t('items')} valor={itemsCount} icono={ChefHat} />
      <StatCard etiqueta={t('total')} valor={formatear(total)} icono={Receipt} tono="marca" resaltada />
      <StatCard etiqueta={t('mesero')} valor={serverName || t('sinAsignar')} icono={UserCircle} onClick={onEditarMesero} />
    </KpiStrip>
  );
}
