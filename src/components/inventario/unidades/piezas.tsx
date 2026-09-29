'use client';

import { useTranslations } from 'next-intl';
import { StatusBadge, type TonoBadge } from '@/components/kit';
import type { AmbitoConversion, TipoUnidad } from './tipos';

const TONO_TIPO: Record<TipoUnidad, TonoBadge> = {
  count: 'informacion',
  weight: 'exito',
  volume: 'advertencia',
  length: 'neutro',
  area: 'marca',
};

/** Conteo · Peso · Volumen · Longitud · Área (Figma `593:333689`). */
export function BadgeTipoUnidad({ tipo }: { tipo: TipoUnidad }) {
  const t = useTranslations('inventarioUnidades.tipos');
  return <StatusBadge estado={tipo} etiqueta={t(tipo)} tono={TONO_TIPO[tipo]} apariencia="contorno" tamano="sm" />;
}

/** «Del sistema» · «Mi empresa» · «Solo <producto>». */
export function BadgeAmbito({ ambito, producto }: { ambito: AmbitoConversion; producto?: string | null }) {
  const t = useTranslations('inventarioUnidades.ambitos');
  const etiqueta = ambito === 'producto' && producto ? t('productoDe', { producto }) : t(ambito);
  return (
    <StatusBadge
      estado={ambito}
      etiqueta={etiqueta}
      tono={ambito === 'sistema' ? 'neutro' : 'marca'}
      apariencia="suave"
      tamano="sm"
      className="max-w-[220px] truncate"
    />
  );
}
