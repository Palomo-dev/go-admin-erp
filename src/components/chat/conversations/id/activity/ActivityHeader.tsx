'use client';

import React from 'react';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { KpiStrip, StatCard, clasesBoton } from '@/components/kit';
import type { ActivityStats } from '@/lib/services/conversationActivityService';

interface ActivityHeaderProps {
  stats: ActivityStats | null;
  loading?: boolean;
  onExport?: () => void;
  canExport?: boolean;
}

/**
 * Cifras de la pestaña «Actividad» (Figma 91-chat-11) y «Exportar CSV». El
 * título, «←» y las pestañas los pone `CabeceraConversacion`.
 */
export default function ActivityHeader({ stats, loading, onExport, canExport = false }: ActivityHeaderProps) {
  const t = useTranslations('chatBandeja.actividad');
  return (
    <div className="space-y-3 px-4 pt-4 lg:px-6">
      <KpiStrip columnas={5} etiqueta={t('resumen')}>
        <StatCard tamano="sm" etiqueta={t('total')} valor={stats?.totalActivities ?? 0} cargando={loading} />
        <StatCard tamano="sm" etiqueta={t('estados')} valor={stats?.statusChanges ?? 0} cargando={loading} />
        <StatCard tamano="sm" etiqueta={t('asignaciones')} valor={stats?.assignments ?? 0} cargando={loading} />
        <StatCard tamano="sm" etiqueta={t('etiquetas')} valor={stats?.tagChanges ?? 0} cargando={loading} />
        <StatCard tamano="sm" etiqueta={t('ia')} valor={stats?.aiJobs ?? 0} cargando={loading} />
      </KpiStrip>
      {canExport && onExport ? (
        <div className="flex justify-end">
          <button type="button" onClick={onExport} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            <Download aria-hidden="true" className="size-4" />
            {t('exportar')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
