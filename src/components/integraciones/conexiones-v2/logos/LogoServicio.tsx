/**
 * Logo de un servicio del catálogo de Conexiones (diseño 85-16).
 *
 * SVG inline sin dependencias. Los símbolos son versiones simplificadas para reconocer la marca
 * en un recuadro de 24–48 px; los colores de marca van dentro del SVG (no son tokens de la UI).
 * Las marcas provisionales y cualquier proveedor nuevo de la base se muestran con iniciales.
 * Decorativo por defecto (`aria-hidden`); con `titulo` se anuncia como imagen.
 */
import type { ReactNode } from 'react';
import { cn } from '@/utils/Utils';
import { inicialesDeServicio, tieneSimbolo, type MarcaConSimbolo } from './logoLogica';

export interface LogoServicioProps {
  /** Id del servicio (`SERVICIOS` de catalogoConexiones.ts) o código de proveedor. */
  id: string;
  tamano?: 'sm' | 'md' | 'lg';
  /** Nombre accesible; sin él, el logo es decorativo. */
  titulo?: string;
  className?: string;
}

const CAJA = {
  sm: 'size-7 rounded-md text-[10px]',
  md: 'size-10 rounded-lg text-[13px]',
  lg: 'size-12 rounded-xl text-sm',
} as const;

const SIMBOLO = { sm: 'size-4', md: 'size-6', lg: 'size-7' } as const;

const SERVICIOS_GO = new Set(['cobros_qr', 'facturacion_electronica', 'conectar_banco']);

