'use client';

import { useEffect, useState } from 'react';
import { Clock, Lock, LockOpen, ShoppingCart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BranchBadgeActiva, Kbd, KbdButton } from '@/components/kit';
import { CustomerDisplayIndicator } from '@/components/pos/display/CustomerDisplayIndicator';
import { PendientesSinConexionDialog } from '@/components/pos/PendientesSinConexionDialog';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';
import { teclaAtajo } from '@/lib/pos/venta/atajos';
import { cn } from '@/utils/Utils';

/**
 * Cabecera del POS en escritorio y tableta (Figma `184:31793` sin caja,
 * `184:31722` caja abierta, `184:31864` otro cajero, `184:31935` recargando;
 * POS-UX-V2 D1): título, organización y sucursal; «Abrir caja · F9» /
 * «Cerrar caja · F9»; pendientes sin conexión (Desktop); reloj en la zona de
 * la organización; pantalla del cliente con su `Kbd` F10; contadores de
 * carritos de la sucursal (activos / en espera, los mismos de las pestañas).
 *
 * En celular no se dibuja: la lleva el `MobileHeader Mode=pos` y su «⋯» abre
 * `HojaCajaDispositivo`. Los diálogos de apertura y cierre los monta la
 * página (se abren también con F9 y desde la hoja).
 *
 * Quién puede cerrar la caja lo decide la página con `puedeCerrarCaja` y los
 * permisos del servidor; aquí solo se pinta.
 */
export interface CabeceraPosProps {
  organizacionNombre?: string | null;
  cajaAbierta: boolean;
  /** Hay caja abierta pero la abrió otro cajero y este no puede cerrarla. */
  cierreBloqueado: boolean;
  onCaja: () => void;
  carritosActivos: number;
  carritosEnEspera: number;
  className?: string;
}

/** Hora actual en la zona de la organización, refrescada cada 30 s. */
export function useHoraOrganizacion(): string {
  const { timezone } = useOrgTimezone();
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return formatTimeInTz(ahora, timezone);
}

export function CabeceraPos({
  organizacionNombre,
  cajaAbierta,
  cierreBloqueado,
  onCaja,
  carritosActivos,
  carritosEnEspera,
  className,
}: CabeceraPosProps) {
  const t = useTranslations('posVenta.cabecera');
  const hora = useHoraOrganizacion();
  const f9 = teclaAtajo('caja');

  return (
    <header
      className={cn('hidden shrink-0 items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm lg:flex', className)}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
          <ShoppingCart className="size-5" strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="truncate text-lg font-semibold leading-6 text-fg">{t('titulo')}</h1>
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm text-fg-secondary">{organizacionNombre || t('subtituloSinOrganizacion')}</p>
            <BranchBadgeActiva />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {cajaAbierta ? (
          <KbdButton
            variante="destructivo"
            tamano="md"
            icono={Lock}
            atajo={f9}
            onClick={onCaja}
            disabled={cierreBloqueado}
            title={cierreBloqueado ? t('cierreBloqueado') : undefined}
          >
            {t('cerrarCaja')}
          </KbdButton>
        ) : (
          <KbdButton variante="primario" tamano="md" icono={LockOpen} atajo={f9} onClick={onCaja}>
            {t('abrirCaja')}
          </KbdButton>
        )}

        {/* Ventas, clientes y caja sin conexión pendientes de sincronizar (solo Desktop). */}
        <PendientesSinConexionDialog />

        <span className="flex items-center gap-1.5 text-sm tabular-nums text-fg-secondary" aria-label={t('hora', { hora })}>
          <Clock aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
          <span aria-hidden="true">{hora}</span>
        </span>

        <span className="flex items-center gap-1" data-pos-indicador-pantalla="">
          <CustomerDisplayIndicator />
          <Kbd tecla={teclaAtajo('pantallaCliente')} className="hidden xl:inline-flex" />
        </span>

        <div className="flex items-center gap-1.5" aria-label={t('contadores')} role="group">
          <span className="inline-flex h-6 items-center rounded-full border border-line-success bg-success-subtle px-2.5 text-xs font-semibold text-success-text">
            {t('activos', { n: carritosActivos })}
          </span>
          <span className="inline-flex h-6 items-center rounded-full border border-line-warning bg-warning-subtle px-2.5 text-xs font-semibold text-warning-text">
            {t('enEspera', { n: carritosEnEspera })}
          </span>
        </div>
      </div>
    </header>
  );
}

/**
 * F10: abre el menú de la pantalla del cliente. El indicador es un
 * `DropdownMenu` de Radix que se abre con Enter sobre su disparador; se le da
 * el foco y se le manda esa tecla (no se toca el indicador: lo fijan muchas
 * pruebas de la pantalla del cliente).
 */
export function abrirMenuPantallaCliente(raiz: ParentNode = document): boolean {
  const boton = raiz.querySelector<HTMLButtonElement>('[data-pos-indicador-pantalla] button');
  if (!boton) return false;
  boton.focus();
  boton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  return true;
}
