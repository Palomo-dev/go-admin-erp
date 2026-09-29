'use client';

/**
 * Piezas pequeñas del kit de acceso (Figma `02 Componentes`, docs/design/AUTH-ACCESO-V2.md
 * §11.3): `Enlace` 1125:35312, `DividerTexto` 1125:35314, `IconoDestacado`
 * 1125:35346, `PieEnlace` 1125:35348, `ProgresoPasos` 1126:35349, `AuthAlert`
 * 351:137890 (aquí `AvisoAcceso`) y `OAuthButton` 351:137865 (aquí `BotonGoogle`).
 *
 * Solo tokens semánticos: nada de `dark:` ni hex (salvo el logotipo de Google,
 * que es una marca registrada y va con sus colores oficiales).
 */
import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';

// ---------------------------------------------------------------------------
// Enlace
// ---------------------------------------------------------------------------

export type TonoEnlace = 'marca' | 'neutro' | 'sobre-color';

const TONO_ENLACE: Record<TonoEnlace, string> = {
  marca: 'text-link hover:text-brand-action-hover',
  neutro: 'text-fg-secondary hover:text-fg',
  'sobre-color': 'text-white/90 hover:text-white',
};

export interface EnlaceProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  tono?: TonoEnlace;
  tamano?: 'sm' | 'md';
  icono?: LucideIcon;
  /** Navegación completa (sin router del cliente): cierres de sesión y enlaces externos. */
  externo?: boolean;
}

