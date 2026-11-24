'use client';

/**
 * Formato traducido de la promesa de entrega («45–60 min», «2–4 horas», «3–15 días»).
 * La unidad y los números los decide `promesaEntrega` (contrato compartido con la tienda);
 * aquí solo se ponen las palabras del idioma.
 */
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { FormatoPromesa } from '@/lib/logistica/presentacionEnvio';

export function useFormatoPromesa(): FormatoPromesa {
  const t = useTranslations('logistica.promesa');
  return useMemo<FormatoPromesa>(
    () => (p) => {
      if (p.desde === null) return p.unidad === 'minutos' ? t('minutos', { n: p.hasta }) : t('hasta', { tiempo: t(p.unidad, { n: p.hasta }) });
      if (p.desde === p.hasta) return t(p.unidad, { n: p.hasta });
      return t(`rango.${p.unidad}`, { desde: p.desde, hasta: p.hasta });
    },
    [t],
  );
}
