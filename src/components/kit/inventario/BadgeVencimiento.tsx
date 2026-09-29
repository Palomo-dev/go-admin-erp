'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Badge, type TamanoBadge } from '@/components/ui/badge';
import type { TonoBadge } from '@/components/kit/estadoTono';
import { estadoVencimiento, UMBRAL_POR_VENCER_DIAS } from '@/lib/inventario/nucleo/lotes';
import type { EstadoVencimiento } from '@/lib/inventario/nucleo/tipos';

/** Tono de cada estado de vencimiento (Figma 530:65092: por vencer ámbar, vigente verde, vencido rojo). */
export const TONO_VENCIMIENTO: Record<EstadoVencimiento, TonoBadge> = {
  vigente: 'exito',
  por_vencer: 'advertencia',
  vencido: 'peligro',
  sin_vencimiento: 'neutro',
};

/**
 * Texto del vencimiento en el idioma activo: «Vence en 26 días», «Vence hoy»,
 * «Venció hace 17 días» o «Sin vencimiento».
 */
export function useTextoVencimiento(): (expiry: string | null | undefined, hoy: string) => string {
  const t = useTranslations('inventario.vencimiento');
  return useCallback(
    (expiry: string | null | undefined, hoy: string) => {
      const { estado, dias } = estadoVencimiento(expiry, hoy);
      if (estado === 'sin_vencimiento' || dias === null) return t('sin_vencimiento');
      if (dias < 0) return t('vencioHace', { dias: Math.abs(dias) });
      if (dias === 0) return t('venceHoy');
      return t('venceEn', { dias });
    },
    [t],
  );
}

/**
 * Estado de vencimiento de un lote: «Vigente», «Por vencer», «Vencido» o «Sin
 * vencimiento». `hoy` es `todayInTz(zonaDeLaOrganizacion)`: el día cambia a la
 * medianoche de la organización, no a la del navegador.
 */
export interface BadgeVencimientoProps {
  /** Columna `date` (`YYYY-MM-DD`). */
  expiry: string | null | undefined;
  hoy: string;
  umbralDias?: number;
  /** Muestra «Vence en N días» en vez del estado. */
  conDias?: boolean;
  tamano?: TamanoBadge;
  className?: string;
}

export function BadgeVencimiento({ expiry, hoy, umbralDias = UMBRAL_POR_VENCER_DIAS, conDias, tamano = 'sm', className }: BadgeVencimientoProps) {
  const t = useTranslations('inventario.vencimiento');
  const texto = useTextoVencimiento();
  const { estado } = estadoVencimiento(expiry, hoy, umbralDias);
  return (
    <Badge tono={TONO_VENCIMIENTO[estado]} tamano={tamano} className={className} data-estado={estado}>
      {conDias ? texto(expiry, hoy) : t(estado)}
    </Badge>
  );
}
