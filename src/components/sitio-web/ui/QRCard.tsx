'use client';

import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/utils/Utils';
import { useTextosComun } from './textos';

/**
 * Tarjeta QR de una mesa o zona (Figma B/02; Carta QR B/13-03): código,
 * «Mesa 12», «Salón · Sede Centro», la dirección corta y, en tamaño `lg`
 * (impresión), «Escanea para ver la carta y pedir». El QR va en tinta sobre
 * blanco siempre (también en modo oscuro): es lo que leen las cámaras.
 * La URL la arma quien llama con `hostSitio`, nunca aquí.
 */
export interface QRCardProps {
  /** URL completa que abre el QR (`https://tumarca.com/carta?mesa=12`). */
  url: string;
  titulo: string;
  /** «Salón · Sede Centro». */
  detalle?: string;
  /** Muestra la URL sin protocolo bajo el detalle. */
  mostrarUrl?: boolean;
  tamano?: 'sm' | 'lg';
  /** Texto de llamada en `lg`; por defecto «Escanea para ver la carta y pedir». */
  llamada?: string;
  className?: string;
}

export function QRCard({ url, titulo, detalle, mostrarUrl = true, tamano = 'sm', llamada, className }: QRCardProps) {
  const tx = useTextosComun();
  const grande = tamano === 'lg';
  const corta = url.replace(/^https?:\/\//, '');
  return (
    <figure
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl border border-line bg-surface text-center',
        grande ? 'w-56 p-5' : 'w-40 p-4',
        className,
      )}
    >
      {/* Siempre tinta sobre blanco: los lectores de QR no leen el modo oscuro. */}
      <span className="rounded-md bg-white p-1.5">
        <QRCodeSVG value={url} size={grande ? 160 : 96} level="M" title={tx('qr.alt', { nombre: titulo })} />
      </span>
      <figcaption className="flex flex-col gap-0.5">
        <span className={cn('font-semibold text-fg', grande ? 'text-base' : 'text-sm')}>{titulo}</span>
        {detalle && <span className="text-xs text-fg-secondary">{detalle}</span>}
        {mostrarUrl && <span className="break-all text-[11px] text-fg-muted">{corta}</span>}
        {grande && <span className="mt-1 text-[13px] font-medium text-fg">{llamada ?? tx('qr.escanea')}</span>}
      </figcaption>
    </figure>
  );
}
