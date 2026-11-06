'use client';

import type { ReactNode } from 'react';
import { Landmark, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import { resumirCuentas, type CuentaEfectiva } from '@/lib/finanzas/contabilidad/cuentaEfectiva';
import { StatusBadge } from './StatusBadge';

/**
 * Bloque colapsado para producto y categoría (Figma `ResumenCuentas`, sección
 * 2317:39697). En una frase dice qué pasa; el detalle queda detrás de «Ver o
 * cambiar cuentas». Cerrado por defecto: quien no sabe de contabilidad no
 * necesita abrirlo.
 */
export interface ResumenCuentasProps {
  cuentas: readonly CuentaEfectiva[];
  cargando?: boolean;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Los campos: se montan solo al abrir. */
  children: ReactNode;
  /** Con qué se habla: producto o categoría. */
  sujeto: 'producto' | 'categoria';
  className?: string;
}

export function ResumenCuentas({ cuentas, cargando, abierto, onAbiertoChange, children, sujeto, className }: ResumenCuentasProps) {
  const t = useTranslations('cuentasAutomaticas');
  const resumen = resumirCuentas(cuentas);
  const revisar = resumen.tipo === 'revisar';

  let titulo = t('resumen.automaticaTitulo');
  let cuerpo = t(`resumen.automatica.${sujeto}`);
  let insignia = t('resumen.insigniaAutomatica');
  let tono: 'exito' | 'marca' | 'advertencia' = 'exito';
  if (resumen.tipo === 'propias') {
    titulo = t('resumen.propiasTitulo', { n: resumen.n });
    cuerpo = t('resumen.propiasCuerpo', { cuentas: resumen.cuentas.join(', '), n: resumen.automaticas });
    insignia = t('resumen.insigniaPropias');
    tono = 'marca';
  } else if (resumen.tipo === 'revisar') {
    titulo = t('resumen.revisarTitulo', { n: resumen.n });
    cuerpo = resumen.rol ? t('resumen.revisarCuerpo', { rol: t(`rol.${resumen.rol}`) }) : '';
    insignia = t('estado.titulo');
    tono = 'advertencia';
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className={cn('flex items-center gap-3 rounded-lg border px-4 py-3', revisar ? 'border-line-warning bg-warning-subtle' : 'border-line bg-surface')}>
        {revisar ? (
          <TriangleAlert aria-hidden="true" className="size-5 shrink-0 text-warning-text" strokeWidth={1.5} />
        ) : (
          <Landmark aria-hidden="true" className="size-5 shrink-0 text-fg-secondary" strokeWidth={1.5} />
        )}
        <div className="min-w-0 flex-1">
          {cargando && cuentas.length === 0 ? (
            <Skeleton className="h-9 w-64 max-w-full" />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                {titulo}
                <StatusBadge estado={tono} etiqueta={insignia} tono={tono} apariencia="suave" />
              </div>
              <p className={cn('text-xs', revisar ? 'text-warning-text' : 'text-fg-secondary')}>{cuerpo}</p>
            </>
          )}
        </div>
        <button
          type="button"
          aria-expanded={abierto}
          onClick={() => onAbiertoChange(!abierto)}
          className="shrink-0 text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {abierto ? t('resumen.ocultar') : revisar ? t('resumen.corregir') : t('resumen.ver')}
        </button>
      </div>
      {abierto && children}
    </div>
  );
}
