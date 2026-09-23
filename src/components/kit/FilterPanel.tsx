'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Info, X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { FilterButton } from './FilterButton';
import { useEsEscritorio } from './useEsEscritorio';

/**
 * Panel de filtros (Figma `FilterPanel`, PATRONES §3 y §11) con su botón.
 *
 * - Escritorio: popover de 360 px pegado al botón (8 px por debajo, voltea si
 *   no cabe). Los cambios se aplican al instante.
 * - Móvil: hoja inferior con «Limpiar (n)», × y un botón fijo al pie
 *   («Ver 42 clientes») que cierra la hoja.
 *
 * Los campos son de la pantalla (FormField + Select, SegmentedControl,
 * Checkbox…): el panel solo pone la carcasa. **Nunca un filtro de sucursal**:
 * la sucursal es el selector del header (PATRONES §9).
 */
export interface FilterPanelProps {
  /** Filtros activos: contador del botón y de «Limpiar (n)». */
  conteo: number;
  onLimpiar: () => void;
  children: React.ReactNode;
  titulo?: string;
  /** Nota al pie del popover de escritorio. */
  nota?: string;
  /** Texto del botón del pie en móvil («Ver 42 clientes»). */
  textoVerResultados?: string;
  abierto?: boolean;
  onAbiertoChange?: (abierto: boolean) => void;
  etiquetaBoton?: string;
  className?: string;
}

function Cabecera({
  titulo,
  conteo,
  onLimpiar,
  onCerrar,
  enHoja,
}: {
  titulo: string;
  conteo: number;
  onLimpiar: () => void;
  onCerrar?: () => void;
  enHoja: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      {enHoja ? (
        <SheetTitle className="text-base font-semibold text-fg">{titulo}</SheetTitle>
      ) : (
        <h2 className="text-base font-semibold text-fg">{titulo}</h2>
      )}
      <div className="flex items-center gap-2">
        {conteo > 0 && (
          <button
            type="button"
            onClick={onLimpiar}
            className="rounded-md px-1 text-[13px] font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Limpiar ({conteo})
          </button>
        )}
        {onCerrar && (
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar filtros"
            className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
}

export function FilterPanel({
  conteo,
  onLimpiar,
  children,
  titulo = 'Filtros',
  nota = 'Se aplican al instante · cada filtro activo queda como chip bajo el buscador',
  textoVerResultados = 'Ver resultados',
  abierto: abiertoControlado,
  onAbiertoChange,
  etiquetaBoton,
  className,
}: FilterPanelProps) {
  const [abiertoInterno, setAbiertoInterno] = React.useState(false);
  const abierto = abiertoControlado ?? abiertoInterno;
  const setAbierto = (v: boolean) => {
    setAbiertoInterno(v);
    onAbiertoChange?.(v);
  };
  const escritorio = useEsEscritorio();

  if (escritorio) {
    return (
      <PopoverPrimitive.Root open={abierto} onOpenChange={setAbierto}>
        <PopoverPrimitive.Trigger asChild>
          <FilterButton conteo={conteo} abierto={abierto} etiqueta={etiquetaBoton} className={className} />
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="end"
            sideOffset={8}
            collisionPadding={16}
            aria-label={titulo}
            className="z-50 flex max-h-[min(640px,var(--radix-popover-content-available-height))] w-[360px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl border border-line bg-surface text-fg shadow-lg outline-none"
          >
            <Cabecera titulo={titulo} conteo={conteo} onLimpiar={onLimpiar} enHoja={false} />
            <div className="flex flex-col gap-4 overflow-y-auto p-4">{children}</div>
            {nota && (
              <p className="flex items-start gap-2 border-t border-line px-4 py-3 text-xs leading-4 text-fg-muted">
                <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />
                {nota}
              </p>
            )}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    );
  }

  return (
    <>
      <FilterButton
        conteo={conteo}
        abierto={abierto}
        etiqueta={etiquetaBoton}
        className={className}
        onClick={() => setAbierto(true)}
      />
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent
          side="bottom"
          hideCloseButton
          aria-describedby={undefined}
          className="flex max-h-[90dvh] flex-col gap-0 rounded-t-2xl border-line bg-surface p-0"
        >
          <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line-strong" />
          <Cabecera titulo={titulo} conteo={conteo} onLimpiar={onLimpiar} onCerrar={() => setAbierto(false)} enHoja />
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">{children}</div>
          <div className="border-t border-line p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className={cn(
                'flex h-12 w-full items-center justify-center rounded-lg bg-brand-action text-base font-medium text-fg-on-brand',
                'hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
              )}
            >
              {textoVerResultados}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
