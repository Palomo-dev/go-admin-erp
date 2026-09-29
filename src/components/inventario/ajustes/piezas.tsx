'use client';

import { useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/kit';
import { formatearCantidad } from '@/components/kit/inventario';
import type { ErrorRpc } from '@/lib/inventario/nucleo/errores';
import type { EstadoAjuste, TipoAjuste } from '@/lib/services/adjustmentService';
import { cn } from '@/utils/Utils';
import { BADGE_ESTADO, mensajeErrorAjuste, tonoDiferencia } from './logica';

/** Estado del ajuste (Figma: Borrador gris · Aplicado verde · Descartado gris). */
export function BadgeEstadoAjuste({ estado, tamano = 'sm' }: { estado: EstadoAjuste; tamano?: 'sm' | 'md' }) {
  const t = useTranslations('inventarioAjustes.estados');
  const b = BADGE_ESTADO[estado];
  return <StatusBadge estado={b.estado} etiqueta={t(b.clave)} tamano={tamano} />;
}

/** Signo neto del ajuste (Figma: «Entrada» en verde y «Salida» en rojo, de contorno). */
export function BadgeTipoAjuste({ tipo, tamano = 'sm' }: { tipo: TipoAjuste; tamano?: 'sm' | 'md' }) {
  const t = useTranslations('inventarioAjustes.tipos');
  return (
    <StatusBadge
      estado={tipo}
      etiqueta={t(tipo)}
      tono={tipo === 'entrada' ? 'exito' : 'peligro'}
      apariencia="contorno"
      tamano={tamano}
    />
  );
}

/** Etiqueta de una razón guardada (las desconocidas se muestran tal cual). */
export function useEtiquetaRazon() {
  const t = useTranslations('inventarioAjustes.razones');
  return useCallback((razon: string) => (razon && t.has(razon) ? t(razon) : razon), [t]);
}

/** Cantidad con los decimales justos (hasta 3) en el idioma de la interfaz. */
export function useFormatoCantidad() {
  const locale = useLocale();
  return useCallback(
    (n: number | null | undefined, opciones: { signo?: boolean; unidad?: string | null } = {}) => {
      if (n === null || n === undefined || !Number.isFinite(n)) return '—';
      const cuerpo = formatearCantidad(Math.abs(n), locale);
      const signo = opciones.signo ? (n > 0 ? '+' : n < 0 ? '−' : '') : n < 0 ? '−' : '';
      const unidad = opciones.unidad ? ` ${opciones.unidad.toLowerCase()}` : '';
      return `${signo}${cuerpo}${unidad}`;
    },
    [locale],
  );
}

const CLASE_TONO = { exito: 'text-success-text', peligro: 'text-danger-text', neutro: 'text-fg' } as const;

/** Diferencia con signo y color (+ verde, − rojo, 0 neutro). */
export function CifraDiferencia({ valor, texto, className }: { valor: number | null | undefined; texto: string; className?: string }) {
  return <span className={cn('tabular-nums', CLASE_TONO[tonoDiferencia(valor)], className)}>{texto}</span>;
}

/** Mensaje traducido del error de una RPC de ajustes (propio o del núcleo de inventario). */
export function useMensajeErrorAjuste() {
  const t = useTranslations('inventarioAjustes.errores');
  const tn = useTranslations('inventario.errores');
  return useCallback(
    (error: unknown): string => {
      const m = mensajeErrorAjuste(error as ErrorRpc);
      if (m.ns === 'ajuste') {
        if (m.clave === 'costo_requerido' && m.productos?.length) return t('costo_requerido_productos', { productos: m.productos.join(', ') });
        return t(m.clave);
      }
      if (m.clave === 'stock_insuficiente') {
        return tn('stock_insuficiente', { disponible: m.disponible ?? 0, solicitado: m.solicitado ?? 0 });
      }
      return tn.has(m.clave) ? tn(m.clave) : t('desconocido');
    },
    [t, tn],
  );
}
