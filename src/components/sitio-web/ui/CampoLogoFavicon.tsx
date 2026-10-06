'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { AppWindow, ImageIcon, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { clasesBoton } from '@/components/kit/botonClases';
import { useTextosComun } from './textos';

// El selector de imágenes se carga al abrirlo: no pesa en la página.
const ImagePickerDialog = dynamic(() => import('@/components/common/ImagePickerDialog'), { ssr: false });

/**
 * Logo y favicon del sitio (Figma B/12-01 «Datos del negocio» y Diseño ›
 * «Logo y favicon»): UN componente sobre UN dato, la identidad del borrador V2
 * (`identidad.logoUrl` / `identidad.faviconUrl`). Dos tarjetas: miniatura,
 * título, ayuda y «Cambiar» (abre el selector de imágenes de la organización).
 * No guarda: avisa con `onCambiar` y quien lo monta guarda en su lote.
 */
export type CampoIdentidadImagen = 'logo' | 'favicon';

export interface CampoLogoFaviconProps {
  logoUrl: string | null | undefined;
  faviconUrl: string | null | undefined;
  onCambiar: (campo: CampoIdentidadImagen, url: string | null) => void;
  /** Organización del selector de imágenes (sale de la sesión, no del cliente del sitio). */
  organizationId?: number;
  /** Muestra «Quitar» cuando hay imagen. */
  permitirQuitar?: boolean;
  deshabilitado?: boolean;
  className?: string;
}

export function CampoLogoFavicon({
  logoUrl,
  faviconUrl,
  onCambiar,
  organizationId,
  permitirQuitar,
  deshabilitado,
  className,
}: CampoLogoFaviconProps) {
  const tx = useTextosComun();
  const [abierto, setAbierto] = useState<CampoIdentidadImagen | null>(null);

  const tarjeta = (campo: CampoIdentidadImagen, url: string | null | undefined, Icono: LucideIcon) => {
    const nombre = tx(`logoFavicon.${campo}`);
    return (
      <div className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-surface p-3">
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-subtle',
            campo === 'favicon' && url && 'p-2',
          )}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL arbitraria del almacenamiento del cliente
            <img src={url} alt={tx('logoFavicon.vistaAlt', { campo: nombre })} className="size-full object-contain" />
          ) : (
            <Icono aria-hidden="true" className="size-5 text-fg-muted" strokeWidth={1.5} />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium leading-5 text-fg">{nombre}</span>
          <span className="text-xs leading-4 text-fg-secondary">{tx(`logoFavicon.${campo}Ayuda`)}</span>
        </span>
        <span className="flex shrink-0 flex-col gap-1 sm:flex-row">
          <button
            type="button"
            disabled={deshabilitado}
            aria-label={tx('logoFavicon.cambiarAria', { campo: nombre })}
            onClick={() => setAbierto(campo)}
            className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
          >
            {url ? tx('logoFavicon.cambiar') : tx('logoFavicon.subir')}
          </button>
          {permitirQuitar && url && (
            <button
              type="button"
              disabled={deshabilitado}
              aria-label={tx('logoFavicon.quitarAria', { campo: nombre })}
              onClick={() => onCambiar(campo, null)}
              className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
            >
              {tx('logoFavicon.quitar')}
            </button>
          )}
        </span>
      </div>
    );
  };

  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
      {tarjeta('logo', logoUrl, ImageIcon)}
      {tarjeta('favicon', faviconUrl, AppWindow)}
      {abierto && (
        <ImagePickerDialog
          open
          onOpenChange={(v) => !v && setAbierto(null)}
          organizationId={organizationId}
          title={tx(`logoFavicon.${abierto}`)}
          onSelect={(url) => {
            onCambiar(abierto, url);
            setAbierto(null);
          }}
        />
      )}
    </div>
  );
}
