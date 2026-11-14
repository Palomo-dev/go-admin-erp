'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { KpiStrip, StatCard } from '@/components/kit';
import { tamanoLegible, type ResumenArchivos } from './archivosLogica';

interface FilesHeaderProps {
  resumen: ResumenArchivos | null;
  loading?: boolean;
}

/**
 * Cifras de la pestaña «Archivos» (Figma 91-chat-12): archivos, tamaño total,
 * imágenes, documentos y audios. El título, «←» y las pestañas los pone
 * `CabeceraConversacion`.
 */
export default function FilesHeader({ resumen, loading }: FilesHeaderProps) {
  const t = useTranslations('chatBandeja.archivos');
  const tk = useTranslations('chatHilo.archivos.kpis');
  const locale = useLocale();
  return (
    <div className="px-4 pt-4 lg:px-6">
      <KpiStrip columnas={5} etiqueta={t('resumen')}>
        <StatCard tamano="sm" etiqueta={t('total')} valor={resumen?.total ?? 0} cargando={loading} />
        <StatCard tamano="sm" etiqueta={t('tamano')} valor={tamanoLegible(resumen?.tamano ?? 0, locale)} cargando={loading} />
        <StatCard tamano="sm" etiqueta={tk('imagenes')} valor={resumen?.imagenes ?? 0} cargando={loading} />
        <StatCard tamano="sm" etiqueta={tk('documentos')} valor={resumen?.documentos ?? 0} cargando={loading} />
        <StatCard tamano="sm" etiqueta={tk('audios')} valor={resumen?.audios ?? 0} cargando={loading} />
      </KpiStrip>
    </div>
  );
}
