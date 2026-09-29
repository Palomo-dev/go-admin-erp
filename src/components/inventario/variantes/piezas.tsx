'use client';

import { useTranslations } from 'next-intl';
import { StatusBadge, type TonoBadge } from '@/components/kit';
import type { EstiloTipo } from './tipos';
import type { EstadoCatalogo } from './logicaVariantes';

const TONO_ESTADO: Record<EstadoCatalogo, TonoBadge> = {
  activo: 'exito',
  repetido: 'advertencia',
  sinUsar: 'neutro',
  inactivo: 'neutro',
};

/** Activo · Repetido · Sin usar · Inactivo (Figma `969:595073`). */
export function BadgeEstadoCatalogo({ estado }: { estado: EstadoCatalogo }) {
  const t = useTranslations('inventarioVariantes.estados');
  return (
    <StatusBadge
      estado={estado}
      etiqueta={t(estado)}
      tono={TONO_ESTADO[estado]}
      apariencia={estado === 'inactivo' ? 'contorno' : 'suave'}
      tamano="sm"
    />
  );
}

const TONO_ESTILO: Record<EstiloTipo, TonoBadge> = { texto: 'neutro', color: 'marca', imagen: 'informacion' };

/** Texto · Muestra de color · Imagen. */
export function BadgeEstilo({ estilo }: { estilo: EstiloTipo }) {
  const t = useTranslations('inventarioVariantes.estilos');
  return <StatusBadge estado={estilo} etiqueta={t(estilo)} tono={TONO_ESTILO[estilo]} apariencia="contorno" tamano="sm" />;
}

/** Muestra hex con el código («● #111827») o «Sin muestra». */
export function MuestraColor({ hex }: { hex: string | null }) {
  const t = useTranslations('inventarioVariantes.valores');
  if (!hex) return <span className="text-fg-muted">{t('sinMuestra')}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="size-3.5 shrink-0 rounded-full border border-line" style={{ backgroundColor: hex }} />
      <span className="font-mono text-xs text-fg-secondary">{hex.toUpperCase()}</span>
    </span>
  );
}
