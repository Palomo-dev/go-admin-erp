'use client';

/**
 * Origen del asiento (Figma `kit/contabilidad · OrigenAsiento` 978:605159):
 * icono + etiqueta legible y, debajo, el documento enlazado cuando existe.
 */
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowLeftRight,
  BadgePercent,
  BedDouble,
  CircleDollarSign,
  FileText,
  HandCoins,
  Landmark,
  Lock,
  Package,
  Pencil,
  Receipt,
  ReceiptText,
  Shapes,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { ChipDocumento } from '@/components/kit';
import { cn } from '@/lib/utils';
import { documentoDeOrigen, grupoOrigen, numeroCorto, type GrupoOrigen } from '@/lib/finanzas/contabilidad/origenAsiento';

export const ICONO_ORIGEN: Readonly<Record<GrupoOrigen, LucideIcon>> = {
  venta: Receipt,
  factura: FileText,
  cobro: CircleDollarSign,
  compra: ReceiptText,
  pago: HandCoins,
  kardex: Package,
  caja: Wallet,
  banco: Landmark,
  comision: BadgePercent,
  nomina: Users,
  pms: BedDouble,
  manual: Pencil,
  contraAsiento: ArrowLeftRight,
  cierre: Lock,
  otro: Shapes,
};

export interface OrigenAsientoProps {
  source: string | null | undefined;
  sourceId?: string | null;
  /** Sin el chip del documento (filas compactas, móvil). */
  sinDocumento?: boolean;
  className?: string;
}

export function EtiquetaOrigen({ source, className }: { source: string | null | undefined; className?: string }) {
  const t = useTranslations('finanzasContabilidadR3.comun.origen');
  const grupo = grupoOrigen(source);
  const Icono = ICONO_ORIGEN[grupo];
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full border border-line bg-surface px-2 text-xs font-medium text-fg-secondary',
        grupo === 'manual' && 'text-brand',
        className,
      )}
      title={source ?? undefined}
    >
      <Icono aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
      {t(grupo)}
    </span>
  );
}

export function OrigenAsiento({ source, sourceId, sinDocumento, className }: OrigenAsientoProps) {
  const doc = sinDocumento ? null : documentoDeOrigen(source, sourceId);
  // El contra-asiento se enlaza con `MarcaReversion`, no con un chip.
  const mostrarDoc = doc && doc.tipo !== 'asiento' && sourceId;
  return (
    <span className={cn('flex flex-col items-start gap-1', className)}>
      <EtiquetaOrigen source={source} />
      {mostrarDoc && <ChipDocumento tipo={doc.tipo} numero={numeroCorto(sourceId)} href={doc.href} />}
    </span>
  );
}

/** «#9.580» con los separadores del idioma. */
export function useNumeroAsiento(): (id: number) => string {
  const locale = useLocale();
  return (id) => `#${new Intl.NumberFormat(locale).format(id)}`;
}

export function EnlaceAsiento({ id, className }: { id: number; className?: string }) {
  const numero = useNumeroAsiento();
  return (
    <Link href={`/app/finanzas/contabilidad/asientos/${id}`} className={cn('font-medium text-brand hover:underline', className)}>
      {numero(id)}
    </Link>
  );
}
