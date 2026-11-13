'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { KpiStrip, StatCard } from '@/components/kit';
import type { FileStats } from '@/lib/services/conversationFilesService';

interface FilesHeaderProps {
  stats: FileStats | null;
  loading?: boolean;
}

/** «1,5 MB»: tamaño legible. */
export function tamanoLegible(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const unidades = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(unidades.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(1))} ${unidades[i]}`;
}

/**
 * Cifras de la pestaña «Archivos» (Figma 91-chat-12). El título, «←» y las
 * pestañas los pone `CabeceraConversacion`.
 */
export default function FilesHeader({ stats, loading }: FilesHeaderProps) {
  const t = useTranslations('chatBandeja.archivos');
  const tipos = Object.entries(stats?.byType ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 2);
  return (
    <div className="px-4 pt-4 lg:px-6">
      <KpiStrip columnas={4} etiqueta={t('resumen')}>
        <StatCard tamano="sm" etiqueta={t('total')} valor={stats?.totalFiles ?? 0} cargando={loading} />
        <StatCard tamano="sm" etiqueta={t('tamano')} valor={tamanoLegible(stats?.totalSize ?? 0)} cargando={loading} />
        {tipos.map(([tipo, n]) => (
          <StatCard key={tipo} tamano="sm" etiqueta={tipo} valor={n} cargando={loading} />
        ))}
      </KpiStrip>
    </div>
  );
}
