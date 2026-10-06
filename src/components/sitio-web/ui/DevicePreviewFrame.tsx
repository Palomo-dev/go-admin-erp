'use client';

import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { VIEWPORT_DISPOSITIVO, esMarcoDeAparato, type DispositivoVista } from './dispositivos';
import { useTextosComun } from './textos';

/**
 * Marco de dispositivo para la vista previa (Figma A/07g): navegador con la
 * dirección del sitio (escritorio 1440 y portátil 1024) o aparato (tableta 768 y celular 390). El
 * contenido suele ser un `SitePreview` con `anchoViewport` del mismo
 * dispositivo. El host sale de `useUrlSitio`/`hostSitio`, nunca se arma aquí.
 */
export interface DevicePreviewFrameProps {
  dispositivo: DispositivoVista;
  /** «tu-marca.goadmin.io» o el dominio propio; `null` oculta la barra de dirección. */
  host?: string | null;
  /**
   * Texto de la barra en lugar de la dirección («Vista previa con tu
   * contenido», A/06c): la plantilla aún no está en ningún dominio, así que
   * no lleva candado. Gana sobre `host`.
   */
  etiquetaBarra?: string | null;
  children: ReactNode;
  className?: string;
}

export function DevicePreviewFrame({ dispositivo, host, etiquetaBarra, children, className }: DevicePreviewFrameProps) {
  const tx = useTextosComun();
  const { ancho } = VIEWPORT_DISPOSITIVO[dispositivo];
  const etiqueta = tx('dispositivo.marco', { ancho });

  if (esMarcoDeAparato(dispositivo)) {
    return (
      <figure
        aria-label={etiqueta}
        className={cn(
          'mx-auto w-full border border-line-strong bg-surface p-2',
          dispositivo === 'celular' ? 'max-w-[280px] rounded-[28px]' : 'max-w-[560px] rounded-[24px]',
          className,
        )}
      >
        <div aria-hidden="true" className="mx-auto mb-1.5 h-1.5 w-16 rounded-full bg-subtle" />
        <div className="overflow-hidden rounded-[20px] border border-line">{children}</div>
      </figure>
    );
  }

  return (
    <figure aria-label={etiqueta} className={cn('w-full overflow-hidden rounded-xl border border-line bg-surface', className)}>
      <div className="flex h-8 items-center gap-2 border-b border-line bg-subtle px-3">
        <span aria-hidden="true" className="flex gap-1">
          <span className="size-2 rounded-full bg-line-strong" />
          <span className="size-2 rounded-full bg-line-strong" />
          <span className="size-2 rounded-full bg-line-strong" />
        </span>
        {etiquetaBarra ? (
          <span className="min-w-0 max-w-[60%] truncate rounded-md bg-surface px-2 py-0.5 text-[11px] leading-4 text-fg-secondary">{etiquetaBarra}</span>
        ) : host ? (
          <span className="flex min-w-0 max-w-[60%] items-center gap-1 truncate rounded-md bg-surface px-2 py-0.5 text-[11px] leading-4 text-fg-secondary">
            <Lock aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.5} />
            <span className="truncate">{host}</span>
          </span>
        ) : null}
      </div>
      {children}
    </figure>
  );
}
