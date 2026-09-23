'use client';

import { X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { prepararMenu, type AccionFila } from './acciones';
import { useKitT } from './useIdiomaKit';

/**
 * Hoja de acciones móvil (Figma: «hoja de acciones» de Clientes y Proveedores
 * móvil, PATRONES §6.5): el mismo menú «⋯» a ancho completo, con el nombre del
 * registro de título, filas de 52 px con icono de 20 y lo destructivo al final
 * tras un divisor y en rojo.
 */
export interface ActionSheetProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** El registro sobre el que se actúa («Ferretería de ejemplo S.A.S.»). */
  titulo: string;
  descripcion?: string;
  acciones: readonly AccionFila[];
}

export function ActionSheet({ abierto, onAbiertoChange, titulo, descripcion, acciones }: ActionSheetProps) {
  const t = useKitT();
  const entradas = prepararMenu(acciones);

  const elegir = (accion: AccionFila) => {
    if (accion.deshabilitada) return;
    onAbiertoChange(false);
    // Tras cerrar la hoja, para que un ConfirmDialog que abra la acción tome el foco.
    setTimeout(accion.onSelect, 0);
  };

  return (
    <Sheet open={abierto} onOpenChange={onAbiertoChange}>
      <SheetContent
        side="bottom"
        hideCloseButton
        {...(descripcion ? {} : { 'aria-describedby': undefined })}
        className="flex max-h-[85dvh] flex-col gap-0 rounded-t-2xl border-line bg-surface p-0 pb-[env(safe-area-inset-bottom)]"
      >
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line-strong" />
        <div className="flex items-center justify-between gap-3 border-b border-line py-3 pl-4 pr-3">
          <div className="min-w-0">
            <SheetTitle className="truncate text-base font-semibold text-fg">{titulo}</SheetTitle>
            {descripcion && (
              <SheetDescription className="truncate text-[13px] text-fg-secondary">{descripcion}</SheetDescription>
            )}
          </div>
          <button
            type="button"
            onClick={() => onAbiertoChange(false)}
            aria-label={t('comun.cerrar')}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </button>
        </div>
        <ul role="menu" aria-label={t('menu.accionesDe', { titulo })} className="overflow-y-auto py-1">
          {entradas.map((e) =>
            e.tipo === 'separador' ? (
              <li key={e.id} role="separator" className="mx-2 my-1 h-px bg-line" />
            ) : (
              <li key={e.accion.id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  aria-disabled={e.accion.deshabilitada || undefined}
                  onClick={() => elegir(e.accion)}
                  className={cn(
                    'flex min-h-[52px] w-full items-center gap-4 px-5 py-2 text-left text-[15px] focus-visible:bg-hover focus-visible:outline-none active:bg-pressed',
                    e.accion.destructiva ? 'text-danger-text' : 'text-fg',
                    e.accion.deshabilitada && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <e.accion.icono aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.5} />
                  <span className="flex min-w-0 flex-col">
                    <span>{e.accion.etiqueta}</span>
                    {e.accion.descripcion && <span className="text-xs text-fg-secondary">{e.accion.descripcion}</span>}
                    {e.accion.deshabilitada && e.accion.motivo && (
                      <span className="text-xs text-fg-muted">{e.accion.motivo}</span>
                    )}
                  </span>
                </button>
              </li>
            ),
          )}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
