'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { RowActionsMenu, type AccionFila } from '@/components/kit';
import { cn } from '@/utils/Utils';
import type { ResumenZona } from './estadoMesaPlano';
import type { DensidadMesa } from './MesaTile';

/**
 * Sección de una zona en la cuadrícula (Figma 870:98621): «⌄ ● Salón principal
 * 16 mesas · 4 libres · 8 ocupadas · 2 por cobrar ⋯», una línea y sus mesas.
 * Plegable; con filtros dice «10 de 18 mesas coinciden con los filtros».
 */
export interface SeccionZonaMesasProps {
  nombre: string;
  color: string;
  resumen: ResumenZona;
  /** Mesas de la zona sin filtrar (para «N de M coinciden»). */
  totalZona: number;
  filtrada: boolean;
  densidad: Exclude<DensidadMesa, 'plano'>;
  acciones?: readonly AccionFila[];
  /** En el celular el resumen es corto («16 · 4 libres»). */
  corto?: boolean;
  children: ReactNode;
}

export function SeccionZonaMesas({ nombre, color, resumen, totalZona, filtrada, densidad, acciones, corto, children }: SeccionZonaMesasProps) {
  const t = useTranslations('posMesasPlano.zona');
  const [abierta, setAbierta] = useState(true);
  const Chevron = abierta ? ChevronDown : ChevronRight;
  const partes = [
    corto ? String(resumen.total) : t('mesas', { n: resumen.total }),
    resumen.libres > 0 ? t('libres', { n: resumen.libres }) : null,
    !corto && resumen.ocupadas > 0 ? t('ocupadas', { n: resumen.ocupadas }) : null,
    !corto && resumen.porCobrar > 0 ? t('porCobrar', { n: resumen.porCobrar }) : null,
  ].filter(Boolean);

  return (
    <section aria-label={nombre} className="flex flex-col gap-4">
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <button
          type="button"
          onClick={() => setAbierta((a) => !a)}
          aria-expanded={abierta}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Chevron aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="truncate text-base font-semibold text-fg sm:text-[17px]">{nombre}</span>
          <span className="truncate text-[13px] text-fg-secondary">
            {filtrada ? t('coinciden', { n: resumen.total, total: totalZona }) : partes.join(' · ')}
          </span>
        </button>
        {acciones && acciones.length > 0 && <RowActionsMenu orientacion="horizontal" tamano="sm" titulo={nombre} acciones={acciones} />}
      </div>
      {abierta && (
        <div
          className={cn(
            'grid gap-2',
            densidad === 'compacta' ? 'grid-cols-[repeat(auto-fill,minmax(104px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:grid-cols-[repeat(auto-fill,180px)] sm:gap-3',
          )}
        >
          {children}
        </div>
      )}
    </section>
  );
}