export function Enlace({ href, tono = 'marca', tamano = 'md', icono: Icono, externo, className, children, ...resto }: EnlaceProps) {
  const clases = cn(
    'inline-flex items-center gap-1 rounded-sm font-medium underline-offset-4 hover:underline',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
    tamano === 'sm' ? 'text-xs' : 'text-[13px]',
    TONO_ENLACE[tono],
    className,
  );
  const contenido = (
    <>
      {Icono && <Icono className="size-3.5" aria-hidden="true" />}
      {children}
    </>
  );
  if (externo || /^(https?:|mailto:)/.test(href)) {
    return (
      <a href={href} className={clases} {...resto}>
        {contenido}
      </a>
    );
  }
  return (
    <Link href={href} className={clases} {...resto}>
      {contenido}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// DividerTexto («o» entre dos líneas)
// ---------------------------------------------------------------------------

export function DividerTexto({ texto, className }: { texto?: string; className?: string }) {
  const t = useTranslations('acceso.comun');
  return (
    <div className={cn('flex items-center gap-3', className)} role="separator" aria-label={texto ?? t('o')}>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      <span className="text-xs text-fg-muted" aria-hidden="true">
        {texto ?? t('o')}
      </span>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// IconoDestacado (círculo de 56 px con el icono del estado)
// ---------------------------------------------------------------------------

export type TonoIcono = 'marca' | 'exito' | 'advertencia' | 'peligro' | 'neutro';

const TONO_ICONO: Record<TonoIcono, string> = {
  marca: 'bg-brand-tint text-brand-deep',
  exito: 'bg-success-subtle text-success-text',
  advertencia: 'bg-warning-subtle text-warning-text',
  peligro: 'bg-danger-subtle text-danger-text',
  neutro: 'bg-subtle text-fg-secondary',
};

export function IconoDestacado({ icono: Icono, tono = 'marca', className }: { icono: LucideIcon; tono?: TonoIcono; className?: string }) {
  return (
    <span className={cn('inline-flex size-14 items-center justify-center rounded-full', TONO_ICONO[tono], className)} aria-hidden="true">
      <Icono className="size-7" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// PieEnlace («¿No tienes cuenta? Crear cuenta»)
// ---------------------------------------------------------------------------

export function PieEnlace({ pregunta, enlace, href, className }: { pregunta?: string; enlace: string; href: string; className?: string }) {
  return (
    <p className={cn('text-center text-[13px] text-fg-secondary', className)}>
      {pregunta && <>{pregunta} </>}
      <Enlace href={href}>{enlace}</Enlace>
    </p>
  );
}

// ---------------------------------------------------------------------------
// ProgresoPasos («Paso 1 de 6 · Tu cuenta» + segmentos)
// ---------------------------------------------------------------------------

export interface ProgresoPasosProps {
  actual: number;
  total: number;
  etiqueta: string;
  className?: string;
}

export function ProgresoPasos({ actual, total, etiqueta, className }: ProgresoPasosProps) {
  const t = useTranslations('acceso.comun');
  const texto = t('pasoDe', { actual, total, etiqueta });
  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-xs font-medium text-fg-secondary">{texto}</p>
      <div
        className="flex gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={actual}
        aria-valuetext={texto}
      >
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-full', i < actual ? 'bg-brand-action' : 'bg-line')} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AvisoAcceso (AuthAlert: error · éxito · información · advertencia)
// ---------------------------------------------------------------------------

export type TonoAviso = 'error' | 'exito' | 'info' | 'advertencia';

const AVISO: Record<TonoAviso, { clases: string; icono: LucideIcon }> = {
  error: { clases: 'border-line-danger bg-danger-subtle text-danger-text', icono: AlertCircle },
  exito: { clases: 'border-line-success bg-success-subtle text-success-text', icono: CheckCircle2 },
  info: { clases: 'border-line-info bg-info-subtle text-info-text', icono: Info },
  advertencia: { clases: 'border-line-warning bg-warning-subtle text-warning-text', icono: AlertTriangle },
};

export interface AvisoAccesoProps {
  tono: TonoAviso;
  titulo?: string;
  children?: React.ReactNode;
  className?: string;
  /** Acción al pie del aviso (reenviar, crear cuenta). */
  accion?: React.ReactNode;
}

export const AvisoAcceso = React.forwardRef<HTMLDivElement, AvisoAccesoProps>(function AvisoAcceso(
  { tono, titulo, children, className, accion },
  ref,
) {
  const { clases, icono: Icono } = AVISO[tono];
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={tono === 'error' || tono === 'advertencia' ? 'alert' : 'status'}
      className={cn('flex gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] leading-5 outline-none', clases, className)}
    >
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children && <div>{children}</div>}
        {accion && <div className="pt-1">{accion}</div>}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// BotonGoogle (OAuthButton)
// ---------------------------------------------------------------------------

function LogoGoogle() {
  // Colores oficiales del logotipo de Google (marca registrada: no se recolorea).
  return (
    <svg className="size-[18px]" viewBox="0 0 23 23" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115Z" />
      <path fill="#34A853" d="M16.04 18.013c-1.09.703-2.474 1.078-4.04 1.078a7.077 7.077 0 0 1-6.723-4.823l-4.04 3.067A11.965 11.965 0 0 0 12 24c2.933 0 5.735-1.043 7.834-3l-3.793-2.987Z" />
      <path fill="#4A90E2" d="M19.834 21c2.195-2.048 3.62-5.096 3.62-9 0-.71-.109-1.473-.272-2.182H12v4.637h6.436c-.317 1.559-1.17 2.766-2.395 3.558L19.834 21Z" />
      <path fill="#FBBC05" d="M5.277 14.268A7.12 7.12 0 0 1 4.909 12c0-.782.125-1.533.357-2.235L1.24 6.65A11.934 11.934 0 0 0 0 12c0 1.92.445 3.73 1.237 5.335l4.04-3.067Z" />
    </svg>
  );
}

function LogoMicrosoft() {
  return (
    <svg className="size-[18px]" viewBox="0 0 23 23" aria-hidden="true" focusable="false">
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}

export function BotonProveedor({
  proveedor,
  texto,
  onClick,
  disabled,
}: {
  proveedor: 'google' | 'microsoft';
  texto: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg',
        'transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      {proveedor === 'google' ? <LogoGoogle /> : <LogoMicrosoft />}
      {texto}
    </button>
  );
}
