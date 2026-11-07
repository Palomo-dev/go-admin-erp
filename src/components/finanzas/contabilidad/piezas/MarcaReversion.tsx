'use client';

/**
 * Marca de reversión (Figma `kit/contabilidad · MarcaReversion` 978:605193).
 * - `revertido`: el asiento tiene contra-asiento → «Revertido por #N».
 * - `contraAsiento`: este asiento neutraliza otro → «Reversión de #N».
 * Compacta (chip con enlace) o extendida (franja con fecha, autor y motivo).
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeftRight, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNumeroAsiento } from './OrigenAsiento';

export interface MarcaReversionProps {
  rol: 'revertido' | 'contraAsiento';
  /** El otro asiento del par. */
  numero: number;
  variante?: 'compacta' | 'extendida';
  fecha?: string | null;
  autor?: string | null;
  motivo?: string | null;
  className?: string;
}

export function MarcaReversion({ rol, numero, variante = 'compacta', fecha, autor, motivo, className }: MarcaReversionProps) {
  const t = useTranslations('finanzasContabilidadR3.comun.reversion');
  const formatear = useNumeroAsiento();
  const href = `/app/finanzas/contabilidad/asientos/${numero}`;
  const Icono = rol === 'revertido' ? Undo2 : ArrowLeftRight;
  const texto = rol === 'revertido' ? t('revertidoPor', { numero: formatear(numero) }) : t('reversionDe', { numero: formatear(numero) });

  if (variante === 'compacta') {
    return (
      <Link
        href={href}
        className={cn(
          'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          rol === 'revertido' ? 'border-line-strong text-fg-secondary' : 'border-line text-fg-muted',
          className,
        )}
      >
        <Icono aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        {texto}
      </Link>
    );
  }

  const detalle = [fecha, autor, motivo ? t('motivo', { motivo }) : null].filter(Boolean).join(' · ');
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-subtle px-3 py-2 text-sm', className)}>
      <Icono aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />
      <Link href={href} className="font-medium text-brand hover:underline">
        {rol === 'revertido' ? t('neutralizadoPor', { numero: formatear(numero) }) : t('neutraliza', { numero: formatear(numero) })}
      </Link>
      {detalle && <span className="text-fg-secondary">{detalle}</span>}
    </div>
  );
}
