'use client';

import { useTranslations } from 'next-intl';
import { ExternalLink, UserCheck } from 'lucide-react';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { BadgeEstadoMembresia } from '@/components/membresias/comun/BadgeEstadoMembresia';
import { estadoVisualVendida, rutaMembresia, type MembresiaVendida } from '@/lib/pos/venta/membresias';
import { cn } from '@/utils/Utils';

/**
 * Frame D2 (`986:615576`): una tarjeta por membresía que creó, activó o
 * renovó la venta, dentro del post-venta del POS. Plan, estado, vigencia
 * desde–hasta en la zona de la organización (`useFormatDate`), titular,
 * código de acceso y «Ver membresía» (pestaña nueva: no se pierde el
 * post-venta ni la caja).
 *
 * La vigencia es la que devuelve la base: con cantidad N son N períodos
 * seguidos (P4) y en una renovación el vencimiento ya viene corrido (P3).
 */
export interface MembresiasVendidasProps {
  membresias: readonly MembresiaVendida[];
  /** La venta quedó pagada: «pending» se lee «Por activar» y no «Pendiente de pago». */
  ventaPagada: boolean;
  /** Nombre del cliente titular (el del carrito cobrado). */
  titular?: string | null;
  className?: string;
}

const CAJA: Record<ReturnType<typeof estadoVisualVendida>, string> = {
  activa: 'border-line-success bg-success-subtle',
  por_activar: 'border-line-brand bg-brand-tint',
  congelada: 'border-line-brand bg-brand-tint',
  pendiente_pago: 'border-line-warning bg-warning-subtle',
  en_gracia: 'border-line-warning bg-warning-subtle',
  vencida: 'border-line bg-surface',
  cancelada: 'border-line bg-surface',
};

const TEXTO: Record<ReturnType<typeof estadoVisualVendida>, string> = {
  activa: 'text-success-text',
  por_activar: 'text-brand-deep',
  congelada: 'text-brand-deep',
  pendiente_pago: 'text-warning-text',
  en_gracia: 'text-warning-text',
  vencida: 'text-fg',
  cancelada: 'text-fg',
};

export function MembresiasVendidas({ membresias, ventaPagada, titular, className }: MembresiasVendidasProps) {
  const t = useTranslations('membresias.pos.postVenta');
  const { formatDate } = useFormatDate();
  if (membresias.length === 0) return null;

  return (
    <ul aria-label={t('region', { n: membresias.length })} className={cn('flex w-full flex-col gap-2', className)}>
      {membresias.map((m) => {
        const estado = estadoVisualVendida(m.estado, ventaPagada);
        const titulo = estado === 'activa' || estado === 'por_activar' || estado === 'pendiente_pago' ? t(`titulo.${estado}`) : t('titulo.otra');
        const vigencia = m.desde && m.hasta ? t('vigencia', { desde: formatDate(m.desde), hasta: formatDate(m.hasta) }) : null;
        return (
          <li key={m.id} className={cn('flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left', CAJA[estado])}>
            <div className="flex flex-wrap items-center gap-2">
              <UserCheck aria-hidden="true" className={cn('size-4 shrink-0', TEXTO[estado])} strokeWidth={1.5} />
              <p className={cn('min-w-0 flex-1 text-[13px] font-medium leading-5', TEXTO[estado])}>{titulo}</p>
              <BadgeEstadoMembresia estado={estado} />
            </div>
            <p className="text-[13px] leading-5 text-fg">
              {[m.plan || null, vigencia, titular || null].filter(Boolean).join(' · ')}
            </p>
            {m.codigo && (
              <p className="text-xs leading-4 text-fg-secondary">
                {t('codigo')} <span className="font-mono tabular-nums text-fg">{m.codigo}</span>
              </p>
            )}
            <div>
              <a
                href={rutaMembresia(m.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('verMembresia')}
                <span className="sr-only">{t('pestanaNueva')}</span>
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
