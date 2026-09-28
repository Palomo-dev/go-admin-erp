'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { TONO_ESTADO_SERIAL, estadoGarantia, type EstadoSerial } from '../../../logica/seriales';

/** Los 11 estados que admite `serial_numbers.status` (8 del flujo + 3 heredados). */
export const ESTADOS_SERIAL_TODOS: readonly EstadoSerial[] = [
  'in_stock',
  'reserved',
  'sold',
  'returned',
  'in_transit',
  'damaged',
  'rma',
  'warranty_claim',
  'warranty',
  'repair',
  'defective',
];

export function esEstadoSerial(v: string): v is EstadoSerial {
  return (ESTADOS_SERIAL_TODOS as readonly string[]).includes(v);
}

/** Etiqueta traducida de un estado (o el valor crudo si no se conoce). */
export function useEtiquetaEstadoSerial(): (estado: string) => string {
  const t = useTranslations('productoDetalle.seriales');
  return (estado: string) => (esEstadoSerial(estado) ? t(`estados.${estado}`) : estado);
}

/** Chip de estado: tono de `TONO_ESTADO_SERIAL` con punto. */
export function EstadoSerialBadge({ estado, tamano = 'md' }: { estado: string; tamano?: 'sm' | 'md' }) {
  const etiqueta = useEtiquetaEstadoSerial();
  const tono = esEstadoSerial(estado) ? TONO_ESTADO_SERIAL[estado] : 'neutro';
  return (
    <Badge tono={tono} tamano={tamano} punto className="whitespace-nowrap">
      {etiqueta(estado)}
    </Badge>
  );
}

/**
 * Garantía de un serial: «inicio → fin» (columnas `date`, sin zona horaria) y
 * badge «Vigente · N días» / «Vencida». `hoy` = día de la organización.
 */
export function GarantiaSerial({
  inicio,
  fin,
  hoy,
  compacta = false,
}: {
  inicio: string | null;
  fin: string | null;
  hoy: string;
  compacta?: boolean;
}) {
  const t = useTranslations('productoDetalle.seriales');
  if (!inicio && !fin) return <span className="text-fg-muted">—</span>;
  const g = estadoGarantia(fin, hoy);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {!compacta && (
        <span className="whitespace-nowrap tabular-nums text-fg-secondary">
          {t('garantia.rango', { inicio: formatPlainDate(inicio) || '—', fin: formatPlainDate(fin) || '—' })}
        </span>
      )}
      {g.estado === 'vigente' && (
        <Badge tono={g.dias <= 30 ? 'advertencia' : 'exito'} tamano="sm">
          {t('garantia.vigente', { count: g.dias })}
        </Badge>
      )}
      {g.estado === 'vencida' && (
        <Badge tono="peligro" tamano="sm">
          {t('garantia.vencida')}
        </Badge>
      )}
    </span>
  );
}
