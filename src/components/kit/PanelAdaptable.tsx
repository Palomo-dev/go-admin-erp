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

function Cabecera({ titulo, descripcion, icono: Icono, miniatura, onCerrar, ocupado, escritorio }: { titulo: string; descripcion?: ReactNode; icono?: LucideIcon; miniatura?: ReactNode; onCerrar: () => void; ocupado?: boolean; escritorio: boolean }) {
  const t = useKitT();
  const Titulo = escritorio ? DialogTitle : SheetTitle;
  const Descripcion = escritorio ? DialogDescription : SheetDescription;
  return (
    <div className="flex items-start gap-3 px-5 pb-3 pt-4">
      {miniatura ? (
        <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-subtle text-fg-muted">{miniatura}</span>
      ) : (
        Icono && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand" aria-hidden="true">
            <Icono className="size-5" strokeWidth={1.75} />
          </span>
        )
      )}
      <div className={cn('flex min-w-0 flex-1 flex-col gap-0.5', miniatura && 'self-center')}>
        <Titulo className={cn('font-semibold text-fg', miniatura ? 'text-base leading-[22px]' : 'text-lg leading-6')}>{titulo}</Titulo>
        {descripcion ? (
          <Descripcion className={cn('text-fg-secondary', miniatura ? 'text-[13px] leading-[18px]' : 'text-sm leading-5')}>{descripcion}</Descripcion>
        ) : (
          <Descripcion className="sr-only">{titulo}</Descripcion>
        )}
      </div>
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

export function PanelAdaptable({ abierto, onAbiertoChange, titulo, descripcion, icono, miniatura, debajoCabecera, children, pie, ancho = 672, ocupado, bloquearClicFuera, onFocoAlAbrir, className }: PanelAdaptableProps) {
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
      <Cabecera titulo={titulo} descripcion={descripcion} icono={icono} miniatura={miniatura} onCerrar={() => cambiar(false)} ocupado={ocupado} escritorio={escritorio} />
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
      <SheetContent side="bottom" hideCloseButton {...propsContenido} className={cn('flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-2xl border-line bg-surface p-0 text-fg', className)}>
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />
        {cuerpo}
      </SheetContent>
    </Sheet>
  );
}
