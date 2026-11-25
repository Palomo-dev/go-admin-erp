'use client';

import Link from 'next/link';
import { ArrowRight, HandCoins, Phone, SquareArrowOutUpRight, Star, type LucideIcon } from 'lucide-react';
import { clasesBoton } from '@/components/kit/botonClases';
import type { ReferralView } from '@/lib/services/crm/referralsService';
import { enlaceLead, siguientePaso, type SiguientePaso } from './referidosLogica';
import { useReferidosFormato } from './useReferidosFormato';

export type AccionPaso = Exclude<SiguientePaso, 'verLead' | 'final'>;

const ICONO: Record<Exclude<SiguientePaso, 'final'>, LucideIcon> = {
  contactar: Phone,
  calificar: Star,
  convertir: ArrowRight,
  registrarPago: HandCoins,
  verLead: SquareArrowOutUpRight,
};

/** Id estable del botón de una fila (para devolver el foco tras una transición). */
export function idPaso(referidoId: string): string {
  return `referido-${referidoId}-paso`;
}

/**
 * Botón de la columna «Siguiente paso» (y de la tarjeta móvil): la ÚNICA
 * transición válida desde el estado actual. «Convertir en lead» es el
 * primario; «Ver lead» es un enlace; «Estado final» es texto atenuado.
 */
export function SiguientePasoBoton({ referido, ocupado, onPaso, anchoCompleto }: { referido: ReferralView; ocupado: boolean; onPaso: (r: ReferralView, paso: AccionPaso) => void; anchoCompleto?: boolean }) {
  const { t } = useReferidosFormato();
  const paso = siguientePaso(referido);
  if (paso === 'final') return <span className="text-[13px] text-fg-muted">{t('paso.final')}</span>;
  const Icono = ICONO[paso];
  const contenido = (
    <>
      <Icono aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t(`paso.${paso}`)}
    </>
  );
  if (paso === 'verLead') {
    const href = enlaceLead(referido);
    if (!href) return <span className="text-[13px] text-fg-muted">{t('paso.final')}</span>;
    return (
      <Link id={idPaso(referido.id)} href={href} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', anchoCompleto, className: 'text-fg' })}>
        {contenido}
      </Link>
    );
  }
  return (
    <button
      id={idPaso(referido.id)}
      type="button"
      disabled={ocupado}
      aria-busy={ocupado || undefined}
      onClick={() => onPaso(referido, paso)}
      className={clasesBoton({ variante: paso === 'convertir' ? 'primario' : 'secundario', tamano: 'sm', anchoCompleto })}
    >
      {contenido}
    </button>
  );
}
