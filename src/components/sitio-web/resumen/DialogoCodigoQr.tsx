'use client';

/**
 * «Código QR» del sitio (Figma A/02a): QR de la dirección real y «Descargar
 * PNG». El QR va siempre en tinta sobre blanco (también en modo oscuro): es lo
 * que leen las cámaras. La URL la da el servidor (`hostSitio`), nunca se arma aquí.
 */
import { useRef } from 'react';
import { QrCode } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { Dialogo } from '@/components/kit';
import { useTextosResumen } from './textos';

export interface DialogoCodigoQrProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  url: string;
  host: string;
}

/** Nombre del archivo: `qr-tumarca-co.png`. */
export function nombreArchivoQr(host: string): string {
  return `qr-${host.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sitio'}.png`;
}

export function DialogoCodigoQr({ abierto, onAbiertoChange, url, host }: DialogoCodigoQrProps) {
  const t = useTextosResumen();
  const contenedor = useRef<HTMLDivElement | null>(null);

  const descargar = () => {
    const lienzo = contenedor.current?.querySelector('canvas');
    if (!lienzo) return;
    const enlace = document.createElement('a');
    enlace.href = lienzo.toDataURL('image/png');
    enlace.download = nombreArchivoQr(host);
    enlace.click();
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('resumen.qr.titulo')}
      descripcion={t('resumen.qr.descripcion', { host })}
      icono={QrCode}
      ancho={440}
      textoCancelar={t('resumen.qr.cerrar')}
      primario={{ etiqueta: t('resumen.qr.descargar'), onClick: descargar }}
    >
      <div ref={contenedor} className="flex flex-col items-center gap-3 py-2">
        <span className="rounded-xl border border-line bg-white p-3">
          <QRCodeCanvas value={url} size={208} level="M" marginSize={1} title={t('resumen.qr.titulo')} />
        </span>
        <span className="break-all text-center text-[13px] leading-[18px] text-fg-secondary">{host}</span>
      </div>
    </Dialogo>
  );
}