/** Símbolos 24×24. */
const SIMBOLOS: Record<MarcaConSimbolo, ReactNode> = {
  stripe: (
    <path
      fill="#635BFF"
      d="M13.5 9.2c0-.8.7-1.1 1.8-1.1 1.6 0 3.6.5 5.2 1.4V4.6a13.6 13.6 0 0 0-5.2-1C11 3.6 8.3 5.8 8.3 9.5c0 5.7 7.9 4.8 7.9 7.3 0 .9-.8 1.2-2 1.2-1.7 0-3.9-.7-5.7-1.7v5a14.3 14.3 0 0 0 5.7 1.2c4.3 0 7.3-2.1 7.3-5.9 0-6.2-8-5.1-8-7.4Z"
      transform="translate(-2 -1)"
    />
  ),
  paypal: (
    <>
      <path fill="#003087" d="M8.3 21H4.6L7.3 3.5h6.6c3.6 0 5.4 1.9 4.8 5-.7 3.6-3.3 5.2-6.6 5.2H9.7L8.3 21Z" />
      <path fill="#0079C1" d="M10.6 22H7.5l.4-2.3 1-6.4h2.4c3.4 0 6-1.6 6.8-5.1 1.6 1 2.1 2.7 1.7 4.7-.7 3.3-3.1 4.9-6.3 4.9h-1.6L10.6 22Z" />
    </>
  ),
  whatsapp: (
    <>
      <path fill="#25D366" d="M12 2.5a9.4 9.4 0 0 0-8.1 14.2L2.6 21.5l4.9-1.3A9.4 9.4 0 1 0 12 2.5Z" />
      <path
        fill="#FFFFFF"
        d="M9 7.4c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.9 4.5 4 2.2.9 2.7.7 3.2.7.5-.1 1.6-.7 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3l-1.9-.9c-.3-.1-.4-.1-.6.1l-.8 1c-.2.2-.3.2-.6.1a7.6 7.6 0 0 1-3.8-3.3c-.3-.5.3-.5.8-1.6.1-.2 0-.4 0-.5L9 7.4Z"
      />
    </>
  ),
  instagram_facebook: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5.5" fill="none" stroke="#E1306C" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="#E1306C" strokeWidth="2" />
      <circle cx="17.3" cy="6.7" r="1.2" fill="#E1306C" />
    </>
  ),
  meta: (
    <path
      fill="none"
      stroke="#0866FF"
      strokeWidth="2.4"
      strokeLinecap="round"
      d="M3.5 15.5c0-4.6 2-8 4.2-8 3.2 0 5.6 9 8.6 9 1.7 0 2.7-1.4 2.7-3.6 0-3-1.7-5.4-3.4-5.4-3 0-5.3 9-8.4 9-2.2 0-3.7-.6-3.7-1Z"
    />
  ),
  expedia: (
    <>
      <rect x="2.5" y="2.5" width="19" height="19" rx="4" fill="#1F2B6C" />
      <path fill="#FDDB32" d="M7 17.8 15.2 9.6v4.6h2.2V5.9H9.1v2.2h4.6L5.4 16.2Z" />
    </>
  ),
  mercadopago: (
    <>
      <ellipse cx="12" cy="12" rx="10" ry="7" fill="none" stroke="#00B1EA" strokeWidth="1.8" />
      <path fill="none" stroke="#00B1EA" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M5.5 11.5c1.6 1 3.2 1.2 4.5.3l1.3-1c.7-.5 1.6-.4 2.2.2l2.3 2.4c.5.5 1.2.5 1.7.1l1-.8" />
    </>
  ),
  airbnb: (
    <path
      fill="none"
      stroke="#FF5A5F"
      strokeWidth="1.9"
      strokeLinejoin="round"
      d="M12 15.6c-1.4-1.8-2.3-3.4-2.3-4.6 0-1.4 1-2.2 2.3-2.2s2.3.8 2.3 2.2c0 1.2-.9 2.8-2.3 4.6Zm0 0c1.9 2.3 3.8 3.8 5.4 3.8 1.9 0 3-1.4 3-3.1 0-1.2-.6-2.4-1.5-4.4L14.6 4.9C13.9 3.6 13.1 3 12 3s-1.9.6-2.6 1.9L5.1 11.9c-.9 2-1.5 3.2-1.5 4.4 0 1.7 1.1 3.1 3 3.1 1.6 0 3.5-1.5 5.4-3.8Z"
    />
  ),
  tripadvisor: (
    <>
      <circle cx="7.3" cy="13" r="4" fill="none" stroke="#34E0A1" strokeWidth="1.9" />
      <circle cx="16.7" cy="13" r="4" fill="none" stroke="#34E0A1" strokeWidth="1.9" />
      <circle cx="7.3" cy="13" r="1.4" fill="#000000" />
      <circle cx="16.7" cy="13" r="1.4" fill="#000000" />
      <path fill="none" stroke="#34E0A1" strokeWidth="1.9" strokeLinecap="round" d="M3 8.6h3.5C8.2 7.4 10 6.8 12 6.8s3.8.6 5.5 1.8H21" />
    </>
  ),
  google_vacation_rentals: (
    <>
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6Z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6Z" />
    </>
  ),
  ifood: (
    <>
      <circle cx="8.2" cy="10" r="4.2" fill="#EA1D2C" />
      <circle cx="15.8" cy="10" r="4.2" fill="#EA1D2C" />
      <path fill="none" stroke="#EA1D2C" strokeWidth="1.8" strokeLinecap="round" d="M6 17.2c3.6 2.4 8.4 2.4 12 0" />
    </>
  ),
  google_ads: (
    <>
      <path fill="#FBBC04" d="M3.3 17.4 9.6 6.5l3.9 2.2-6.3 10.9a2.3 2.3 0 0 1-3.9-2.2Z" />
      <path fill="#4285F4" d="M20.7 17.4 14.4 6.5a2.3 2.3 0 0 0-3.9 2.2l6.3 10.9a2.3 2.3 0 0 0 3.9-2.2Z" />
      <circle cx="5.3" cy="18.5" r="2.3" fill="#34A853" />
    </>
  ),
  tiktok: (
    <path
      fill="#000000"
      d="M16.6 3h-3.2v12.4a2.8 2.8 0 1 1-2.8-2.8c.3 0 .6 0 .9.1V9.4a6.1 6.1 0 1 0 5.1 6V9.2a7.5 7.5 0 0 0 4.4 1.4V7.4a4.4 4.4 0 0 1-4.4-4.4Z"
    />
  ),
  sms_llamadas: (
    <>
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="#F22F46" strokeWidth="2" />
      <circle cx="9" cy="9" r="1.8" fill="#F22F46" />
      <circle cx="15" cy="9" r="1.8" fill="#F22F46" />
      <circle cx="9" cy="15" r="1.8" fill="#F22F46" />
      <circle cx="15" cy="15" r="1.8" fill="#F22F46" />
    </>
  ),
  sendgrid: (
    <>
      <path fill="#99E1F4" d="M3 9h6v6H3z" />
      <path fill="#1A82E2" d="M9 3h6v6H9zM9 9h6v6H9z" />
      <path fill="#00B3E3" d="M15 9h6v6h-6zM9 15h6v6H9z" />
    </>
  ),
  ubereats: (
    <>
      <text x="12" y="10.5" textAnchor="middle" fontSize="7.2" fontWeight="700" fontFamily="Arial, sans-serif" fill="#06C167">Uber</text>
      <text x="12" y="18.5" textAnchor="middle" fontSize="7.2" fontWeight="700" fontFamily="Arial, sans-serif" fill="#06C167">Eats</text>
    </>
  ),
  // Servicios de GO Admin: se pintan como recuadro de marca con «GO» (ver abajo).
  cobros_qr: null,
  facturacion_electronica: null,
  conectar_banco: null,
};

export function LogoServicio({ id, tamano = 'md', titulo, className }: LogoServicioProps) {
  const accesible = titulo ? { role: 'img' as const, 'aria-label': titulo } : { 'aria-hidden': true as const };

  if (SERVICIOS_GO.has(id)) {
    return (
      <span
        {...accesible}
        className={cn('inline-flex shrink-0 items-center justify-center bg-brand font-semibold text-fg-on-brand', CAJA[tamano], className)}
      >
        GO
      </span>
    );
  }

  if (tieneSimbolo(id) && SIMBOLOS[id]) {
    return (
      <span
        {...accesible}
        className={cn('inline-flex shrink-0 items-center justify-center border border-line bg-surface', CAJA[tamano], className)}
      >
        <svg viewBox="0 0 24 24" className={SIMBOLO[tamano]} aria-hidden="true" focusable="false">
          {SIMBOLOS[id]}
        </svg>
      </span>
    );
  }

  return (
    <span
      {...accesible}
      className={cn(
        'inline-flex shrink-0 items-center justify-center border border-line bg-surface font-medium text-fg-secondary',
        CAJA[tamano],
        className,
      )}
    >
      {inicialesDeServicio(id)}
    </span>
  );
}
