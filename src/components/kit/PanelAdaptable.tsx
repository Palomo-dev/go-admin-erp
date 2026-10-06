'use client';

import type { ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useEsEscritorio } from './useEsEscritorio';
import { useKitT } from './useIdiomaKit';

/**
 * Diálogo con cuerpo libre que en móvil es una hoja inferior (Figma «Meta y
 * canales»: `Dialog` en escritorio, `Sheet` con asa en móvil). A diferencia de
 * `Dialogo`, el pie no es fijo «Cancelar + primario»: lo pone la pantalla
 * (pestañas, varios botones o solo «Cerrar»).
 *
 * - Cabecera: icono en caja tintada de 40, título, descripción y «×».
 * - Cuerpo con scroll; `debajoCabecera` para pestañas (fijas, no hacen scroll).
 * - `pie`: fila inferior fija; en móvil los botones ocupan el ancho.
 */
export interface PanelAdaptableProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  titulo: string;
  descripcion?: ReactNode;
  icono?: LucideIcon;
  /**
   * Miniatura de 56 × 56 en lugar del icono (foto del producto o su marcador
   * sin foto). Cabecera de producto de `VariantModifierDialog` (155:7980):
   * con miniatura el título baja a H3 (16/22) y la descripción a Small (13/18).
   */
  miniatura?: ReactNode;
  /** Pestañas u otra fila fija bajo la cabecera. */
  debajoCabecera?: ReactNode;
  /** Línea pequeña sobre el título («Paso 1 de 3», Figma B/07-06). */
  antetitulo?: ReactNode;
  /**
   * Tono de la caja del icono, en círculo (resultados de un flujo: activo,
   * error, aviso; Figma B/07-09…07-20). Sin tono, la caja tintada de marca.
   */
  tonoIcono?: 'marca' | 'exito' | 'peligro' | 'advertencia' | 'informacion';
  /** El icono de la cabecera gira (fase en curso, B/07-16); se detiene con movimiento reducido. */
  iconoGirando?: boolean;
  /** En móvil, hoja a pantalla completa en lugar de hoja inferior (Figma B/07-26). */
  pantallaCompletaMovil?: boolean;
  /**
   * Controles de la cabecera, alineados a la derecha junto a la «×» (selector
   * de ancho 1440 / 1024 / 390 de la vista previa de plantilla, Figma A/06c).
   */
  accionesCabecera?: ReactNode;
  children: ReactNode;
  pie?: ReactNode;
  /** 1120: cobro del POS (resumen a la izquierda, pagos a la derecha). */
  ancho?: 520 | 560 | 672 | 800 | 1120;
  /** Bloquea el cierre (operación en curso). */
  ocupado?: boolean;
  /**
   * Un clic fuera no cierra (solo «×», Esc o los botones del pie). El cobro
   * del POS lo pide: un toque en un aviso (sonner) o en el fondo no puede
   * tirar los pagos ya tecleados.
   */
  bloquearClicFuera?: boolean;
  /**
   * Foco al abrir (Radix `onOpenAutoFocus`): por defecto el primer control
   * (la «×»). El cobro lo pone en el monto; `preventDefault()` para usarlo.
   */
  onFocoAlAbrir?: (evento: Event) => void;
  className?: string;
}

const ANCHO: Record<NonNullable<PanelAdaptableProps['ancho']>, string> = {
  520: 'sm:max-w-[520px]',
  560: 'sm:max-w-[560px]',
  672: 'sm:max-w-[672px]',
  800: 'sm:max-w-[800px]',
  1120: 'sm:max-w-[1120px]',
};

const TONO_ICONO: Record<NonNullable<PanelAdaptableProps['tonoIcono']>, string> = {
  marca: 'bg-brand-tint text-brand',
  exito: 'bg-success-subtle text-success-text',
  peligro: 'bg-danger-subtle text-danger-text',
  advertencia: 'bg-warning-subtle text-warning-text',
  informacion: 'bg-info-subtle text-info-text',
};

