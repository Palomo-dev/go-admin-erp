'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { clasesBoton } from './botonClases';

/**
 * Aviso tonal con icono y acción (Figma Sitio web A/02a «Alertas», A/03a,
 * B/12-01; manual v2.0: el color funcional siempre va con icono y texto).
 *
 * - `advertencia`: algo vence o falta («www.tumarca.co vence en 12 días» · Renovar).
 * - `peligro`: algo está roto («… está mal configurado» · Ver registros DNS).
 * - `informacion`: una consecuencia o un consejo («Aún no recibes pagos en línea»).
 * - `exito`: confirmación persistente.
 *
 * La acción es un botón secundario `sm` a la derecha; en móvil baja bajo el
 * texto si no cabe. Sustituye a los avisos sueltos de cada pantalla
 * (`AvisoConAccion` del editor sigue para su caso: abre otra pestaña).
 */
export type TonoAviso = 'advertencia' | 'peligro' | 'informacion' | 'exito';

export interface AccionAviso {
  etiqueta: string;
  onClick?: () => void;
  href?: string;
  /** Enlace a otra pestaña (`target=_blank` + `noopener`). */
  externo?: boolean;
  cargando?: boolean;
}

export interface AvisoTonalProps {
  tono?: TonoAviso;
  titulo: string;
  descripcion?: ReactNode;
  /** Icono propio; por defecto el del tono. */
  icono?: LucideIcon;
  accion?: AccionAviso;
  /** `alert` para lo urgente que aparece sin que la persona lo pida; por defecto `note`. */
  rol?: 'note' | 'alert' | 'status';
  compacto?: boolean;
  className?: string;
}

const TONO: Record<TonoAviso, { caja: string; texto: string; icono: LucideIcon }> = {
  advertencia: { caja: 'border-line-warning bg-warning-subtle', texto: 'text-warning-text', icono: TriangleAlert },
  peligro: { caja: 'border-line-danger bg-danger-subtle', texto: 'text-danger-text', icono: CircleAlert },
  informacion: { caja: 'border-line-info bg-info-subtle', texto: 'text-info-text', icono: Info },
  exito: { caja: 'border-line-success bg-success-subtle', texto: 'text-success-text', icono: CircleCheck },
};

export function AvisoTonal({
  tono = 'informacion',
  titulo,
  descripcion,
  icono,
  accion,
  rol = 'note',
  compacto,
  className,
}: AvisoTonalProps) {
  const t = TONO[tono];
  const Icono = icono ?? t.icono;
  const claseAccion = clasesBoton({ variante: 'secundario', tamano: 'sm' });
  return (
    <div
      role={rol}
      className={cn(
        'flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border',
        compacto ? 'px-3 py-2' : 'px-4 py-3',
        t.caja,
        className,
      )}
    >
      <Icono aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', t.texto)} strokeWidth={1.5} />
      <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
        <p className={cn('text-sm font-medium leading-5', t.texto)}>{titulo}</p>
        {descripcion ? <div className="text-[13px] leading-[18px] text-fg-secondary">{descripcion}</div> : null}
      </div>
      {accion ? (
        accion.href ? (
          accion.externo ? (
            <a href={accion.href} target="_blank" rel="noopener noreferrer" className={cn(claseAccion, 'ml-8 sm:ml-0')}>
              {accion.etiqueta}
            </a>
          ) : (
            <Link href={accion.href} className={cn(claseAccion, 'ml-8 sm:ml-0')}>
              {accion.etiqueta}
            </Link>
          )
        ) : (
          <button
            type="button"
            onClick={accion.onClick}
            disabled={accion.cargando}
            aria-busy={accion.cargando || undefined}
            className={cn(claseAccion, 'ml-8 sm:ml-0')}
          >
            {accion.etiqueta}
          </button>
        )
      ) : null}
    </div>
  );
}