function Cabecera({ titulo, descripcion, icono: Icono, miniatura, antetitulo, tonoIcono, iconoGirando, acciones, onCerrar, ocupado, escritorio }: { titulo: string; descripcion?: ReactNode; icono?: LucideIcon; miniatura?: ReactNode; antetitulo?: ReactNode; tonoIcono?: PanelAdaptableProps['tonoIcono']; iconoGirando?: boolean; acciones?: ReactNode; onCerrar: () => void; ocupado?: boolean; escritorio: boolean }) {
  const t = useKitT();
  const Titulo = escritorio ? DialogTitle : SheetTitle;
  const Descripcion = escritorio ? DialogDescription : SheetDescription;
  return (
    <div className="flex items-start gap-3 px-5 pb-3 pt-4">
      {miniatura ? (
        <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-subtle text-fg-muted">{miniatura}</span>
      ) : (
        Icono && (
          <span className={cn('flex size-10 shrink-0 items-center justify-center', tonoIcono ? `rounded-full ${TONO_ICONO[tonoIcono]}` : 'rounded-xl bg-brand-tint text-brand')} aria-hidden="true">
            <Icono className={cn('size-5', iconoGirando && 'animate-spin motion-reduce:animate-none')} strokeWidth={1.75} />
          </span>
        )
      )}
      <div className={cn('flex min-w-0 flex-1 flex-col gap-0.5', miniatura && 'self-center')}>
        {antetitulo ? <span className="text-xs font-medium leading-4 text-link">{antetitulo}</span> : null}
        <Titulo className={cn('font-semibold text-fg', miniatura ? 'text-base leading-[22px]' : 'text-lg leading-6')}>{titulo}</Titulo>
        {descripcion ? (
          <Descripcion className={cn('text-fg-secondary', miniatura ? 'text-[13px] leading-[18px]' : 'text-sm leading-5')}>{descripcion}</Descripcion>
        ) : (
          <Descripcion className="sr-only">{titulo}</Descripcion>
        )}
      </div>
      {acciones ? <div className="flex shrink-0 items-center gap-2">{acciones}</div> : null}
      <button
        type="button"
        aria-label={t('comun.cerrar')}
        disabled={ocupado}
        onClick={onCerrar}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
      >
        <X aria-hidden="true" className="size-5" strokeWidth={1.5} />
      </button>
    </div>
  );
}

export function PanelAdaptable({ abierto, onAbiertoChange, titulo, descripcion, icono, miniatura, debajoCabecera, antetitulo, tonoIcono, iconoGirando, pantallaCompletaMovil, accionesCabecera, children, pie, ancho = 672, ocupado, bloquearClicFuera, onFocoAlAbrir, className }: PanelAdaptableProps) {
  const escritorio = useEsEscritorio();
  const cambiar = (v: boolean) => {
    if (ocupado && !v) return;
    onAbiertoChange(v);
  };
  const propsContenido = {
    ...(bloquearClicFuera ? { onInteractOutside: (e: Event) => e.preventDefault() } : {}),
    ...(onFocoAlAbrir ? { onOpenAutoFocus: onFocoAlAbrir } : {}),
  };
  const cuerpo = (
    <>
      <Cabecera titulo={titulo} descripcion={descripcion} icono={icono} miniatura={miniatura} antetitulo={antetitulo} tonoIcono={tonoIcono} iconoGirando={iconoGirando} acciones={accionesCabecera} onCerrar={() => cambiar(false)} ocupado={ocupado} escritorio={escritorio} />
      {debajoCabecera && <div className="border-b border-line px-5">{debajoCabecera}</div>}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">{children}</div>
      {pie && <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-end">{pie}</div>}
    </>
  );

  if (escritorio) {
    return (
      <Dialog open={abierto} onOpenChange={cambiar}>
        <DialogContent
          hideCloseButton
          {...propsContenido}
          className={cn('flex max-h-[calc(100dvh-48px)] w-[calc(100%-32px)] max-w-none flex-col gap-0 overflow-hidden rounded-xl border-line bg-surface p-0 text-fg sm:rounded-xl', ANCHO[ancho], className)}
        >
          {cuerpo}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open={abierto} onOpenChange={cambiar}>
      <SheetContent
        side="bottom"
        hideCloseButton
        {...propsContenido}
        className={cn(
          'flex flex-col gap-0 overflow-hidden border-line bg-surface p-0 text-fg',
          pantallaCompletaMovil ? 'h-[100dvh] max-h-[100dvh] rounded-none' : 'max-h-[92dvh] rounded-t-2xl',
          className,
        )}
      >
        {!pantallaCompletaMovil && <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />}
        {cuerpo}
      </SheetContent>
    </Sheet>
  );
}
